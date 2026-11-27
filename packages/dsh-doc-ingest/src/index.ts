import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SessionId, WorkspaceId } from '@ningbainb/dsh-user-scope'
import type {} from '@ningbainb/dsh-user-scope'
import { MAX_INLINE_BYTES, type DocumentMetadata, type DocumentResult } from './core/types.ts'
import { inspectDocument, readDocument, withIngestJob } from './host/document.ts'
import { documentIngestMessages } from './host/locales.ts'
import { fetchPublicHtml, parsePublicUrl } from './host/web-fetch.ts'
import { runParseWorker } from './host/worker.ts'

export { inspectDocument, readDocument } from './host/document.ts'
export type { DocumentMetadata, DocumentResult, ReadOptions } from './core/types.ts'

export const name = 'doc-ingest'

export interface Config {
  tools?: boolean
}

export interface DocumentIngestService {
  readDocument: typeof readDocument
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    documentIngest: DocumentIngestService
  }
}

interface FastOpsResults {
  putText(params: {
    agent: ToolRunContext['agent']
    producerTool: string
    text: string
    preview?: string
  }): { refId: string } | undefined
}

interface KnowledgeIndex {
  indexMarkdownForAgent(agent: NonNullable<ToolRunContext['agent']>, document: { sourcePath: string; markdown: string }): Promise<{ chunks: number }>
}

function scopedAgent(exec: ToolRunContext): NonNullable<ToolRunContext['agent']> {
  if (!exec.agent) throw new Error('Document access requires an active agent session.')
  return exec.agent
}

function scopedWorkspace(ctx: Context, exec: ToolRunContext): string {
  const userScope = ctx.userScope
  const scope = userScope.currentScope() ?? userScope.desktopScope()
  const agent = scopedAgent(exec)
  const sessionId = agent.session.id as unknown as SessionId
  if (!scope || !userScope.canAccess(scope, { kind: 'session', sessionId }).allowed) {
    throw new Error('Document access requires an authorized session.')
  }
  const workspace = ctx.workspaceRegistry.list().find(item => item.sessionIds.includes(agent.session.id))
  if (!workspace || !userScope.canAccess(scope, { kind: 'workspace', workspaceId: workspace.id as unknown as WorkspaceId }).allowed) {
    throw new Error('Document access requires an authorized workspace.')
  }
  return workspace.path
}

function objectArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Document tool arguments must be an object.')
  return args as Record<string, unknown>
}

function textArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`The ${key} argument is required.`)
  return value
}

function clipMarkdown(markdown: string, maxChars: number, maxBytes: number): string {
  let chars = 0
  let bytes = 0
  for (const character of markdown) {
    bytes += Buffer.byteLength(character, 'utf8')
    if (chars + character.length > maxChars || bytes > maxBytes) break
    chars += character.length
  }
  return markdown.slice(0, chars)
}

function modelMetadata(metadata: DocumentMetadata): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined))
}

function renderDocument(ctx: Context, exec: ToolRunContext, result: DocumentResult, tool: string, limit: number) {
  const markdown = clipMarkdown(result.markdown, limit, MAX_INLINE_BYTES)
  const trimmed = markdown.length < result.markdown.length
  const reference = trimmed
    ? (ctx.get('fastOpsResults') as FastOpsResults | undefined)?.putText({
      agent: exec.agent,
      producerTool: tool,
      text: result.markdown,
      preview: clipMarkdown(markdown, 200, 1024),
    })
    : undefined
  return {
    metadata: modelMetadata(result.metadata),
    markdown,
    sourceIsUntrusted: true,
    trimmed,
    ...(reference ? { refId: reference.refId } : {}),
    ...(!trimmed ? {} : {
      continuation: reference ? 'Read the full document with fast_result using refId.' : 'Select fewer pages, one sheet, or one section.',
    }),
  }
}

const string = { type: 'string' } as const
const output: ToolDefinition['output'] = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
}

