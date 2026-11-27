import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShadowGit } from '../src/core/shadow-git.ts'

const gitPath = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['git'], { encoding: 'utf8' })
  .split(/\r?\n/u).find(isAbsolute)!
const roots: string[] = []
const sessionId = 'session-for-undo'

function cleanGit(workspace: string, args: string[]): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/iu.test(name)))
  return execFileSync(gitPath, ['-c', 'core.hooksPath=', '-C', workspace, ...args], {
    env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-shadow-git-test-')))
  roots.push(root)
  const workspace = join(root, 'workspace')
  const homePath = join(root, 'home')
  await mkdir(workspace)
  await mkdir(homePath)
  return { root, workspace, homePath, engine: new ShadowGit({ homePath, gitPath, maxFileBytes: 1024 * 1024 }) }
}

async function manifestFile(homePath: string): Promise<string> {
  const parent = join(homePath, 'checkpoints')
  const [key] = await readdir(parent)
  return join(parent, key!, 'repo.git', 'manifest.json')
}

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await rm(root, { force: true, recursive: true })
})

describe('isolated workspace checkpoints', () => {
  it('runs thirty real snapshot/restore cycles and leaves user Git, ignored files and nested repositories intact', async () => {
    const { workspace, root, homePath, engine } = await fixture()
    cleanGit(workspace, ['init', '--initial-branch=main'])
    await writeFile(join(workspace, 'main.txt'), 'committed\n')
    cleanGit(workspace, ['add', 'main.txt'])
    cleanGit(workspace, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', 'fixture'])
    await writeFile(join(workspace, 'main.txt'), 'editor-only\n')
    await writeFile(join(workspace, '.env'), 'fixture secret')
    await mkdir(join(workspace, 'node_modules'))
    await writeFile(join(workspace, 'node_modules', 'keep.txt'), 'fixture dependency')
    await mkdir(join(workspace, 'nested'))
    cleanGit(join(workspace, 'nested'), ['init'])
    await writeFile(join(workspace, 'nested', 'outside.txt'), 'fixture nested data')
    await writeFile(join(workspace, 'large.dat'), Buffer.alloc(1024 * 1024 + 1, 6))
    await mkdir(join(root, 'hooks'))
    await writeFile(join(root, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 91\n', { mode: 0o755 })
    await writeFile(join(root, 'global.gitconfig'), '[core]\n\thooksPath = hooks\n\tautocrlf = true\n[filter "stop"]\n\trequired = true\n\tclean = false\n')
    await writeFile(join(workspace, '.gitattributes'), '*.txt filter=stop\n')
    await writeFile(join(workspace, '.gitignore'), 'private.log\n')
    await writeFile(join(workspace, 'private.log'), 'fixture ignored data')
    const gitHead = await readFile(join(workspace, '.git', 'HEAD'))
    const gitIndex = await readFile(join(workspace, '.git', 'index'))
    const gitLog = cleanGit(workspace, ['log', '--format=%H'])
    const nestedHead = await readFile(join(workspace, 'nested', '.git', 'HEAD'))
    vi.stubEnv('GIT_DIR', join(workspace, '.git'))
    vi.stubEnv('GIT_WORK_TREE', join(root, 'hooks'))
    vi.stubEnv('GIT_INDEX_FILE', join(workspace, '.git', 'index'))
    vi.stubEnv('GIT_OBJECT_DIRECTORY', join(workspace, '.git', 'objects'))
    vi.stubEnv('GIT_CONFIG_GLOBAL', join(root, 'global.gitconfig'))
    vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('GIT_CONFIG_KEY_0', 'filter.stop.clean')
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'false')

    await mkdir(join(workspace, 'data'))
    await Promise.all(Array.from({ length: 1_000 }, (_, i) => writeFile(join(workspace, 'data', `${i}.txt`), `original ${i}\n`)))
    const baseline = await engine.capture(workspace, { sessionId, source: 'pre-turn' })
    expect(baseline?.skippedLargeFiles).toEqual(['large.dat'])
    expect(baseline?.stats.filesChanged).toBe(1003)
    const times: number[] = []
    for (let i = 0; i < 30; i++) {
      const turnId = `turn-${i}`
      const dataFile = join(workspace, 'data', `${i}.txt`)
      const newFile = join(workspace, `added-${i}.txt`)
      await writeFile(dataFile, `updated ${i}\r\n`)
      await writeFile(newFile, `new ${i}\r\n`)
      const before = performance.now()
      const snapshot = await engine.capture(workspace, { sessionId, turnId, source: 'post-turn' })
      times.push(performance.now() - before)
      expect(snapshot?.stats.filesChanged).toBe(2)
      const preview = await engine.previewRestore(workspace, baseline!.checkpointId)
      expect(preview.files.map(file => file.path).sort()).toEqual([`added-${i}.txt`, `data/${i}.txt`])
      const restored = await engine.restore(workspace, { checkpointId: baseline!.checkpointId, sessionId, turnId, token: preview.token })
      expect(restored.undoCheckpoint.source).toBe('pre-restore')
      expect(await readFile(dataFile, 'utf8')).toBe(`original ${i}\n`)
      await expect(readFile(newFile)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    const snapshots = await engine.list(workspace, sessionId)
    const undo = snapshots.find(checkpoint => checkpoint.source === 'pre-restore' && checkpoint.turnId === 'turn-29')!
    const preview = await engine.previewRestore(workspace, undo.checkpointId, ['data/29.txt'])
    await engine.restore(workspace, { checkpointId: undo.checkpointId, sessionId, token: preview.token, paths: ['data/29.txt'] })
    expect(await readFile(join(workspace, 'data', '29.txt'), 'utf8')).toBe('updated 29\r\n')
    await expect(readFile(join(workspace, 'added-29.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(workspace, '.git', 'HEAD'))).toEqual(gitHead)
    expect(await readFile(join(workspace, '.git', 'index'))).toEqual(gitIndex)
    expect(cleanGit(workspace, ['log', '--format=%H'])).toBe(gitLog)
    expect(await readFile(join(workspace, 'main.txt'), 'utf8')).toBe('editor-only\n')
    expect(await readFile(join(workspace, 'nested', '.git', 'HEAD'))).toEqual(nestedHead)
    expect(await readFile(join(workspace, 'nested', 'outside.txt'), 'utf8')).toBe('fixture nested data')
    expect(await readFile(join(workspace, '.env'), 'utf8')).toBe('fixture secret')
    expect(await readFile(join(workspace, 'node_modules', 'keep.txt'), 'utf8')).toBe('fixture dependency')
    expect(await readFile(join(workspace, 'private.log'), 'utf8')).toBe('fixture ignored data')
    await expect(readFile(join(workspace, '.git_disabled'))).rejects.toMatchObject({ code: 'ENOENT' })
    const shadowRepo = join((await manifestFile(homePath)), '..')
    const published = await engine.list(workspace)
    const refs = cleanGit(shadowRepo, ['for-each-ref', '--format=%(refname)']).split('\n')
    expect(refs.filter(name => name.startsWith('refs/dsh/checkpoints/'))).toHaveLength(published.length)
    expect(refs.filter(name => name.startsWith('refs/dsh/sessions/'))).toHaveLength(1)
    expect(cleanGit(shadowRepo, ['reflog', 'list'])).toBe('')
    const p95 = times.toSorted((a, b) => a - b)[Math.ceil(times.length * .95) - 1]!
    console.log(`Shadow Git 1,000-file incremental capture P95 ${p95.toFixed(2)} ms`)
    expect(p95).toBeLessThan(300)
  }, 150_000)

  it('uses an exact file selection and refuses a stale preview or a junction replacing the file parent', async () => {
    const { workspace, root, engine } = await fixture()
    await mkdir(join(workspace, 'src'))
    await writeFile(join(workspace, 'src', '中文.txt'), 'original\r\n')
    const baseline = (await engine.capture(workspace, { sessionId, source: 'pre-turn' }))!
    expect(await engine.capture(workspace, { sessionId, source: 'post-turn' })).toBeUndefined()
    await writeFile(join(workspace, 'src', '中文.txt'), 'updated\n')
    const checkpoint = (await engine.capture(workspace, { sessionId, turnId: 'turn-1', source: 'post-turn' }))!
    const diff = await engine.diff(workspace, checkpoint.checkpointId, { path: 'src/中文.txt', baseCheckpointId: baseline.checkpointId })
    expect(diff.files).toEqual([{ path: 'src/中文.txt', status: 'modified', insertions: 1, deletions: 1, binary: false }])
    expect(diff.patch).toContain('+updated')
    const preview = await engine.previewRestore(workspace, baseline.checkpointId, ['src/中文.txt'])
    await writeFile(join(workspace, 'src', '中文.txt'), 'external editor\n')
    await expect(engine.restore(workspace, { checkpointId: baseline.checkpointId, sessionId, token: preview.token, paths: ['src/中文.txt'] })).rejects.toThrow()
    expect(await readFile(join(workspace, 'src', '中文.txt'), 'utf8')).toBe('external editor\n')
    await rm(join(workspace, 'src', '中文.txt'))
    await rm(join(workspace, 'src'), { recursive: true })
    const outside = join(root, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, '中文.txt'), 'unrelated outside file')
    await symlink(outside, join(workspace, 'src'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(engine.previewRestore(workspace, baseline.checkpointId, ['src/中文.txt'])).rejects.toThrow()
    expect(await readFile(join(outside, '中文.txt'), 'utf8')).toBe('unrelated outside file')
    await expect(engine.previewRestore(workspace, baseline.checkpointId, ['../outside/中文.txt'])).rejects.toThrow()
  }, 30_000)

  it('takes over a manifest lock after its actual owner process has been killed', async () => {
    const { workspace, homePath, engine } = await fixture()
    await writeFile(join(workspace, 'sample.txt'), 'before\n')
    const original = (await engine.capture(workspace, { sessionId, source: 'pre-turn' }))!
    const lock = (await manifestFile(homePath)) + '.lock'
    const child = spawn(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.pid + "\\n", {flag: "wx"}); console.log("locked"); setInterval(() => {}, 1000)', lock], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exit = once(child, 'exit')
    try {
      expect(String((await once(child.stdout, 'data'))[0])).toContain('locked')
    } finally {
      child.kill('SIGKILL')
      await exit
    }
    await writeFile(join(workspace, 'sample.txt'), 'after\n')
    const recovered = await engine.capture(workspace, { sessionId, source: 'post-turn' })
    expect(recovered?.parentHash).toBe(original.commitHash)
    expect(JSON.parse(await readFile(await manifestFile(homePath), 'utf8')).checkpoints).toHaveLength(2)
    await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' })
  }, 20_000)

  it('honors anchored, ordered and nested Git ignore rules before staging any bytes', async () => {
    const { workspace, homePath, engine } = await fixture()
    await mkdir(join(workspace, 'nested'))
    await mkdir(join(workspace, 'hidden'))
    await writeFile(join(workspace, '.gitignore'), [
      '# ordinary comment', '\\#secret.txt', '/root-only.txt', '*.log', 'hidden/', '!hidden/pinned.txt', '',
    ].join('\n'))
    await writeFile(join(workspace, 'nested', '.gitignore'), '!saved.log\n/anchored.txt\n')
    for (const file of ['#secret.txt', 'root-only.txt', 'plain.log', 'hidden/pinned.txt', 'nested/anchored.txt', 'nested/ignored.log']) {
      await writeFile(join(workspace, ...file.split('/')), 'ignored fixture bytes\n')
    }
    for (const file of ['visible.txt', 'nested/root-only.txt', 'nested/saved.log']) {
      await writeFile(join(workspace, ...file.split('/')), 'tracked fixture bytes\n')
    }
    const checkpoint = (await engine.capture(workspace, { sessionId, source: 'pre-turn' }))!
    const files = (await engine.diff(workspace, checkpoint.checkpointId)).files.map(file => file.path).sort()
    expect(files).toEqual(['.gitignore', 'nested/.gitignore', 'nested/root-only.txt', 'nested/saved.log', 'visible.txt'])
    const repo = join((await manifestFile(homePath)), '..')
    expect(cleanGit(repo, ['rev-parse', '--show-object-format'])).toBe('sha256')
    expect(cleanGit(repo, ['fsck', '--no-reflogs', '--no-dangling'])).toBe('')
    await writeFile(join(workspace, '.gitignore'), 'visible.txt\n')
    await rm(join(workspace, 'visible.txt'))
    await expect(engine.previewRestore(workspace, checkpoint.checkpointId, ['visible.txt'])).rejects.toThrow('excluded path')
  }, 30_000)

  it('finalizes the last write as a completed turn and reports aggregate edits against the first baseline', async () => {
    const { workspace, engine } = await fixture()
    await writeFile(join(workspace, 'one.txt'), 'one\n')
    await writeFile(join(workspace, 'two.txt'), 'two\n')
    const turnId = 'turn-with-two-writes'
    const baseline = (await engine.capture(workspace, { sessionId, turnId, source: 'pre-turn' }))!
    const baseCheckpointId = baseline.checkpointId
    await writeFile(join(workspace, 'one.txt'), 'first\n')
    await engine.capture(workspace, { sessionId, turnId, source: 'post-tool', baseCheckpointId })
    await writeFile(join(workspace, 'two.txt'), 'second\n')
    const last = (await engine.capture(workspace, { sessionId, turnId, source: 'post-tool', baseCheckpointId }))!
    const completed = await engine.capture(workspace, { sessionId, turnId, source: 'post-turn', baseCheckpointId })
    expect(completed?.checkpointId).toBe(last.checkpointId)
    expect(completed?.source).toBe('post-turn')
    expect(completed?.stats).toEqual({ filesChanged: 2, insertions: 2, deletions: 2 })
    const diff = await engine.diff(workspace, completed!.checkpointId, { summariesOnly: true })
    expect(diff.files.map(file => file.path).sort()).toEqual(['one.txt', 'two.txt'])
    expect(diff.patch).toBe('')
    expect(await engine.list(workspace, sessionId)).toHaveLength(3)
  }, 30_000)

  it('preserves the durable undo checkpoint if authorization is revoked mid-restore', async () => {
    const { workspace, engine } = await fixture()
    const first = join(workspace, 'first.txt')
    const second = join(workspace, 'second.txt')
    await writeFile(first, 'old first\n')
    await writeFile(second, 'old second\n')
    const baseline = (await engine.capture(workspace, { sessionId, source: 'pre-turn' }))!
    await writeFile(first, 'current first\n')
    await writeFile(second, 'current second\n')
    const initial = await engine.previewRestore(workspace, baseline.checkpointId)
    await expect(engine.restore(workspace, { checkpointId: baseline.checkpointId, sessionId, token: initial.token,
      beforeApply() {
        if (readFileSync(first, 'utf8') === 'old first\n') throw new Error('Authorization revoked')
      },
    })).rejects.toThrow('saved pre-restore checkpoint')
    expect(await readFile(first, 'utf8')).toBe('old first\n')
    expect(await readFile(second, 'utf8')).toBe('current second\n')
    const [undo] = await engine.list(workspace, sessionId)
    expect(undo?.source).toBe('pre-restore')
    const fresh = await engine.previewRestore(workspace, undo!.checkpointId)
    await engine.restore(workspace, { checkpointId: undo!.checkpointId, sessionId, token: fresh.token })
    expect(await readFile(first, 'utf8')).toBe('current first\n')
    expect(await readFile(second, 'utf8')).toBe('current second\n')
  }, 30_000)

  it('collects aged private references after a quiet interval and keeps the oldest visible diff readable', async () => {
    const { workspace, homePath } = await fixture()
    const engine = new ShadowGit({ homePath, gitPath, retention: { maxItems: 3 } })
    for (let turn = 0; turn < 5; turn++) {
      await writeFile(join(workspace, 'prune.txt'), `turn ${turn}\n`)
      await engine.capture(workspace, { sessionId, turnId: String(turn), source: 'post-turn' })
    }
    await expect.poll(async () => (await engine.list(workspace, sessionId)).map(entry => entry.turnId), { timeout: 20_000 })
      .toEqual(['4', '3', '2'])
    const oldest = (await engine.list(workspace, sessionId)).at(-1)!
    expect((await engine.diff(workspace, oldest.checkpointId)).patch).toContain('turn 1')
    expect((await engine.diff(workspace, oldest.checkpointId)).patch).toContain('turn 2')
    const shadowRepo = join((await manifestFile(homePath)), '..')
    const refs = cleanGit(shadowRepo, ['for-each-ref', '--format=%(refname)']).split('\n')
    expect(refs.filter(name => name.startsWith('refs/dsh/checkpoints/'))).toHaveLength(4)
  }, 30_000)

  it('enforces disk quota across small idle-separated writes while preserving the latest state and undo', async () => {
    const { workspace, homePath } = await fixture()
    const maxBytes = 96 * 1024
    const engine = new ShadowGit({ homePath, gitPath, maxFileBytes: 8 * 1024, retention: { maxBytes, idleMs: 45 } })
    const path = join(workspace, 'data.bin')
    const smallWrite = () => writeFile(path, randomBytes(7_800))
    await smallWrite()
    const original = (await engine.capture(workspace, { sessionId, source: 'pre-turn' }))!
    await smallWrite()
    const plan = await engine.previewRestore(workspace, original.checkpointId)
    const { undoCheckpoint } = await engine.restore(workspace, { checkpointId: original.checkpointId, sessionId, token: plan.token })
    let latest: Awaited<ReturnType<ShadowGit['capture']>>
    for (let turn = 0; turn < 18; turn++) {
      await smallWrite()
      latest = await engine.capture(workspace, { sessionId, turnId: String(turn), source: 'post-turn' })
      // Every individual write is less than one tenth of the quota, and each
      // cleanup runs in a distinct quiet interval before the next capture.
      await delay(180)
      await engine.list(workspace)
    }
    const history = await engine.list(workspace)
    expect(history[0]?.checkpointId).toBe(latest?.checkpointId)
    expect(history.some(entry => entry.checkpointId === undoCheckpoint.checkpointId)).toBe(true)
    expect(history.length).toBeLessThan(20)
    const shadowRepo = join((await manifestFile(homePath)), '..')
    const counts = cleanGit(shadowRepo, ['count-objects', '-v'])
    const allocated = [...counts.matchAll(/^size(?:-pack)?: (\d+)$/gmu)].reduce((sum, match) => sum + Number(match[1]) * 1024, 0)
    expect(allocated).toBeLessThanOrEqual(maxBytes)
  }, 60_000)
})
