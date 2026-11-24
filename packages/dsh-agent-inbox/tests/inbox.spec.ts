import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { apply, argumentCount } from '../src/index.ts'
import { changes, parseStatus, preview } from '../src/host/git.ts'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('approval summary', () => {
  it('exposes only the argument count', () => {
    expect(argumentCount('{"token":"secret","script":"sensitive"}')).toBe(2)
    expect(argumentCount('invalid')).toBeUndefined()
    expect(argumentCount('"secret"')).toBeUndefined()
    expect(argumentCount(' '.repeat(100_000))).toBeUndefined()
  })
})

describe('Git file inventory', () => {
  it('retains whitespace and separates NUL-terminated entries', () => {
    expect(parseStatus(' M a file\0?? line\nbreak\0 D deleted\0')).toEqual([
      { status: ' M', path: 'a file' },
      { status: '??', path: 'line\nbreak' },
      { status: ' D', path: 'deleted' },
    ])
  })
})

it('preserves the official answerer while accepting a local decision at most once', async () => {
  const sessionId = '44793428-2312-4efd-90e0-5c0fda610931'
  const session = { id: sessionId, seq: 0 }
  let id = ''
  const scope = { principalId: 'local-owner', source: 'desktop' }
  let current: typeof scope | undefined = scope
  let onApproval!: (request: { agent: { session: typeof session }; toolName: string; signal: AbortSignal }, next: () => Promise<string>) => Promise<string>
  let route!: WebRoute
  const cleanup: (() => void)[] = []
  apply({
    get: (key: string) => key === 'desktopAgentInbox' ? true : undefined,
    on: (_event: string, handler: typeof onApproval) => { onApproval = handler },
    effect: (callback: () => () => void) => { cleanup.push(callback()) },
    sessions: { list: () => [session] },
    userScope: { desktopScope: () => scope, currentScope: () => current, canAccess: () => ({ allowed: true }) },
    webServer: { register: (row: WebRoute) => { route = row; return () => {} } },
  } as unknown as Context)
  const abort = new AbortController()
  let official!: (answer: string) => void
  const downstream = new Promise<string>(resolve => { official = resolve })
  const approval = onApproval({ agent: { session }, toolName: 'write', signal: abort.signal }, () => downstream)
  async function call(action: string, method = 'GET') {
    let code = 0
    let result: unknown
    await route.handler({
      url: '/api/dsh-agent-inbox/' + action,
      method,
      headers: { 'x-dsh-agent-inbox': '1', 'x-dsh-approval-id': id, 'x-dsh-approval-decision': 'allowed-once' },
      socket: { remoteAddress: '127.0.0.1' },
    } as Parameters<WebRoute['handler']>[0], {
      writeHead(value: number) { code = value },
      end(text: string) { result = JSON.parse(text) },
    } as Parameters<WebRoute['handler']>[1], { principal: { kind: 'owner' } } as Parameters<WebRoute['handler']>[2])
    return { code, result }
  }

  current = undefined
  expect((await call('decision', 'POST')).code).toBe(403)
  current = scope
  const pending = (await call('pending')).result as { id: string; sessionId: string; toolName: string }[]
  expect(pending).toEqual([expect.objectContaining({ sessionId, toolName: 'write' })])
  id = pending[0].id
  expect((await call('decision', 'POST')).code).toBe(200)
  expect(await approval).toBe('allowed-once')
  expect((await call('decision', 'POST')).code).toBe(409)
  official('rejected')
  for (const dispose of cleanup) dispose()
})

it('reports scoped Git changes and loads a literal file diff', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-inbox-test-')))
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'ignore' })
    git('init')
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    await writeFile(join(workspace, 'file name.txt'), 'old\n')
    await writeFile(join(root, 'outside.txt'), 'old\n')
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture')
    await writeFile(join(workspace, 'file name.txt'), 'old\nnew\n')
    await writeFile(join(root, 'outside.txt'), 'changed\n')
    expect((await changes(workspace)).files).toEqual([{ path: 'file name.txt', status: ' M', added: 1, removed: 0 }])
    expect((await preview(workspace, 'file name.txt'))?.text).toContain('+new')
    expect(await preview(workspace, '../outside.txt')).toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})
