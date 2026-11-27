import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

function parseConfigOptions(value: unknown): AcpConfigOption[] {
  if (!Array.isArray(value)) return []
  return value.filter(isPlainObject).filter(opt => typeof opt.id === 'string').map(opt => ({
    id: String(opt.id),
    name: typeof opt.name === 'string' ? opt.name : undefined,
    category: typeof opt.category === 'string' ? opt.category : undefined,
    currentValue: typeof opt.currentValue === 'string' ? opt.currentValue : undefined,
    options: Array.isArray(opt.options) ? opt.options.filter(isPlainObject)
      .flatMap(entry => Array.isArray(entry.options) ? entry.options.filter(isPlainObject) : [entry])
      .filter(entry => typeof entry.value === 'string')
      .map(entry => ({ value: String(entry.value), name: typeof entry.name === 'string' ? entry.name : undefined })) : undefined,
  }))
}

function toDiff(content: unknown): { path: string; oldText?: string; newText?: string } | undefined {
  const item = Array.isArray(content)
    ? content.filter(isPlainObject).find(item => item.type === 'diff' && typeof item.path === 'string')
    : undefined
  if (!item) return undefined
  return {
    path: String(item.path),
    ...(typeof item.oldText === 'string' ? { oldText: item.oldText } : {}),
    ...(typeof item.newText === 'string' ? { newText: item.newText } : {}),
  }
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
  private shutdown?: Promise<void>
  private nextId = 0
  private pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private sessionListeners = new Map<string, (event: AcpStreamEvent) => void>()
  private fileSystem = { readTextFile: false, writeTextFile: false }
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

    child.stderr.resume()
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
        rejectAll(new AcpClientError('PROCESS_EXITED', 'ACP process exited with status ' + String(code)))
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
        const missingSession = errCode === -32004 || /(?:session|thread).*(?:not found|does not exist)/iu.test(errMsg)
        const failure = (errCode === -32000 && /auth|logged in|login|sign.in|credential/iu.test(errMsg)) || errCode === 401
          ? 'AUTH_REQUIRED'
          : errCode === 429 || /rate.limit|too many requests/iu.test(errMsg) ? 'RATE_LIMITED' : 'RPC_ERROR'
        entry.reject(new AcpClientError(missingSession ? 'REMOTE_SESSION_NOT_FOUND' : failure, errMsg))
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
    if (kind === 'config_option_update' && Array.isArray(update.configOptions)) {
      return [{ type: 'config_option_update', configOptions: parseConfigOptions(update.configOptions) }]
    }
    if (kind === 'usage_update') {
      const usage = isPlainObject(update.usage) ? update.usage : update
      const cost = isPlainObject(usage.cost) && typeof usage.cost.amount === 'number' && typeof usage.cost.currency === 'string'
        ? { amount: usage.cost.amount, currency: usage.cost.currency }
        : undefined
      return [{
        type: 'usage_update',
        ...(typeof usage.used === 'number' ? { used: usage.used } : {}),
        ...(typeof usage.size === 'number' ? { size: usage.size } : {}),
        ...(cost ? { cost } : {}),
      }]
    }
    if (kind === 'tool_call') {
      if (typeof update.toolCallId !== 'string' || !update.toolCallId) return []
      const diff = toDiff(update.content)
      return [{
        type: 'tool_call',
        toolCallId: update.toolCallId,
        ...(typeof update.title === 'string' ? { title: update.title } : {}),
        ...(typeof update.kind === 'string' ? { kind: update.kind } : {}),
        ...(typeof update.status === 'string' ? { status: update.status } : {}),
        ...(update.rawInput !== undefined ? { rawInput: update.rawInput } : {}),
        ...(diff ? { diff } : {}),
      }]
    }
    if (kind === 'tool_call_update') {
      if (typeof update.toolCallId !== 'string' || !update.toolCallId) return []
      const diff = toDiff(update.content)
      return [{
        type: 'tool_call_update',
        toolCallId: update.toolCallId,
        ...(typeof update.status === 'string' ? { status: update.status } : {}),
        ...(update.content !== undefined ? { content: update.content } : {}),
        ...(diff ? { diff } : {}),
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
      if (!this.fileSystem.readTextFile) {
        reply({ error: { code: -32601, message: 'ACP client filesystem reads are disabled' } })
        return
      }
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
      if (!this.fileSystem.writeTextFile) {
        reply({ error: { code: -32601, message: 'ACP client filesystem writes are disabled' } })
        return
      }
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
        const confirmedPath = await assertWorkspaceContained(this.options.cwd, String(params.path ?? ''))
        if (confirmedPath !== safePath) throw new AcpClientError('WORKSPACE_ESCAPE', 'ACP file path changed during approval')
        await writeFile(confirmedPath, content, 'utf8')
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
    timeoutMs = 30_000,
  ): Promise<AcpNegotiatedCapabilities> {
    this.fileSystem = {
      readTextFile: clientCapabilities.fs?.readTextFile === true,
      writeTextFile: clientCapabilities.fs?.writeTextFile === true,
    }
    const result = await this.request<Record<string, unknown>>('initialize', {
      protocolVersion: 1,
      clientCapabilities,
      clientInfo,
    }, timeoutMs)
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
    const configOptions = parseConfigOptions(result.configOptions)
    const model = configOptions.find(option => option.category === 'model')
    const legacyModels = Array.isArray(modelsObj?.availableModels)
      ? modelsObj.availableModels.filter(isPlainObject).map(m => ({
          id: String(m.modelId ?? m.id ?? ''),
          name: typeof m.name === 'string' ? m.name : undefined,
        }))
      : []
    const availableModels = model?.options?.map(option => ({ id: option.value, name: option.name })) ?? legacyModels
    return {
      acpSessionId,
      currentModelId: model?.currentValue ?? (typeof modelsObj?.currentModelId === 'string' ? modelsObj.currentModelId : undefined),
      availableModels,
      configOptions,
    }
  }

  async newSession({ cwd, mcpServers = [], timeoutMs = 30_000 }: {
    cwd: string; mcpServers?: AcpMcpServerParam[]; timeoutMs?: number
  }) {
    const res = await this.request<Record<string, unknown>>('session/new', { cwd, mcpServers }, timeoutMs)
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
    await this.updateConfigOption(sessionId, configId, value)
  }

  async updateConfigOption(sessionId: string, configId: string, value: string): Promise<AcpConfigOption[] | undefined> {
    const result = await this.request<Record<string, unknown>>('session/set_config_option', { sessionId, configId, value }, 15_000)
    return Array.isArray(result?.configOptions) ? parseConfigOptions(result.configOptions) : undefined
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
    return this.shutdown ??= this.closeProcess()
  }

  private async closeProcess(): Promise<void> {
    this.closed = true
    const child = this.child
    if (!child) return
    try { child.stdin.end() } catch {}
    const isRunning = () => child.pid !== undefined && child.exitCode === null && child.signalCode === null
    const killChild = () => {
      if (isRunning()) try { child.kill('SIGKILL') } catch {}
    }
    const closeTimer = setTimeout(() => {
      if (!isRunning()) return
      const systemRoot = process.env.SystemRoot
      if (process.platform === 'win32' && systemRoot && isAbsolute(systemRoot) && child.pid !== undefined) {
        try {
          const task = spawn(join(systemRoot, 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], {
            shell: false, windowsHide: true, stdio: 'ignore',
          })
          task.once('error', killChild)
          task.once('exit', code => { if (code !== 0) killChild() })
          task.unref()
          return
        } catch {}
      }
      killChild()
    }, 100)
    const pipeTimer = setTimeout(() => {
      killChild()
      child.stdout.destroy()
      child.stderr.destroy()
    }, 240)
    try {
      await this.closePromise
    } finally {
      clearTimeout(closeTimer)
      clearTimeout(pipeTimer)
    }
  }
}
