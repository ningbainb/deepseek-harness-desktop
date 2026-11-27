import { statusPath, type CliModel, type Diagnostic } from '../config.ts'

export interface AcpConfigOption {
  id: string
  name?: string
  category?: string
  currentValue?: string
  options?: Array<{ value: string; name?: string }>
}

export interface AcpEngine {
  id: string
  name: string
  installCommand?: string
  custom?: boolean
}

export interface AcpEngineProbe {
  agentId: string
  state: 'installed' | 'ready' | 'not-installed' | 'not-authenticated' | 'error'
  authHint?: 'credentials-present'
  error?: string
}

export interface AcpPlanEntry {
  content: string
  status?: string
  priority?: string
}

export interface AcpToolCallItem {
  toolCallId: string
  title?: string
  kind?: string
  status?: string
  diff?: { path: string; oldText?: string; newText?: string }
}

export interface AcpPermissionPrompt {
  permissionId: string
  title?: string
  kind?: string
  rawInput?: unknown
  options: Array<{ optionId: string; name?: string; kind?: string }>
  resolving?: boolean
}

export interface AcpChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  thoughts?: string
  plan?: AcpPlanEntry[]
  toolCalls?: AcpToolCallItem[]
  pendingPermission?: AcpPermissionPrompt
  queuedPermissions?: AcpPermissionPrompt[]
  usage?: { used?: number; size?: number }
  modelId?: string
  streaming?: boolean
  error?: string
}

export interface AcpStoreState {
  active: boolean
  agentId: string
  conversationId?: string
  diagnostic: Diagnostic | null
  selectedModelId?: string
  cwd?: string
  dshSessionId?: string
  acpSessionId?: string
  availableModels: CliModel[]
  configOptions: AcpConfigOption[]
  messages: AcpChatMessage[]
  busy: boolean
  starting: boolean
  error?: string
}

export const STATUS_UPDATED_EVENT = 'dsh-antigravity-status-updated'
export const ACP_OPEN_EVENT = 'dsh-antigravity-acp-open'
const ACP_SELECTION_EVENT = 'dsh-antigravity-acp-selection'
const PANEL_ACTIVATE_EVENT = 'dsh-panel-activate'
const ACP_PANEL_NAME = 'antigravity-acp'
const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
const ACP_HEADERS = { 'content-type': 'application/json', 'x-dsh-acp': '1' }

async function acpInteractionHeaders(operation: 'start' | 'prompt', bodyJson: string): Promise<Record<string, string>> {
  const desktop = (globalThis as typeof globalThis & {
    dshDesktop?: { createAcpInteractionProof?: (operation: 'start' | 'prompt', bodyJson: string) => Promise<string | undefined> }
  }).dshDesktop
  try {
    const proof = await desktop?.createAcpInteractionProof?.(operation, bodyJson)
    if (proof) return { ...ACP_HEADERS, 'x-dsh-acp-interaction': proof }
  } catch {}
  return ACP_HEADERS
}

function newId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string }
    if (typeof data?.error === 'string' && data.error.trim()) return data.error
  } catch {}
  return `${fallback} (HTTP ${response.status})`
}

function normalizeModels(
  sessionModels?: Array<{ id: string; name?: string }>,
  diagModels?: CliModel[],
): CliModel[] {
  const source = sessionModels && sessionModels.length > 0 ? sessionModels : (diagModels ?? [])
  return source.map(m => ({ id: m.id, name: m.name?.trim() || m.id }))
}

export class AntigravityAcpStore {
  private state: AcpStoreState = {
    active: false,
    agentId: 'antigravity',
    diagnostic: null,
    availableModels: [],
    configOptions: [],
    messages: [],
    busy: false,
    starting: false,
  }
  private listeners = new Set<() => void>()
  private abortController: AbortController | null = null
  private diagPromise: Promise<Diagnostic | null> | null = null
  private startPromise: Promise<string | undefined> | null = null
  private readonly engineSessions = new Map<string, Pick<AcpStoreState, 'dshSessionId' | 'messages' | 'selectedModelId'>>()
  private listenersBound = false
  private sessionSeq = 0
  private disconnected = false

  constructor(private readonly bindsWindowEvents = true) {}

