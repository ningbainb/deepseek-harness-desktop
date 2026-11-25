import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import type {
  AcpConfigOption,
  AcpMcpServerParam,
  AcpModelOption,
  AcpNegotiatedCapabilities,
  AcpPermissionRequest,
  AcpPermissionResponse,
  AcpStreamEvent,
} from './types.ts'

export class AcpClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'AcpClientError'
  }
}

export async function assertWorkspaceContained(workspaceCwd: string, targetPath: string): Promise<string> {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0 || targetPath.includes('\0')) {
    throw new AcpClientError('INVALID_PATH', 'target path must be a non-empty string')
  }
  const rootReal = await realpath(resolve(workspaceCwd))
  const candidate = isAbsolute(targetPath) ? resolve(targetPath) : resolve(rootReal, targetPath)
  let resolvedTarget: string
  try {
    resolvedTarget = await realpath(candidate)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    const parentReal = await realpath(dirname(candidate))
    resolvedTarget = joinSafe(parentReal, candidate.slice(dirname(candidate).length).replace(/^[/\\]+/u, ''))
  }
  const rel = relative(rootReal, resolvedTarget)
  if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
    throw new AcpClientError('WORKSPACE_ESCAPE', `path "${targetPath}" escapes session workspace`)
  }
  return resolvedTarget
}

function joinSafe(parent: string, leaf: string): string {
  return leaf ? resolve(parent, leaf) : parent
}

export interface AcpClientHandlers {
  onPermissionRequest?: (request: AcpPermissionRequest) => Promise<AcpPermissionResponse>
  onFsWriteApprove?: (path: string, content: string) => Promise<boolean>
}

export interface AcpClientLaunchOptions {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  timeoutMs?: number
  handlers?: AcpClientHandlers
  launch?: typeof spawn
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseLineSlice(content: string, line?: number, limit?: number): string {
  if (line === undefined && limit === undefined) return content
  const lines = content.split(/\r?\n/u)
  const start = Math.max(0, (line ?? 1) - 1)
  const end = limit !== undefined && limit > 0 ? start + limit : lines.length
  return lines.slice(start, end).join('\n')
}

export class AcpClient {
  private child?: ChildProcessWithoutNullStreams
  private nextId = 0
  private pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private sessionListeners = new Map<string, (event: AcpStreamEvent) => void>()
  private stderrTail = ''
  private closed = false
  private closePromise?: Promise<void>
  private negotiated?: AcpNegotiatedCapabilities

  constructor(private readonly options: AcpClientLaunchOptions) {}