function registerTools(ctx: Context): () => void {
  const definitions: ToolDefinition[] = [
    {
      name: 'doc_inspect',
      description: 'Inspect a workspace document for its available pages or sheets, outline, and PDF text-layer status.',
      parameters: { type: 'object', properties: { path: string }, required: ['path'], additionalProperties: false },
      output,
      async execute(value, exec) {
        const workspace = scopedWorkspace(ctx, exec)
        const metadata = await inspectDocument(workspace, textArg(objectArgs(value), 'path'), { signal: exec.signal })
        if (scopedWorkspace(ctx, exec) !== workspace) throw new Error('The document workspace changed during extraction.')
        return modelMetadata(metadata)
      },
    },
    {
      name: 'doc_read',
      description: 'Read a workspace document as Markdown. Select a one-based page range, a sheet, or a heading for large documents.',
      parameters: {
        type: 'object',
        properties: {
          path: string, pages: { ...string, description: 'One-based range such as 2-4 or 1,3 for PDF or slides.' },
          sheet: string, section: string, maxChars: { type: 'integer', minimum: 1, maximum: MAX_INLINE_BYTES },
        },
        required: ['path'],
        additionalProperties: false,
      },
      output,
      async execute(value, exec) {
        const args = objectArgs(value)
        const workspace = scopedWorkspace(ctx, exec)
        const result = await readDocument(workspace, textArg(args, 'path'), {
          pages: typeof args.pages === 'string' ? args.pages : undefined,
          sheet: typeof args.sheet === 'string' ? args.sheet : undefined,
          section: typeof args.section === 'string' ? args.section : undefined,
          signal: exec.signal,
        })
        if (scopedWorkspace(ctx, exec) !== workspace) throw new Error('The document workspace changed during extraction.')
        const limit = typeof args.maxChars === 'number' ? Math.min(MAX_INLINE_BYTES, Math.max(1, args.maxChars)) : MAX_INLINE_BYTES
        return renderDocument(ctx, exec, result, 'doc_read', limit)
      },
    },
    {
      name: 'doc_extract_url',
      description: 'After explicit approval, extract the article text, source domain, and metadata of a public webpage.',
      parameters: { type: 'object', properties: { url: string }, required: ['url'], additionalProperties: false },
      output,
      async execute(value, exec) {
        scopedWorkspace(ctx, exec)
        const url = parsePublicUrl(textArg(objectArgs(value), 'url'))
        const en = documentIngestMessages.en.approveWeb(url.origin)
        const zh = documentIngestMessages.zh.approveWeb(url.origin)
        const allowed = await ctx.approval.request({
          agent: scopedAgent(exec),
          toolName: 'doc_extract_url',
          callId: exec.callId,
          signal: exec.signal,
          reason: en,
          displayReason: { en, zh, 'zh-CN': zh },
        })
        if (allowed !== 'allowed-once') throw new Error('Public webpage extraction was not approved.')
        scopedWorkspace(ctx, exec)
        const result = await withIngestJob(async () => {
          const page = await fetchPublicHtml(url.href, { signal: exec.signal })
          return runParseWorker({ kind: 'web', ...page }, { signal: exec.signal })
        })
        scopedWorkspace(ctx, exec)
        return renderDocument(ctx, exec, result, 'doc_extract_url', MAX_INLINE_BYTES)
      },
    },
  ]
  const dispose = definitions.map(definition => ctx.tools.register(definition))
  return () => { for (const stop of dispose.reverse()) stop() }
}

function registerKnowledgeTool(ctx: Context): (() => void) | undefined {
  const index = ctx.get('localSearch' as never, false) as KnowledgeIndex | undefined
  if (!index) return undefined
  return ctx.tools.register({
    name: 'doc_index_to_kb',
    description: 'With approval, add one workspace Office, PDF or OpenDocument file to its local knowledge index.',
    parameters: { type: 'object', properties: { path: string }, required: ['path'], additionalProperties: false },
    output,
    async execute(value, exec) {
      const workspace = scopedWorkspace(ctx, exec)
      const agent = scopedAgent(exec)
      const path = textArg(objectArgs(value), 'path')
      if (path.length > 4096 || /[\x00-\x1f]/u.test(path)) throw new Error('Invalid document path.')
      const en = documentIngestMessages.en.approveIndex(path)
      const zh = documentIngestMessages.zh.approveIndex(path)
      const allowed = await ctx.approval.request({
        agent, toolName: 'doc_index_to_kb', callId: exec.callId, signal: exec.signal,
        reason: en, displayReason: { en, zh, 'zh-CN': zh },
      })
      if (allowed !== 'allowed-once') throw new Error('Knowledge indexing was not approved.')
      if (scopedWorkspace(ctx, exec) !== workspace) throw new Error('The document workspace changed before extraction.')
      const document = await readDocument(workspace, path, { signal: exec.signal })
      if (scopedWorkspace(ctx, exec) !== workspace) throw new Error('The document workspace changed during extraction.')
      exec.signal.throwIfAborted()
      return index.indexMarkdownForAgent(agent, { sourcePath: path, markdown: document.markdown })
    },
  })
}

export function apply(ctx: Context, config: Config = {}): void {
  if (config.tools !== true) {
    ctx.provide('documentIngest', { readDocument } satisfies DocumentIngestService)
    return
  }
  ctx.inject(['tools', 'approval', 'workspaceRegistry', 'userScope'], registerTools)
  ctx.inject(['tools', 'approval', 'workspaceRegistry', 'userScope', 'localSearch' as never], registerKnowledgeTool)
}
