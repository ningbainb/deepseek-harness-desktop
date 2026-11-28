import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

let workspace: string
const toolRun = {
  agent: { session: { id: 'session-one' } },
  callId: 'call-one',
  signal: new AbortController().signal,
} as unknown as ToolRunContext

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'dsh-doc-tools-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

function createHost(allowed = true, withSearch = false) {
  const tools = new Map<string, ToolDefinition>()
  const scope = { principalId: 'principal-one', source: 'desktop' }
  const approval = vi.fn(async () => 'denied')
  const putText = vi.fn(() => ({ refId: 'ref://session-one/doc_read/test' }))
  const canAccess = vi.fn(() => ({ allowed }))
  const indexMarkdownForAgent = vi.fn(async () => ({ chunks: 2 }))
  const provide = vi.fn()
  const host = {
    provide,
    get: (key: string) => {
      if (key === 'fastOpsResults') return { putText }
      if (key === 'localSearch' && withSearch) return { indexMarkdownForAgent }
      return undefined
    },
    userScope: { currentScope: () => scope, desktopScope: () => scope, canAccess },
    workspaceRegistry: { list: () => [{ id: 'workspace-one', sessionIds: ['session-one'], path: workspace }] },
    approval: { request: approval },
    tools: {
      register(definition: ToolDefinition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    inject (_names: string[], callback: (ctx: Context) => () => void) { return callback(host as unknown as Context) },
  }
  return { host: host as unknown as Context, tools, approval, putText, canAccess, provide, indexMarkdownForAgent }
}

describe('document tool scope', () => {
  it('mounts the host service once and registers tools in an opting-in scope', () => {
    const { host, tools, provide } = createHost()
    apply(host)
    expect(provide).toHaveBeenCalledExactlyOnceWith('documentIngest', { readDocument: expect.any(Function) })
    expect(tools.size).toBe(0)
    apply(host, { tools: true })
    expect(Array.from(tools.keys())).toEqual(['doc_inspect', 'doc_read', 'doc_extract_url'])
    expect(provide).toHaveBeenCalledTimes(1)
  })

  it('checks both session and workspace membership before parsing and after extraction', async () => {
    const { host, tools, canAccess, putText } = createHost()
    await writeFile(join(workspace, 'notes.rtf'), '{\\rtf1 Document content for the model to inspect.}')
    apply(host, { tools: true })
    const result = await tools.get('doc_read')?.execute({ path: 'notes.rtf', maxChars: 8 }, toolRun)
    expect(canAccess.mock.calls.map((call: unknown[]) => call[1])).toEqual([
      { kind: 'session', sessionId: 'session-one' },
      { kind: 'workspace', workspaceId: 'workspace-one' },
      { kind: 'session', sessionId: 'session-one' },
      { kind: 'workspace', workspaceId: 'workspace-one' },
    ])
    expect(result).toMatchObject({ markdown: 'Document', trimmed: true, refId: 'ref://session-one/doc_read/test' })
    expect(putText).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      agent: toolRun.agent, producerTool: 'doc_read', text: expect.stringContaining('Document content for the model'),
    }))
  }, 15_000)

  it('fails closed for an unauthorized session before asking for network approval', async () => {
    const { host, tools, approval } = createHost(false)
    apply(host, { tools: true })
    await expect(tools.get('doc_extract_url')?.execute({ url: 'https://example.com/' }, toolRun)).rejects.toThrow(/authorized session/i)
    expect(approval).not.toHaveBeenCalled()
  })

  it('stops when approval is denied', async () => {
    const { host, tools, approval } = createHost()
    apply(host, { tools: true })
    await expect(tools.get('doc_extract_url')?.execute({ url: 'https://example.com/' }, toolRun)).rejects.toThrow(/not approved/i)
    expect(approval).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      agent: toolRun.agent, callId: toolRun.callId, signal: toolRun.signal,
    }))
  })

  it('indexes an approved document through the current agent and leaves a denied request unwritten', async () => {
    const { host, tools, approval, indexMarkdownForAgent } = createHost(true, true)
    await writeFile(join(workspace, 'notes.rtf'), '{\\rtf1 Approved local document content.}')
    apply(host, { tools: true })
    const tool = tools.get('doc_index_to_kb')!
    expect(tool).toBeDefined()
    await expect(tool.execute({ path: 'notes.rtf' }, toolRun)).rejects.toThrow(/not approved/i)
    expect(indexMarkdownForAgent).not.toHaveBeenCalled()
    approval.mockResolvedValue('allowed-once')
    await expect(tool.execute({ path: 'notes.rtf' }, toolRun)).resolves.toEqual({ chunks: 2 })
    expect(indexMarkdownForAgent).toHaveBeenCalledExactlyOnceWith(toolRun.agent, {
      sourcePath: 'notes.rtf', markdown: expect.stringContaining('Approved local document content.'),
    })
  })
})