  get capabilities(): AcpNegotiatedCapabilities | undefined {
    return this.negotiated
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.closed) throw new AcpClientError('CLIENT_CLOSED', 'ACP client has closed')
    if (this.child) return this.child
    const launch = this.options.launch ?? spawn
    const child = launch(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env ? { ...process.env, ...this.options.env } : process.env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams
    this.child = child

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-16_384)
    })
    child.stdin.on('error', () => {})

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    lines.on('line', (line) => {
      if (!line.trim()) return
      let msg: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(line)
        if (!isPlainObject(parsed)) return
        msg = parsed
      } catch {
        return
      }
      this.handleMessage(msg)
    })

    this.closePromise = new Promise<void>((resolvePromise) => {
      const rejectAll = (reason: Error): void => {
        for (const [id, entry] of this.pending) {
          clearTimeout(entry.timer)
          this.pending.delete(id)
          entry.reject(reason)
        }
      }
      child.once('error', (error) => {
        lines.close()
        rejectAll(new AcpClientError('SPAWN_FAILED', error.message))
        resolvePromise()
      })
      child.once('close', (code) => {
        lines.close()
        this.closed = true
        const suffix = this.stderrTail.trim() ? `: ${this.stderrTail.trim()}` : ''
        rejectAll(new AcpClientError('PROCESS_EXITED', `ACP server exited with code ${code ?? 'null'}${suffix}`))
        resolvePromise()
      })
    })
    return child
  }

  private sendRaw(payload: Record<string, unknown>): void {
    const child = this.ensureStarted()
    if (!child.stdin.writable) {
      throw new AcpClientError('STDIN_CLOSED', 'ACP stdin stream is closed')
    }
    child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private request<T = Record<string, unknown>>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    this.ensureStarted()
    const id = ++this.nextId
    const budget = timeoutMs ?? this.options.timeoutMs ?? 60_000
    return new Promise<T>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rejectPromise(new AcpClientError('REQUEST_TIMEOUT', `ACP request "${method}" timed out`))
      }, budget)
      this.pending.set(id, {
        resolve: resolvePromise as (value: unknown) => void,
        reject: rejectPromise,
        timer,
      })
      try {
        this.sendRaw({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        rejectPromise(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.sendRaw({ jsonrpc: '2.0', method, params })
  }

  private handleMessage(msg: Record<string, unknown>): void {
    if (typeof msg.method === 'string' && msg.id !== undefined) {
      void this.handleAgentRequest(msg.id as string | number, msg.method, isPlainObject(msg.params) ? msg.params : {})
      return
    }
    if (msg.method === 'session/update' && isPlainObject(msg.params)) {
      const sid = typeof msg.params.sessionId === 'string' ? msg.params.sessionId : ''
      const listener = this.sessionListeners.get(sid)
      if (listener && isPlainObject(msg.params.update)) {
        const events = this.normalizeUpdate(msg.params.update)
        for (const event of events) listener(event)
      }
      return
    }
    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
      const entry = this.pending.get(msg.id)!
      clearTimeout(entry.timer)
      this.pending.delete(msg.id)
      if (isPlainObject(msg.error)) {
        const errMsg = typeof msg.error.message === 'string' ? msg.error.message : 'ACP request failed'
        const errCode = Number(msg.error.code ?? -32000)
        entry.reject(new AcpClientError(errCode === -32000 && /auth/iu.test(errMsg) ? 'AUTH_REQUIRED' : 'RPC_ERROR', errMsg))
      } else {
        entry.resolve(msg.result)
      }
    }
  }

  private normalizeUpdate(update: Record<string, unknown>): AcpStreamEvent[] {
    const kind = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : ''
    const content = isPlainObject(update.content) ? update.content : undefined
    if (kind === 'agent_message_chunk' && content?.type === 'text' && typeof content.text === 'string') {
      return [{ type: 'message_delta', text: content.text }]
    }
    if (kind === 'agent_thought_chunk' && content?.type === 'text' && typeof content.text === 'string') {
      return [{ type: 'thought_delta', text: content.text }]
    }
    if (kind === 'plan' && Array.isArray(update.entries)) {
      const entries = update.entries.filter(isPlainObject).map((entry) => ({
        content: String(entry.content ?? ''),
        ...(typeof entry.status === 'string' ? { status: entry.status } : {}),
        ...(typeof entry.priority === 'string' ? { priority: entry.priority } : {}),
      }))
      return [{ type: 'plan_update', entries }]
    }
    if (kind === 'tool_call') {
      return [{
        type: 'tool_call',
        toolCallId: String(update.toolCallId ?? ''),
        ...(typeof update.title === 'string' ? { title: update.title } : {}),
        ...(typeof update.kind === 'string' ? { kind: update.kind } : {}),
        ...(typeof update.status === 'string' ? { status: update.status } : {}),
        ...(update.rawInput !== undefined ? { rawInput: update.rawInput } : {}),
      }]
    }
    if (kind === 'tool_call_update') {
      const diffItem = Array.isArray(update.content)
        ? update.content.find(item => isPlainObject(item) && item.type === 'diff' && typeof item.path === 'string')
        : undefined
      return [{
        type: 'tool_call_update',
        toolCallId: String(update.toolCallId ?? ''),
        ...(typeof update.status === 'string' ? { status: update.status } : {}),
        ...(update.content !== undefined ? { content: update.content } : {}),
        ...(isPlainObject(diffItem)
          ? {
              diff: {
                path: String(diffItem.path),
                ...(typeof diffItem.oldText === 'string' ? { oldText: diffItem.oldText } : {}),
                ...(typeof diffItem.newText === 'string' ? { newText: diffItem.newText } : {}),
              },
            }
          : {}),
      }]
    }
    return []
  }

  private async handleAgentRequest(id: string | number, method: string, params: Record<string, unknown>): Promise<void> {
    const reply = (payload: Record<string, unknown>): void => {
      try {
        this.sendRaw({ jsonrpc: '2.0', id, ...payload })
      } catch {}
    }

    if (method === 'session/request_permission') {
      const handler = this.options.handlers?.onPermissionRequest
      if (!handler) {
        reply({ result: { outcome: { outcome: 'cancelled' } } })
        return
      }
      try {
        const req: AcpPermissionRequest = {
          requestId: id,
          sessionId: String(params.sessionId ?? ''),
          toolCall: isPlainObject(params.toolCall)
            ? {
                title: typeof params.toolCall.title === 'string' ? params.toolCall.title : undefined,
                kind: typeof params.toolCall.kind === 'string' ? params.toolCall.kind : undefined,
                rawInput: params.toolCall.rawInput,
              }
            : undefined,
          options: Array.isArray(params.options)
            ? params.options.filter(isPlainObject).map(opt => ({
                optionId: String(opt.optionId ?? ''),
                name: typeof opt.name === 'string' ? opt.name : undefined,
                kind: typeof opt.kind === 'string' ? opt.kind : undefined,
              }))
            : [],
        }
        const decision = await handler(req)
        reply({ result: decision })
      } catch {
        reply({ result: { outcome: { outcome: 'cancelled' } } })
      }
      return
    }

    if (method === 'fs/read_text_file') {
      try {
        const safePath = await assertWorkspaceContained(this.options.cwd, String(params.path ?? ''))
        const raw = await readFile(safePath, 'utf8')
        const line = typeof params.line === 'number' ? params.line : undefined
        const limit = typeof params.limit === 'number' ? params.limit : undefined
        reply({ result: { content: parseLineSlice(raw, line, limit) } })
      } catch (error) {
        reply({
          error: {
            code: error instanceof AcpClientError && error.code === 'WORKSPACE_ESCAPE' ? -32602 : -32000,
            message: error instanceof Error ? error.message : 'failed to read file',
          },
        })
      }
      return
    }

    if (method === 'fs/write_text_file') {
      try {
        const safePath = await assertWorkspaceContained(this.options.cwd, String(params.path ?? ''))
        const content = typeof params.content === 'string' ? params.content : ''
        const approved = this.options.handlers?.onFsWriteApprove
          ? await this.options.handlers.onFsWriteApprove(safePath, content)
          : false
        if (!approved) {
          reply({ error: { code: -32001, message: 'file write rejected by client policy' } })
          return
        }
        await writeFile(safePath, content, 'utf8')
        reply({ result: {} })
      } catch (error) {
        reply({ error: { code: -32000, message: error instanceof Error ? error.message : 'failed to write file' } })
      }
      return
    }

    reply({ error: { code: -32601, message: `Unsupported client method: ${method}` } })
  }

  async initialize(
    clientInfo: { name: string; version: string } = { name: 'deepseek-harness-desktop', version: '5.4.0' },
    clientCapabilities: {
      fs?: { readTextFile?: boolean; writeTextFile?: boolean }
      terminal?: boolean
    } = { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
  ): Promise<AcpNegotiatedCapabilities> {
    const result = await this.request<Record<string, unknown>>('initialize', {
      protocolVersion: 1,
      clientCapabilities,
      clientInfo,
    }, 30_000)
    const protocolVersion = Number(result.protocolVersion ?? 0)
    if (protocolVersion !== 1) {
      throw new AcpClientError('UNSUPPORTED_PROTOCOL', `unsupported ACP protocolVersion: ${String(result.protocolVersion)}`)
    }
    const caps = isPlainObject(result.agentCapabilities) ? result.agentCapabilities : {}
    const mcpCaps = isPlainObject(caps.mcpCapabilities) ? caps.mcpCapabilities : {}
    const authMethods = Array.isArray(result.authMethods)
      ? result.authMethods.filter(isPlainObject).map(m => ({
          id: String(m.id ?? ''),
          name: typeof m.name === 'string' ? m.name : undefined,
        }))
      : []
    const agentInfo = isPlainObject(result.agentInfo)
      ? {
          name: typeof result.agentInfo.name === 'string' ? result.agentInfo.name : undefined,
          version: typeof result.agentInfo.version === 'string' ? result.agentInfo.version : undefined,
        }
      : undefined
    this.negotiated = {
      protocolVersion,
      agentInfo,
      loadSession: Boolean(caps.loadSession),
      mcpHttp: Boolean(mcpCaps.http),
      mcpSse: Boolean(mcpCaps.sse),
      authMethods,
      raw: caps,
    }
    return this.negotiated
  }

  async authenticate(methodId: string): Promise<void> {
    await this.request('authenticate', { methodId }, 60_000)
  }

  private parseSessionPayload(result: Record<string, unknown>): {
    acpSessionId: string
    currentModelId?: string
    availableModels: AcpModelOption[]
    configOptions: AcpConfigOption[]
  } {
    const acpSessionId = typeof result.sessionId === 'string' ? result.sessionId : ''
    if (!acpSessionId) throw new AcpClientError('INVALID_SESSION', 'ACP agent did not return a sessionId')
    const modelsObj = isPlainObject(result.models) ? result.models : undefined
    const availableModels = Array.isArray(modelsObj?.availableModels)
      ? modelsObj.availableModels.filter(isPlainObject).map(m => ({
          id: String(m.modelId ?? m.id ?? ''),
          name: typeof m.name === 'string' ? m.name : undefined,
        }))
      : []
    const configOptions = Array.isArray(result.configOptions)
      ? result.configOptions.filter(isPlainObject).map(opt => ({
          id: String(opt.id ?? ''),
          name: typeof opt.name === 'string' ? opt.name : undefined,
          currentValue: typeof opt.currentValue === 'string' ? opt.currentValue : undefined,
          options: Array.isArray(opt.options)
            ? opt.options.filter(isPlainObject).map(o => ({
                value: String(o.value ?? ''),
                name: typeof o.name === 'string' ? o.name : undefined,
              }))
            : undefined,
        }))
      : []
    return {
      acpSessionId,
      currentModelId: typeof modelsObj?.currentModelId === 'string' ? modelsObj.currentModelId : undefined,
      availableModels,
      configOptions,
    }
  }

  async newSession({ cwd, mcpServers = [] }: { cwd: string; mcpServers?: AcpMcpServerParam[] }) {
    const res = await this.request<Record<string, unknown>>('session/new', { cwd, mcpServers }, 30_000)
    return this.parseSessionPayload(res)
  }

  async loadSession({ sessionId, cwd, mcpServers = [] }: { sessionId: string; cwd: string; mcpServers?: AcpMcpServerParam[] }) {
    if (!this.negotiated?.loadSession) {
      throw new AcpClientError('CAPABILITY_UNSUPPORTED', 'ACP agent does not declare loadSession capability')
    }
    const res = await this.request<Record<string, unknown>>('session/load', { sessionId, cwd, mcpServers }, 30_000)
    return this.parseSessionPayload({ sessionId, ...res })
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.request('session/set_model', { sessionId, modelId }, 15_000)
  }

  async setConfigOption(sessionId: string, configId: string, value: string): Promise<void> {
    await this.request('session/set_config_option', { sessionId, configId, value }, 15_000)
  }

  async prompt({
    sessionId,
    text,
    signal,
    onEvent,
    timeoutMs,
  }: {
    sessionId: string
    text: string
    signal?: AbortSignal
    onEvent?: (event: AcpStreamEvent) => void
    timeoutMs?: number
  }): Promise<{ stopReason: string }> {
    signal?.throwIfAborted()
    if (onEvent) this.sessionListeners.set(sessionId, onEvent)
    const onAbort = (): void => {
      try { this.notify('session/cancel', { sessionId }) } catch {}
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await this.request<Record<string, unknown>>('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text }],
      }, timeoutMs ?? this.options.timeoutMs ?? 180_000)
      const stopReason = typeof res.stopReason === 'string' ? res.stopReason : 'end_turn'
      onEvent?.({ type: 'turn_finished', stopReason })
      return { stopReason }
    } finally {
      signal?.removeEventListener('abort', onAbort)
      this.sessionListeners.delete(sessionId)
    }
  }

  cancel(sessionId: string): void {
    try { this.notify('session/cancel', { sessionId }) } catch {}
  }

  async close(): Promise<void> {
    this.closed = true
    const child = this.child
    if (!child) return
    try { child.stdin.end() } catch {}
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGKILL') } catch {}
        }
      }, 500)
      killTimer.unref()
      await this.closePromise
      clearTimeout(killTimer)
    }
  }
}
