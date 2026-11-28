import type { Context } from '@deepseek-ai/cordis'
import type { PostToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { isAbsolute } from 'node:path'
import {
  getHostService,
  type AgentLike,
  type ScopedToolsLike,
  type SystemPromptServiceLike,
  type ToolRegistrationSpec,
  type ToolsServiceLike,
  type UserScopeServiceLike,
  type WorkingDirectoryServiceLike,
  type WorkspacesServiceLike,
} from '../core/host-types.ts'
import type { FastOpsSettings } from '../core/settings.ts'
import { isNativeAstAvailable, outlineWorkspace } from './ast-outline.ts'
import { rewriteAst, searchAst } from './ast-tools.ts'
import { denoiseCommandOutput } from './command-output.ts'
import {
  diffPreview,
  editFilesBatch,
  readFilesBatch,
  readTableFile,
  replaceAcrossFiles,
  searchWorkspace,
  statFile,
} from './file-ops.ts'
import { mapRepository } from './repo-map.ts'
import { ResultCache, type StorageReference } from './result-cache.ts'

export const RESIDENT_TOOLS = ['fast_read_files', 'fast_search', 'fast_edit_batch', 'fast_discover'] as const
export const SPECIALIZED_TOOLS = [
  'fast_stat', 'fast_diff', 'fast_replace', 'fast_read_table', 'fast_result',
  'fast_outline', 'fast_ast_search', 'fast_ast_rewrite', 'fast_repo_map',
] as const
export const ALL_FAST_OPS_TOOLS = [...RESIDENT_TOOLS, ...SPECIALIZED_TOOLS] as const

const SPECIALIZED_CATALOG: Record<(typeof SPECIALIZED_TOOLS)[number], string> = {
  fast_stat: 'Inspect file/directory metadata, size, line count, binary status, and SHA-256 revision.',
  fast_diff: 'Preview unified line diff between current file and proposed content without writing.',
  fast_replace: 'Batch literal replacement across glob-matched files (dryRun defaults to true).',
  fast_read_table: 'Parse RFC-4180 CSV/TSV files with quoted fields, column projection, and row paging.',
  fast_result: 'Page, filter (equals), project (fields), or release cached ref:// overflow results.',
  fast_outline: 'Read declaration names, signatures and exact line ranges without loading function bodies.',
  fast_ast_search: 'Find syntax patterns with ast-grep metavariables. Returns exact revisions and optional line context.',
  fast_ast_rewrite: 'Preview a syntax-pattern rewrite, or apply it using the exact file revisions from that preview.',
  fast_repo_map: 'Return a credential-filtered repository map of paths and signatures within a token budget.',
}

export interface FastOpsCounters {
  batchCalls: number
  filesReadInBatches: number
  cacheSpills: number
  toolsActivated: number
  astCalls: number
  denoiseTokensSaved: number
  spillTokensSaved: number
}

export const FAST_OPS_RESULTS_SERVICE = 'fastOpsResults'

export interface FastOpsResultsService {
  putText(input: { agent?: AgentLike; producerTool: string; text: string; preview?: string }): StorageReference | undefined
}

interface CheckpointsServiceLike {
  beforeWorkspaceWrite(input: { agent: AgentLike; workspacePath: string; paths: string[]; tool: string }): Promise<void>
}

interface PermissionPresetsLike {
  permissionState?: (session: AgentLike['session']) => { sandbox?: string } | undefined
}

export class FastOpsController implements FastOpsResultsService {
  readonly cache: ResultCache
  readonly counters: FastOpsCounters = {
    batchCalls: 0,
    filesReadInBatches: 0,
    cacheSpills: 0,
    toolsActivated: 0,
    astCalls: 0,
    denoiseTokensSaved: 0,
    spillTokensSaved: 0,
  }

  private readonly activated = new WeakMap<object, Set<string>>()
  private readonly applied = new WeakMap<object, { key: string; dispose: () => void }>()
  private readonly liveAgents = new Set<AgentLike>()
  private applying = false
  private readonly ctx: Context
  private readonly getSettings: () => FastOpsSettings

  constructor(options: { ctx: Context; getSettings: () => FastOpsSettings }) {
    this.ctx = options.ctx
    this.getSettings = options.getSettings
    this.cache = new ResultCache({ getMaxRefs: () => this.getSettings().maxCachedRefs })
  }

  private cacheScope(agent: AgentLike | undefined, requireSession = false) {
    const sessionId = agent?.session?.id || (requireSession ? undefined : agent?.id || 'default')
    if (!sessionId) return undefined
    const userScope = getHostService<UserScopeServiceLike>(this.ctx, 'userScope')
    const scope = userScope?.currentScope?.() ?? userScope?.desktopScope?.()
    if (userScope && !scope?.principalId) return undefined
    if (scope && userScope?.canAccess && (requireSession || scope.source === 'remote')) {
      if (!userScope.canAccess(scope, { kind: 'session', sessionId }).allowed) return undefined
    }
    return { sessionId, principalId: scope?.principalId }
  }

  async isAstAvailable(): Promise<boolean> {
    return isNativeAstAvailable()
  }

  putText(input: Parameters<FastOpsResultsService['putText']>[0]): StorageReference | undefined {
    const settings = this.getSettings()
    if (!settings.enabled || !input.agent) return undefined
    const scope = this.cacheScope(input.agent, true)
    if (!scope) return undefined
    const ref = this.cache.putText({
      ...scope, producerTool: input.producerTool, text: input.text,
      preview: input.preview, ttlMs: settings.resultCacheTtlMs,
    })
    if (!ref) return undefined
    this.counters.cacheSpills++
    const activated = this.activatedSetFor(input.agent)
    if (!activated.has('fast_result')) {
      activated.add('fast_result')
      this.counters.toolsActivated++
      try { this.reapply(input.agent) } catch { /* The explicit discover tool remains available. */ }
    }
    return ref
  }

  private projectCommandResult(
    exec: ToolExecution,
    result: Readonly<ToolExecutionResult>,
    decision: PostToolDecision,
  ): PostToolDecision {
    if (!['bash', 'pwsh'].includes(exec.name) || result.isError || decision.kind !== 'accept'
      || decision.content !== undefined || decision.value !== undefined) return decision
    const args = exec.arguments as { command?: unknown } | undefined
    const original = result.content[0]
    if (typeof args?.command !== 'string' || result.content.length !== 1 || original?.type !== 'text') return decision
    const shell = result.value as {
      kind?: string
      stdout?: { truncated?: boolean }
      stderr?: { truncated?: boolean }
    } | null | undefined
    if ((shell?.kind !== undefined && shell.kind !== 'foreground')
      || shell?.stdout?.truncated || shell?.stderr?.truncated
      || /(?:^|\n)\[output truncated; full output:/u.test(original.text)) return decision
    const compact = denoiseCommandOutput(original.text, args.command, this.getSettings().denoise)
    if (compact === undefined) return decision
    const ref = this.putText({ agent: exec.agent, producerTool: exec.name, text: original.text })
    if (!ref) return decision
    const rawBytes = Buffer.byteLength(original.text, 'utf8')
    const projectedBytes = Buffer.byteLength(compact, 'utf8')
    const percent = Math.round((1 - projectedBytes / rawBytes) * 100)
    const text = `${compact}\n[compressed ${rawBytes} B -> ${projectedBytes} B, saved ~${percent}%; full raw output: ${ref.refId} via fast_result]`
    this.counters.denoiseTokensSaved += Math.max(0, Math.floor((original.text.length - text.length) / 4))
    return { ...decision, content: [{ ...original, text }] }
  }

  private recordSpillSavings(spilledBytes: number, inlinePayload: unknown): void {
    if (spilledBytes <= 0) return
    const serialized = typeof inlinePayload === 'string' ? inlinePayload : JSON.stringify(inlinePayload)
    const inlineBytes = Buffer.byteLength(serialized ?? '', 'utf8')
    this.counters.spillTokensSaved += Math.floor(Math.max(0, spilledBytes - inlineBytes) / 4)
  }

  private resolveWorkspaceRoot(agent?: AgentLike): string {
    if (agent?.workspace?.path) return agent.workspace.path
    if (agent?.cwd) return agent.cwd
    const registry = getHostService<WorkspacesServiceLike>(this.ctx, 'workspaceRegistry')
    try {
      const first = registry?.list?.()[0]
      if (first?.path) return first.path
    } catch {}
    return process.cwd()
  }

  private async resolveCodeWorkspace(agent: AgentLike | undefined, signal?: AbortSignal): Promise<string | undefined> {
    if (!agent) return undefined
    const directory = getHostService<WorkingDirectoryServiceLike>(this.ctx, 'workingDirectory')
    try {
      signal?.throwIfAborted()
      const root = directory
        ? await directory.ensure(agent, signal)
        : agent.workspace?.path || agent.cwd || agent.session?.header?.cwd
      return typeof root === 'string' && isAbsolute(root) ? root : undefined
    } catch {
      signal?.throwIfAborted()
      return undefined
    }
  }

  private canRewriteWorkspace(agent: AgentLike): boolean {
    const permissions = getHostService<PermissionPresetsLike>(this.ctx, 'permissionPresets')
    const shell = getHostService<{ sandboxMode?: string }>(this.ctx, 'shell')
    try {
      const sandbox = (agent.session ? permissions?.permissionState?.(agent.session)?.sandbox : undefined) ?? shell?.sandboxMode
      return sandbox !== 'read-only'
    } catch {
      return false
    }
  }

  private activatedSetFor(agent: AgentLike | undefined): Set<string> {
    if (!agent || typeof agent !== 'object') return new Set()
    let set = this.activated.get(agent)
    if (!set) {
      set = new Set()
      this.activated.set(agent, set)
    }
    return set
  }

  private denyListFor(agent: AgentLike): string[] {
    const settings = this.getSettings()
    if (!settings.enabled) return [...ALL_FAST_OPS_TOOLS]
    if (!settings.lazySpecializedTools) return ['fast_discover']
    const revealed = this.activatedSetFor(agent)
    return SPECIALIZED_TOOLS.filter(name => !revealed.has(name))
  }

  private releaseAgent(agent: AgentLike | undefined): void {
    if (!agent || typeof agent !== 'object') return
    const prev = this.applied.get(agent)
    if (!prev) return
    this.applied.delete(agent)
    try { prev.dispose() } catch {}
  }

  applyToAgent(agent: AgentLike | undefined): void {
    if (this.applying || !agent || typeof agent !== 'object') return
    this.liveAgents.add(agent)
    this.applying = true
    try {
      const scoped = (agent.ctx?.get?.('tools') ?? agent.ctx?.tools) as ScopedToolsLike | undefined
      if (typeof scoped?.restrict !== 'function') return
      let deny = this.denyListFor(agent)
      if (typeof scoped.view === 'function') {
        const known = scoped.view(agent)?.restrictableNames
        if (known) deny = deny.filter(name => known.has(name))
      }
      const key = deny.slice().sort().join(',')
      const prev = this.applied.get(agent)
      if (prev && prev.key === key) return
      this.releaseAgent(agent)
      if (deny.length === 0) return
      this.applied.set(agent, { key, dispose: scoped.restrict({ deny }) })
    } finally {
      this.applying = false
    }
  }

  reapply(agent?: AgentLike): void {
    if (agent !== undefined) {
      this.applyToAgent(agent)
      return
    }
    for (const live of this.liveAgents) this.applyToAgent(live)
  }

  mount(): () => void {
    const disposers: Array<() => void> = []
    const ctxAny = this.ctx as unknown as {
      on?: (event: string, listener: (...args: any[]) => unknown) => () => void
    }

    if (typeof ctxAny.on === 'function') {
      disposers.push(ctxAny.on('agent/created', (payload: { agent?: AgentLike } | undefined) => {
        this.applyToAgent(payload?.agent)
      }))
      disposers.push(ctxAny.on('agent/disposed', (payload: { agent?: AgentLike } | undefined) => {
        this.releaseAgent(payload?.agent)
        if (payload?.agent) this.liveAgents.delete(payload.agent)
      }))
      // `agent/pre-step` is a Cordis WATERFALL: always invoke and return next().
      disposers.push(ctxAny.on('agent/pre-step', async (payload: { agent?: AgentLike } | undefined, next?: () => unknown) => {
        try { this.applyToAgent(payload?.agent) } catch {}
        return typeof next === 'function' ? next() : undefined
      }))
      disposers.push(ctxAny.on('tools/change', () => {
        this.reapply()
      }))
      disposers.push(ctxAny.on('tools/post-execute', async (
        exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>,
      ) => {
        const decision = await next()
        try {
          return this.projectCommandResult(exec, result, decision)
        } catch {
          return decision
        }
      }))
    }

    const mountPrompt = (systemPrompt: SystemPromptServiceLike) => {
      if (!systemPrompt.section) return
      const stopPrompt = systemPrompt.section({
        name: 'dsh:fast-ops',
        order: 45,
        text: () => {
          const settings = this.getSettings()
          if (!settings.enabled || !settings.batchingGuidance) return ''
          return [
            '## nbfast Token-Efficiency Tips',
            '- Prefer `fast_read_files` to inspect multiple files/ranges in a single turn and obtain SHA-256 `revision` tokens.',
            '- Use `fast_search` for workspace glob/grep. For an unfamiliar symbol or call site, request `contextLines: 2` to get merged excerpts and their file revisions in one call. Reuse the revision for `fast_edit_batch` when the excerpt is sufficient. Read larger excerpts from `contextRef` via `fast_result`; call `fast_discover` when a specialized tool is needed.',
            '- Use `fast_outline` for declaration signatures and `fast_ast_search` for source patterns. Run `fast_ast_rewrite` in preview mode before supplying its file revisions to apply a rewrite.',
          ].join('\n')
        },
      })
      if (typeof stopPrompt === 'function') disposers.push(stopPrompt)
    }

    const existingPrompt = getHostService<SystemPromptServiceLike>(this.ctx, 'systemPrompt')
    if (existingPrompt) {
      mountPrompt(existingPrompt)
    } else if (typeof (this.ctx as unknown as { inject?: unknown }).inject === 'function') {
      try {
        const stopInject = (this.ctx as unknown as {
          inject: (deps: string[], cb: (scoped: { systemPrompt?: SystemPromptServiceLike }) => void) => (() => void) | { dispose?: () => void }
        }).inject(['systemPrompt'], (scoped) => {
          if (scoped?.systemPrompt) mountPrompt(scoped.systemPrompt)
        })
        if (typeof stopInject === 'function') disposers.push(stopInject)
        else if (stopInject && typeof stopInject.dispose === 'function') disposers.push(() => stopInject.dispose?.())
      } catch {}
    }

    const mountTools = (tools: ToolsServiceLike) => {
      if (!tools.register) return

      const reg = (spec: {
        name: string
        description: string
        parameters: unknown
        execute: ToolRegistrationSpec['execute']
      }) => {
        const stop = tools.register!({
          ...spec,
          output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args: unknown, value: unknown) => [{
              type: 'text',
              text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
            }],
          },
        })
        if (typeof stop === 'function') disposers.push(stop)
      }

      const codeSelection = {
        path: { type: 'string', description: 'Workspace path or glob, default ".".' },
        include: { type: 'array', items: { type: 'string' }, maxItems: 32 },
      }
      const pattern = { type: 'string', minLength: 1, maxLength: 1000, description: 'ast-grep pattern such as ctx.on($EVENT, $HANDLER).' }
      const noWorkspace = { ok: false, error: 'workspace-unavailable' }

      reg({
        name: 'fast_read_files',
        description: 'Read 1-32 UTF-8 workspace file line ranges in one call, returning per-file SHA-256 revision and content (or ref:// cache handle when oversized).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['files'],
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: {
                  path: { type: 'string' },
                  offset: { type: 'integer', description: '1-based start line; default 1.' },
                  limit: { type: 'integer', description: '1-2000 lines; default 200.' },
                },
              },
            },
          },
        },
        execute: async (args, exec) => {
          this.counters.batchCalls++
          const files = Array.isArray(args?.files) ? (args.files as Array<{ path: string; offset?: number; limit?: number }>) : []
          this.counters.filesReadInBatches += files.length
          const settings = this.getSettings()
          const result = await readFilesBatch(this.resolveWorkspaceRoot(exec?.agent), files, {
            ...this.cacheScope(exec?.agent),
            maxInlineBytes: settings.maxInlineBytes,
            ttlMs: settings.resultCacheTtlMs,
            cache: this.cache,
          })
          if (result.spilled) {
            this.counters.cacheSpills++
            this.recordSpillSavings(result.ref?.totalBytes ?? 0, result)
          }
          return result
        },
      })

      reg({
        name: 'fast_search',
        description: 'Search workspace files by glob or grep. Opt into merged line context and exact file revisions when needed for explanation or a follow-up edit.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['mode'],
          properties: {
            mode: { type: 'string', enum: ['glob', 'grep'] },
            path: { type: 'string', description: 'Relative workspace directory; default ".".' },
            include: { type: 'array', items: { type: 'string' } },
            pattern: { type: 'string', description: 'Required for grep.' },
            literal: { type: 'boolean' },
            caseSensitive: { type: 'boolean' },
            includeHidden: { type: 'boolean' },
            offset: { type: 'integer' },
            limit: { type: 'integer' },
            contextLines: { type: 'integer', minimum: 0, maximum: 5,
              description: 'Optional lines before and after each grep match. Returns merged excerpts for this match page, or contextRef for fast_result. Defaults to 0.' },
          },
        },
        execute: async (args, exec) => {
          this.counters.batchCalls++
          const settings = this.getSettings()
          const res = await searchWorkspace(
            this.resolveWorkspaceRoot(exec?.agent),
            args as unknown as Parameters<typeof searchWorkspace>[1],
            {
              ...this.cacheScope(exec?.agent),
              maxInlineBytes: settings.maxInlineBytes,
              ttlMs: settings.resultCacheTtlMs,
              cache: this.cache,
            },
          )
          if ('spilled' in res && res.spilled) {
            this.counters.cacheSpills++
            const refBytes = 'ref' in res ? (res.ref?.totalBytes ?? 0) : 0
            const contextRefBytes = 'contextRef' in res ? (res.contextRef?.totalBytes ?? 0) : 0
            this.recordSpillSavings(refBytes + contextRefBytes, res)
          }
          return res
        },
      })

      reg({
        name: 'fast_edit_batch',
        description: 'Apply 1-100 non-overlapping unique text replacements atomically with required SHA-256 expectedRevision CAS check.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'expectedRevision', 'edits'],
          properties: {
            path: { type: 'string' },
            expectedRevision: { type: 'string', description: '64-hex SHA-256 revision from fast_read_files or fast_stat.' },
            dryRun: { type: 'boolean', description: 'Preview diff without writing; default false.' },
            edits: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['oldText', 'newText'],
                properties: {
                  oldText: { type: 'string' },
                  newText: { type: 'string' },
                },
              },
            },
          },
        },
        execute: (args, exec) => {
          this.counters.batchCalls++
          return editFilesBatch(
            this.resolveWorkspaceRoot(exec?.agent),
            args as unknown as Parameters<typeof editFilesBatch>[1],
          )
        },
      })

      reg({
        name: 'fast_discover',
        description: 'Activate specialized nbfast file, AST, repository map, and result tools on demand by keyword or select:<tool>.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'Keyword or select:<tool_name> (or "all").' },
          },
        },
        execute: (args, exec) => {
          const query = String(args?.query ?? '').trim().toLowerCase()
          const set = this.activatedSetFor(exec?.agent)
          const matched: string[] = []
          for (const name of SPECIALIZED_TOOLS) {
            const desc = SPECIALIZED_CATALOG[name].toLowerCase()
            const exact = query === `select:${name}` || query === name || query === 'all' || query === '*'
            if (exact || (query.length > 0 && (name.includes(query) || desc.includes(query)))) {
              if (!set.has(name)) {
                set.add(name)
                this.counters.toolsActivated++
              }
              matched.push(name)
            }
          }
          this.reapply(exec?.agent)
          return {
            activated: matched,
            catalog: matched.map(name => ({ name, description: SPECIALIZED_CATALOG[name as keyof typeof SPECIALIZED_CATALOG] })),
            note: matched.length > 0
              ? 'Activated for the next step in this session.'
              : `No match. Available: ${SPECIALIZED_TOOLS.join(', ')}`,
          }
        },
      })

      reg({
        name: 'fast_stat',
        description: SPECIALIZED_CATALOG.fast_stat,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['path'],
          properties: { path: { type: 'string' } },
        },
        execute: (args, exec) => statFile(this.resolveWorkspaceRoot(exec?.agent), String(args?.path ?? '')),
      })

      reg({
        name: 'fast_diff',
        description: SPECIALIZED_CATALOG.fast_diff,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'content'],
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
        },
        execute: (args, exec) => diffPreview(this.resolveWorkspaceRoot(exec?.agent), String(args?.path ?? ''), String(args?.content ?? '')),
      })

      reg({
        name: 'fast_replace',
        description: SPECIALIZED_CATALOG.fast_replace,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['oldText', 'newText'],
          properties: {
            oldText: { type: 'string' },
            newText: { type: 'string' },
            path: { type: 'string' },
            include: { type: 'array', items: { type: 'string' } },
            dryRun: { type: 'boolean', description: 'Preview without modifying files; default true.' },
          },
        },
        execute: (args, exec) => replaceAcrossFiles(
          this.resolveWorkspaceRoot(exec?.agent),
          args as unknown as Parameters<typeof replaceAcrossFiles>[1],
        ),
      })

      reg({
        name: 'fast_read_table',
        description: SPECIALIZED_CATALOG.fast_read_table,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['path'],
          properties: {
            path: { type: 'string' },
            delimiter: { type: 'string', enum: [',', '\t'] },
            offset: { type: 'integer' },
            limit: { type: 'integer' },
            columns: { type: 'array', items: { type: 'string' } },
          },
        },
        execute: async (args, exec) => {
          const settings = this.getSettings()
          const res = await readTableFile(
            this.resolveWorkspaceRoot(exec?.agent),
            args as unknown as Parameters<typeof readTableFile>[1],
            {
              ...this.cacheScope(exec?.agent),
              maxInlineBytes: settings.maxInlineBytes,
              ttlMs: settings.resultCacheTtlMs,
              cache: this.cache,
            },
          )
          if ('spilled' in res && res.spilled) {
            this.counters.cacheSpills++
            const refBytes = 'ref' in res ? (res.ref?.totalBytes ?? 0) : 0
            this.recordSpillSavings(refBytes, res)
          }
          return res
        },
      })

      reg({
        name: 'fast_outline',
        description: SPECIALIZED_CATALOG.fast_outline,
        parameters: {
          type: 'object', additionalProperties: false,
          properties: { ...codeSelection, maxSymbols: { type: 'integer', minimum: 1, maximum: 200 } },
        },
        execute: async (args, exec) => {
          const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal)
          if (!root) return noWorkspace
          this.counters.astCalls++
          return outlineWorkspace(root, (args ?? {}) as Parameters<typeof outlineWorkspace>[1], exec?.signal)
        },
      })

      reg({
        name: 'fast_ast_search',
        description: SPECIALIZED_CATALOG.fast_ast_search,
        parameters: {
          type: 'object', additionalProperties: false, required: ['pattern'],
          properties: {
            ...codeSelection, pattern,
            offset: { type: 'integer', minimum: 0 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            contextLines: { type: 'integer', minimum: 0, maximum: 5 },
          },
        },
        execute: async (args, exec) => {
          const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal)
          if (!root) return noWorkspace
          this.counters.astCalls++
          const result = await searchAst(root, (args ?? {}) as unknown as Parameters<typeof searchAst>[1], exec?.signal)
          if (!result.context?.length) return result
          const text = JSON.stringify(result.context)
          if (Buffer.byteLength(text, 'utf8') <= this.getSettings().maxInlineBytes) return result
          const contextRef = this.putText({ agent: exec?.agent, producerTool: 'fast_ast_search', text })
          if (contextRef) {
            this.recordSpillSavings(Buffer.byteLength(text, 'utf8'), contextRef)
          }
          return contextRef ? { ...result, context: [], contextRef, contextEncoding: 'json-text' } : result
        },
      })

      reg({
        name: 'fast_ast_rewrite',
        description: SPECIALIZED_CATALOG.fast_ast_rewrite,
        parameters: {
          type: 'object', additionalProperties: false, required: ['pattern', 'replacement'],
          properties: {
            ...codeSelection, pattern,
            replacement: { type: 'string', maxLength: 8192 },
            dryRun: { type: 'boolean', description: 'Preview changes by default.' },
            expectedRevisions: {
              type: 'object',
              description: 'Required to apply changes. Use the exact path-to-revision pairs returned by the preview.',
              additionalProperties: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            },
          },
        },
        execute: async (args, exec) => {
          const agent = exec?.agent
          const root = await this.resolveCodeWorkspace(agent, exec?.signal)
          if (!root || !agent) return noWorkspace
          if (args?.dryRun === false && !this.canRewriteWorkspace(agent)) return { ok: false, error: 'workspace-read-only' }
          this.counters.astCalls++
          return rewriteAst(root, (args ?? {}) as unknown as Parameters<typeof rewriteAst>[1], {
            signal: exec?.signal,
            beforeWrite: async paths => {
              if (!this.canRewriteWorkspace(agent)) throw new Error('workspace-read-only')
              const checkpoints = getHostService<CheckpointsServiceLike>(this.ctx, 'workspaceCheckpoints')
              await checkpoints?.beforeWorkspaceWrite({ agent, workspacePath: root, paths, tool: 'fast_ast_rewrite' })
            },
          })
        },
      })

      reg({
        name: 'fast_repo_map',
        description: SPECIALIZED_CATALOG.fast_repo_map,
        parameters: {
          type: 'object', additionalProperties: false,
          properties: { ...codeSelection, maxTokens: { type: 'integer', minimum: 40, maximum: 12_000 } },
        },
        execute: async (args, exec) => {
          const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal)
          if (!root) return noWorkspace
          this.counters.astCalls++
          return mapRepository(root, (args ?? {}) as Parameters<typeof mapRepository>[1], exec?.signal)
        },
      })

      reg({
        name: 'fast_result',
        description: SPECIALIZED_CATALOG.fast_result,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'refId'],
          properties: {
            action: { type: 'string', enum: ['page', 'release'] },
            refId: { type: 'string' },
            offset: { type: 'integer' },
            limit: { type: 'integer' },
            maxBytes: { type: 'integer' },
            fields: { type: 'array', items: { type: 'string' } },
            equals: { type: 'object' },
          },
        },
        execute: (args, exec) => {
          const scope = this.cacheScope(exec?.agent)
          const refId = String(args?.refId ?? '')
          if (!scope) return { ok: false, refId, error: 'reference-not-found' }
          if (args?.action === 'release') {
            return { ok: true, released: this.cache.release(scope.sessionId, refId, scope.principalId) }
          }
          return this.cache.page({
            ...scope,
            refId,
            offset: typeof args?.offset === 'number' ? args.offset : undefined,
            limit: typeof args?.limit === 'number' ? args.limit : undefined,
            maxBytes: typeof args?.maxBytes === 'number' ? args.maxBytes : undefined,
            fields: Array.isArray(args?.fields) ? (args.fields as string[]) : undefined,
            equals: args?.equals && typeof args.equals === 'object' ? (args.equals as Record<string, unknown>) : undefined,
          })
        },
      })
    }

    const existingTools = getHostService<ToolsServiceLike>(this.ctx, 'tools')
    if (existingTools) {
      mountTools(existingTools)
    } else if (typeof (this.ctx as unknown as { inject?: unknown }).inject === 'function') {
      try {
        const stopInject = (this.ctx as unknown as {
          inject: (deps: string[], cb: (scoped: { tools?: ToolsServiceLike }) => void) => (() => void) | { dispose?: () => void }
        }).inject(['tools'], (scoped) => {
          if (scoped?.tools) mountTools(scoped.tools)
        })
        if (typeof stopInject === 'function') disposers.push(stopInject)
        else if (stopInject && typeof stopInject.dispose === 'function') disposers.push(() => stopInject.dispose?.())
      } catch {}
    }

    return () => {
      for (const agent of this.liveAgents) this.releaseAgent(agent)
      this.liveAgents.clear()
      this.cache.reclaimAll()
      for (const dispose of disposers) {
        try { dispose() } catch {}
      }
    }
  }
}