  getSnapshot = (): AcpStoreState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.ensureWindowListeners()
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(patch: Partial<AcpStoreState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
    if ('active' in patch || 'selectedModelId' in patch || 'configOptions' in patch || 'starting' in patch) {
      this.announceSelection()
    }
  }

  private announceSelection(): void {
    if (!this.bindsWindowEvents || typeof document === 'undefined') return
    const { active, agentId, conversationId, selectedModelId, starting, configOptions } = this.state
    document.dispatchEvent(new CustomEvent(ACP_SELECTION_EVENT, { detail: active && agentId === 'antigravity' ? {
      conversationId, modelId: selectedModelId, starting,
      thoughtOption: configOptions.find(option => option.id === 'thought_level'),
    } : null }))
  }

  private ensureWindowListeners(): void {
    if (!this.bindsWindowEvents || this.listenersBound || typeof window === 'undefined' || typeof document === 'undefined') return
    this.listenersBound = true
    window.addEventListener(STATUS_UPDATED_EVENT, () => {
      void this.refreshDiagnostic(true)
    })
    document.addEventListener(ACP_OPEN_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<{ modelId?: string; cwd?: string; conversationId?: string }>).detail
      if (detail?.conversationId) void this.openWithModel(detail.modelId, detail.cwd, detail.conversationId)
    })
    document.addEventListener('dsh-antigravity-acp-selection-request', () => this.announceSelection())
    document.addEventListener('dsh-antigravity-acp-deactivate', (event: Event) => {
      if ((event as CustomEvent<string>).detail === this.state.conversationId) this.closeToNormalChat()
    })
    document.addEventListener('dsh-antigravity-acp-effort', (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string; value?: string }>).detail
      const option = this.state.configOptions.find(item => item.id === 'thought_level')
      if (this.state.active && !this.state.busy && !this.state.starting && option && detail
        && detail.conversationId === this.state.conversationId && detail.value
        && option.options?.some(item => item.value === detail.value)) void this.setConfigOption(option.id, detail.value)
    })
    document.addEventListener(PANEL_ACTIVATE_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail !== ACP_PANEL_NAME && this.state.active) {
        this.emit({ active: false })
      }
    })
    document.addEventListener('click', (event: MouseEvent) => {
      if (!this.state.active) return
      const target = event.target as HTMLElement | null
      if (target?.closest(SIDEBAR_ROW_SELECTOR)) {
        this.emit({ active: false })
      }
    }, true)
  }

  private announceActivePanel(): void {
    if (!this.bindsWindowEvents || typeof document === 'undefined') return
    document.documentElement.removeAttribute('data-dsh-taskboard-active')
    document.documentElement.removeAttribute('data-dsh-ssh-active')
    document.dispatchEvent(new CustomEvent(PANEL_ACTIVATE_EVENT, { detail: ACP_PANEL_NAME }))
  }

  async refreshDiagnostic(force = false): Promise<Diagnostic | null> {
    if (!force && this.diagPromise) return this.diagPromise
    let promise!: Promise<Diagnostic | null>
    promise = (async () => {
      try {
        const res = await fetch(statusPath, { headers: { 'x-dsh-antigravity': '1' } })
        if (!res.ok) return null
        const diag = await res.json() as Diagnostic
        if (this.diagPromise !== promise) return diag
        if (this.state.agentId !== 'antigravity') {
          this.emit({ diagnostic: diag })
          return diag
        }
        const availableModels = normalizeModels(
          this.state.acpSessionId ? this.state.availableModels : undefined,
          diag.models,
        )
        const selectedModelId = this.state.selectedModelId ?? availableModels[0]?.id
        this.emit({ diagnostic: diag, availableModels, selectedModelId })
        return diag
      } catch {
        return null
      } finally {
        if (this.diagPromise === promise) this.diagPromise = null
      }
    })()
    this.diagPromise = promise
    return promise
  }

  private async ensureStarted(targetModelId?: string, targetCwd?: string): Promise<string | undefined> {
    if (this.disconnected) return undefined
    const desiredCwd = targetCwd ?? this.state.cwd
    if (this.state.dshSessionId && this.state.acpSessionId && desiredCwd === this.state.cwd) {
      if (targetModelId && targetModelId !== this.state.selectedModelId) {
        await this.switchModel(targetModelId)
      }
      return this.state.dshSessionId
    }
    if (this.startPromise) {
      await this.startPromise
      if (this.state.dshSessionId && this.state.acpSessionId && desiredCwd === this.state.cwd) {
        if (targetModelId && targetModelId !== this.state.selectedModelId) {
          await this.switchModel(targetModelId)
        }
        return this.state.dshSessionId
      }
    }

    const seq = ++this.sessionSeq
    const sessionKey = this.state.dshSessionId && desiredCwd === this.state.cwd
      ? this.state.dshSessionId
      : newId('antigravity-acp')
    const modelToUse = targetModelId ?? this.state.selectedModelId
    this.emit({
      starting: true,
      error: undefined,
      dshSessionId: sessionKey,
      cwd: desiredCwd,
    })

    let promise!: Promise<string | undefined>
    promise = (async () => {
      try {
        const body = JSON.stringify({
          agentId: this.state.agentId,
          dshSessionId: sessionKey,
          cwd: desiredCwd,
          modelId: modelToUse,
          conversationId: this.state.conversationId,
          commandOverride: this.state.agentId === 'antigravity' ? this.state.diagnostic?.path : undefined,
          ...(this.state.conversationId || this.state.agentId !== 'antigravity' ? { resume: true } : {}),
        })
        const res = await fetch('/api/dsh-acp/session/start', {
          method: 'POST',
          headers: await acpInteractionHeaders('start', body),
          body,
        })
        if (!res.ok) {
          throw new Error(await readApiError(res, '无法启动 Antigravity 交互会话'))
        }
        const data = await res.json() as {
          session: {
            sessionId: string
            acpSessionId: string
            cwd: string
            currentModelId?: string
            availableModels?: Array<{ id: string; name?: string }>
            configOptions?: AcpConfigOption[]
            transcript?: AcpChatMessage[]
          }
        }
        if (seq !== this.sessionSeq || this.disconnected) {
          await fetch('/api/dsh-acp/session/close', {
            method: 'POST', headers: ACP_HEADERS, body: JSON.stringify({ sessionId: data.session.sessionId }),
          }).catch(() => {})
          return undefined
        }
        const models = normalizeModels(data.session.availableModels,
          this.state.agentId === 'antigravity' ? this.state.diagnostic?.models : undefined)
        this.emit({
          starting: false,
          dshSessionId: data.session.sessionId,
          acpSessionId: data.session.acpSessionId,
          cwd: data.session.cwd,
          availableModels: models,
          configOptions: data.session.configOptions ?? [],
          ...(!this.state.messages.length && Array.isArray(data.session.transcript) ? { messages: data.session.transcript } : {}),
          selectedModelId: data.session.currentModelId ?? modelToUse ?? models[0]?.id,
          error: undefined,
        })
        return data.session.sessionId
      } catch (err) {
        if (seq === this.sessionSeq) {
          this.emit({
            starting: false,
            acpSessionId: undefined,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        return undefined
      } finally {
        if (this.startPromise === promise) this.startPromise = null
      }
    })()

    this.startPromise = promise
    return promise
  }

  async openWithModel(modelId?: string, cwd?: string, conversationId = this.state.conversationId): Promise<void> {
    return this.openEngine('antigravity', cwd, conversationId, modelId)
  }

  async openEngine(agentId: string, cwd?: string, conversationId = this.state.conversationId, modelId?: string): Promise<void> {
    if (this.disconnected) return
    this.ensureWindowListeners()
    const nextCwd = cwd ?? this.state.cwd
    const sameConversation = agentId === this.state.agentId
      && conversationId === this.state.conversationId && nextCwd === this.state.cwd
    if (this.state.busy || this.state.starting) {
      if (sameConversation && !this.state.active) {
        this.announceActivePanel()
        this.emit({ active: true })
      }
      return
    }
    this.announceActivePanel()
    const targetKey = this.engineKey(agentId, conversationId)
    const saved = this.engineSessions.get(targetKey)
    const chosenModel = modelId ?? (sameConversation
      ? this.state.selectedModelId ?? this.state.availableModels[0]?.id
      : saved?.selectedModelId ?? (agentId === 'antigravity' ? this.state.diagnostic?.models[0]?.id : undefined))
    if (!sameConversation && this.state.dshSessionId) {
      const previousSessionId = this.state.dshSessionId
      this.engineSessions.set(this.engineKey(this.state.agentId, this.state.conversationId), {
        dshSessionId: previousSessionId, messages: this.state.messages, selectedModelId: this.state.selectedModelId,
      })
      this.emit({ active: true, starting: true, agentId, conversationId, messages: [], configOptions: [], selectedModelId: chosenModel, error: undefined })
      await fetch('/api/dsh-acp/session/close', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId: previousSessionId }),
      }).catch(() => {})
      this.emit({ acpSessionId: undefined, dshSessionId: undefined, messages: [] })
    } else {
      this.emit({ active: true, agentId, conversationId, ...(this.state.acpSessionId ? {} : { selectedModelId: chosenModel }) })
    }
    if (!sameConversation && (conversationId || agentId !== 'antigravity')) {
      this.emit({ starting: true })
      const sessionKey = saved?.dshSessionId ?? await this.engineSessionId(agentId, conversationId)
      this.emit({ dshSessionId: sessionKey, cwd: nextCwd, messages: saved?.messages ?? [], availableModels: [], configOptions: [] })
    }
    await this.ensureStarted(chosenModel, nextCwd)
  }

  private engineKey(agentId: string, conversationId: string | undefined): string {
    return JSON.stringify([agentId, conversationId])
  }

  private async engineSessionId(agentId: string, conversationId: string | undefined): Promise<string> {
    if (!conversationId || !globalThis.crypto?.subtle) return newId('acp')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.engineKey(agentId, conversationId)))
    const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    return 'acp-' + id
  }

  async switchModel(modelId: string): Promise<void> {
    if (this.state.starting) return
    if (!this.state.dshSessionId || !this.state.acpSessionId) {
      await this.ensureStarted(modelId, this.state.cwd)
      return
    }
    if (modelId === this.state.selectedModelId) return
    this.emit({ starting: true, error: undefined })
    try {
      const res = await fetch('/api/dsh-acp/session/model', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId: this.state.dshSessionId, modelId }),
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, 'ACP model selection failed'))
      }
      const data = await res.json() as { modelId?: string; configOptions?: AcpConfigOption[] }
      this.emit({
        selectedModelId: data.modelId ?? modelId,
        ...(data.configOptions ? { configOptions: data.configOptions } : {}),
      })
    } catch (err) {
      this.emit({
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.emit({ starting: false })
    }
  }

  async setConfigOption(configId: string, value: string): Promise<void> {
    if (!this.state.dshSessionId || !this.state.acpSessionId) return
    try {
      const res = await fetch('/api/dsh-acp/session/config', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId: this.state.dshSessionId, configId, value }),
      })
      if (!res.ok) throw new Error(await readApiError(res, 'ACP option selection failed'))
      const data = await res.json() as { configOptions?: AcpConfigOption[] }
      this.applyConfigOptions(data.configOptions ?? this.state.configOptions.map(opt =>
        opt.id === configId ? { ...opt, currentValue: value } : opt))
    } catch (err) {
      this.emit({ error: err instanceof Error ? err.message : String(err) })
    }
  }

  private updateAssistant(messageId: string, updater: (msg: AcpChatMessage) => AcpChatMessage): void {
    this.emit({
      messages: this.state.messages.map(msg => (msg.id === messageId ? updater(msg) : msg)),
    })
  }

  async sendPrompt(rawText: string): Promise<void> {
    if (this.disconnected) return
    const text = rawText.trim()
    if (!text || this.state.busy || this.state.starting) return

    const userId = newId('user')
    const assistantId = newId('assistant')
    const currentModel = this.state.selectedModelId
    this.emit({
      busy: true,
      error: undefined,
      messages: [
        ...this.state.messages,
        { id: userId, role: 'user', text, modelId: currentModel },
        { id: assistantId, role: 'assistant', text: '', thoughts: '', toolCalls: [], streaming: true, modelId: currentModel },
      ],
    })

    const starting = this.ensureStarted(currentModel, this.state.cwd)
    const candidateId = this.state.dshSessionId
    const candidateBody = candidateId ? JSON.stringify({ sessionId: candidateId, text }) : undefined
    const candidateHeaders = candidateBody ? acpInteractionHeaders('prompt', candidateBody) : undefined
    const sessionId = await starting
    if (!sessionId) {
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        streaming: false,
        error: this.state.error ?? '会话未就绪，请检查本机 Antigravity CLI 登录状态。',
      }))
      this.emit({ busy: false })
      return
    }

    const controller = new AbortController()
    this.abortController = controller
    try {
      const body = JSON.stringify({ sessionId, text })
      const res = await fetch('/api/dsh-acp/session/prompt', {
        method: 'POST',
        headers: body === candidateBody && candidateHeaders ? await candidateHeaders : await acpInteractionHeaders('prompt', body),
        body,
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(await readApiError(res, '发送消息失败'))
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const processLine = (rawLine: string) => {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) return
        const payload = line.slice(5).trim()
        if (!payload) return
        let event: Record<string, unknown>
        try {
          event = JSON.parse(payload) as Record<string, unknown>
        } catch {
          return
        }
        this.applyStreamEvent(assistantId, event)
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/u)
        buffer = lines.pop() ?? ''
        for (const line of lines) processLine(line)
      }
      buffer += decoder.decode()
      for (const line of buffer.split(/\r?\n/u)) processLine(line)

      this.updateAssistant(assistantId, msg => ({
        ...msg,
        streaming: false,
        pendingPermission: undefined,
        queuedPermissions: undefined,
      }))
    } catch (err) {
      const isAbort = (err as Error)?.name === 'AbortError'
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        streaming: false,
        pendingPermission: undefined,
        queuedPermissions: undefined,
        ...(isAbort ? {} : { error: err instanceof Error ? err.message : String(err) }),
      }))
    } finally {
      if (this.abortController === controller) this.abortController = null
      this.emit({ busy: false })
    }
  }

  reportComposerError(error: string | undefined): void {
    this.emit({ error })
  }

  private applyConfigOptions(options: AcpConfigOption[]): void {
    const model = options.find(option => option.category === 'model')
    this.emit({
      configOptions: options,
      ...(model?.currentValue ? { selectedModelId: model.currentValue } : {}),
      ...(model?.options ? { availableModels: normalizeModels(model.options.map(option => ({ id: option.value, name: option.name }))) } : {}),
    })
  }

  private applyStreamEvent(assistantId: string, event: Record<string, unknown>): void {
    const type = event.type
    if (type === 'thought_delta' && typeof event.text === 'string') {
      this.updateAssistant(assistantId, msg => ({ ...msg, thoughts: `${msg.thoughts ?? ''}${event.text}` }))
    } else if (type === 'message_delta' && typeof event.text === 'string') {
      this.updateAssistant(assistantId, msg => ({ ...msg, text: `${msg.text}${event.text}` }))
    } else if (type === 'plan_update' && Array.isArray(event.entries)) {
      this.updateAssistant(assistantId, msg => ({ ...msg, plan: event.entries as AcpPlanEntry[] }))
    } else if (type === 'config_option_update' && Array.isArray(event.configOptions)) {
      this.applyConfigOptions(event.configOptions as AcpConfigOption[])
    } else if (type === 'usage_update') {
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        usage: {
          used: typeof event.used === 'number' ? event.used : undefined,
          size: typeof event.size === 'number' ? event.size : undefined,
        },
      }))
    } else if (type === 'tool_call') {
      const call: AcpToolCallItem = {
        toolCallId: String(event.toolCallId ?? ''),
        title: typeof event.title === 'string' ? event.title : undefined,
        kind: typeof event.kind === 'string' ? event.kind : undefined,
        status: typeof event.status === 'string' ? event.status : 'in_progress',
        ...(event.diff ? { diff: event.diff as AcpToolCallItem['diff'] } : {}),
      }
      this.updateAssistant(assistantId, msg => {
        const prev = msg.toolCalls ?? []
        const exists = prev.some(c => c.toolCallId === call.toolCallId)
        return {
          ...msg,
          toolCalls: exists ? prev.map(c => (c.toolCallId === call.toolCallId ? { ...c, ...call } : c)) : [...prev, call],
        }
      })
    } else if (type === 'tool_call_update') {
      const id = String(event.toolCallId ?? '')
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        toolCalls: (msg.toolCalls ?? []).map(c => (c.toolCallId === id
          ? {
              ...c,
              ...(typeof event.status === 'string' ? { status: event.status } : {}),
              ...(event.diff ? { diff: event.diff as AcpToolCallItem['diff'] } : {}),
            }
          : c)),
      }))
    } else if (type === 'permission_request') {
      const permission = {
        permissionId: String(event.permissionId ?? ''),
        title: typeof event.title === 'string' ? event.title : undefined,
        kind: typeof event.kind === 'string' ? event.kind : undefined,
        rawInput: event.rawInput,
        options: Array.isArray(event.options) ? event.options as AcpPermissionPrompt['options'] : [],
      }
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        ...(msg.pendingPermission
          ? { queuedPermissions: [...(msg.queuedPermissions ?? []), permission] }
          : { pendingPermission: permission }),
      }))
    } else if (type === 'turn_finished') {
      this.updateAssistant(assistantId, msg => ({ ...msg, streaming: false, pendingPermission: undefined, queuedPermissions: undefined }))
    } else if (type === 'error') {
      if (['PROCESS_EXITED', 'CLIENT_CLOSED', 'STDIN_CLOSED', 'SESSION_NOT_FOUND', 'REMOTE_SESSION_NOT_FOUND'].includes(String(event.code))) {
        this.emit({ acpSessionId: undefined })
      }
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        streaming: false,
        pendingPermission: undefined,
        queuedPermissions: undefined,
        error: typeof event.message === 'string' ? event.message : '请求失败',
      }))
    }
  }

  async resolvePermission(assistantMessageId: string, permissionId: string, optionId?: string, cancel = false): Promise<void> {
    this.updateAssistant(assistantMessageId, msg => (msg.pendingPermission?.permissionId === permissionId
      ? { ...msg, pendingPermission: { ...msg.pendingPermission, resolving: true } }
      : msg))
    try {
      const response = await fetch('/api/dsh-acp/session/permission', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ permissionId, optionId, cancel }),
      })
      if (!response.ok) throw new Error(String(response.status))
      this.updateAssistant(assistantMessageId, msg => {
        if (msg.pendingPermission?.permissionId !== permissionId) return msg
        const [next, ...queue] = msg.queuedPermissions ?? []
        return { ...msg, pendingPermission: next, queuedPermissions: queue }
      })
    } catch {
      this.updateAssistant(assistantMessageId, msg => msg.pendingPermission?.permissionId === permissionId
        ? { ...msg, pendingPermission: { ...msg.pendingPermission, resolving: false } }
        : msg)
    }
  }

  cancelTurn(): void {
    this.abortController?.abort()
    if (this.state.dshSessionId) {
      void fetch('/api/dsh-acp/session/cancel', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId: this.state.dshSessionId }),
      }).catch(() => {})
    }
  }

  async newConversation(): Promise<void> {
    this.cancelTurn()
    if (this.state.dshSessionId) {
      await fetch('/api/dsh-acp/session/close', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId: this.state.dshSessionId }),
      }).catch(() => {})
    }
    this.emit({
      dshSessionId: undefined,
      acpSessionId: undefined,
      messages: [],
      error: undefined,
      busy: false,
    })
    await this.ensureStarted(this.state.selectedModelId, this.state.cwd)
  }

  closeToNormalChat(): void {
    this.emit({ active: false })
  }

  async disconnect(): Promise<void> {
    this.disconnected = true
    const sessionId = this.state.dshSessionId
    this.cancelTurn()
    this.sessionSeq++
    if (!sessionId) return
    await fetch('/api/dsh-acp/session/close', {
      method: 'POST', headers: ACP_HEADERS, body: JSON.stringify({ sessionId }),
    }).catch(() => {})
  }

  resetForTests(): void {
    this.abortController?.abort()
    this.abortController = null
    this.diagPromise = null
    this.startPromise = null
    this.sessionSeq = 0
    this.disconnected = false
    this.engineSessions.clear()
    this.state = {
      active: false,
      agentId: 'antigravity',
      diagnostic: null,
      availableModels: [],
      configOptions: [],
      messages: [],
      busy: false,
      starting: false,
    }
    for (const listener of this.listeners) listener()
  }
}

export const acpStore = new AntigravityAcpStore()
acpStore.subscribe(() => {})()
