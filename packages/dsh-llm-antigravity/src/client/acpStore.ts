import { statusPath, type CliModel, type Diagnostic } from '../config.ts'

export interface AcpConfigOption {
  id: string
  name?: string
  currentValue?: string
  options?: Array<{ value: string; name?: string }>
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
  modelId?: string
  streaming?: boolean
  error?: string
}

export type AcpViewMode = 'inset' | 'pip' | 'minimized'

export interface AcpStoreState {
  active: boolean
  viewMode: AcpViewMode
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
const PANEL_ACTIVATE_EVENT = 'dsh-panel-activate'
const ACP_PANEL_NAME = 'antigravity-acp'
const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
const ACP_HEADERS = { 'content-type': 'application/json', 'x-dsh-acp': '1' }

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
    viewMode: 'inset',
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
  private listenersBound = false
  private sessionSeq = 0

  getSnapshot = (): AcpStoreState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.ensureWindowListeners()
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(patch: Partial<AcpStoreState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private ensureWindowListeners(): void {
    if (this.listenersBound || typeof window === 'undefined' || typeof document === 'undefined') return
    this.listenersBound = true
    window.addEventListener(STATUS_UPDATED_EVENT, () => {
      void this.refreshDiagnostic(true)
    })
    document.addEventListener(ACP_OPEN_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<{ modelId?: string; cwd?: string }>).detail
      void this.openWithModel(detail?.modelId, detail?.cwd)
    })
    document.addEventListener(PANEL_ACTIVATE_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail !== ACP_PANEL_NAME && this.state.active && this.state.viewMode === 'inset') {
        this.emit({ active: false })
      }
    })
    document.addEventListener('click', (event: MouseEvent) => {
      if (!this.state.active || this.state.viewMode !== 'inset') return
      const target = event.target as HTMLElement | null
      if (target?.closest(SIDEBAR_ROW_SELECTOR)) {
        this.emit({ active: false })
      }
    }, true)
  }

  private announceActivePanel(): void {
    if (typeof document === 'undefined') return
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
      ...(modelToUse ? { selectedModelId: modelToUse } : {}),
    })

    let promise!: Promise<string | undefined>
    promise = (async () => {
      try {
        const res = await fetch('/api/dsh-acp/session/start', {
          method: 'POST',
          headers: ACP_HEADERS,
          body: JSON.stringify({
            agentId: 'antigravity',
            dshSessionId: sessionKey,
            cwd: desiredCwd,
            modelId: modelToUse,
            commandOverride: this.state.diagnostic?.path,
          }),
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
          }
        }
        if (seq !== this.sessionSeq) return data.session.sessionId
        const models = normalizeModels(data.session.availableModels, this.state.diagnostic?.models)
        this.emit({
          starting: false,
          dshSessionId: data.session.sessionId,
          acpSessionId: data.session.acpSessionId,
          cwd: data.session.cwd,
          availableModels: models,
          configOptions: data.session.configOptions ?? [],
          selectedModelId: this.state.selectedModelId ?? data.session.currentModelId ?? models[0]?.id,
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

  async openWithModel(modelId?: string, cwd?: string): Promise<void> {
    this.ensureWindowListeners()
    const nextViewMode: AcpViewMode = !this.state.active || this.state.viewMode === 'minimized'
      ? 'inset'
      : this.state.viewMode
    if (nextViewMode === 'inset') this.announceActivePanel()
    const nextCwd = cwd ?? this.state.cwd
    const cwdChanged = Boolean(this.state.acpSessionId && cwd && cwd !== this.state.cwd)
    if (cwdChanged && this.state.dshSessionId) {
      await fetch('/api/dsh-acp/session/close', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId: this.state.dshSessionId }),
      }).catch(() => {})
      this.emit({ acpSessionId: undefined, dshSessionId: undefined, messages: [] })
    }
    const chosenModel = modelId ?? this.state.selectedModelId ?? this.state.availableModels[0]?.id
    this.emit({
      active: true,
      viewMode: nextViewMode,
      ...(chosenModel ? { selectedModelId: chosenModel } : {}),
      ...(nextCwd ? { cwd: nextCwd } : {}),
    })
    await this.ensureStarted(chosenModel, nextCwd)
  }

  setViewMode(viewMode: AcpViewMode): void {
    if (viewMode === 'inset') this.announceActivePanel()
    this.emit({ viewMode })
  }

  async switchModel(modelId: string): Promise<void> {
    const prev = this.state.selectedModelId
    this.emit({ selectedModelId: modelId, error: undefined })
    if (!this.state.dshSessionId || !this.state.acpSessionId) {
      await this.ensureStarted(modelId, this.state.cwd)
      return
    }
    try {
      const res = await fetch('/api/dsh-acp/session/model', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId: this.state.dshSessionId, modelId }),
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, '切换 Gemini 模型失败'))
      }
    } catch (err) {
      this.emit({
        selectedModelId: prev,
        error: err instanceof Error ? err.message : String(err),
      })
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
      if (!res.ok) throw new Error(await readApiError(res, '更新参数失败'))
      this.emit({
        configOptions: this.state.configOptions.map(opt =>
          opt.id === configId ? { ...opt, currentValue: value } : opt),
      })
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
    const text = rawText.trim()
    if (!text || this.state.busy) return

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

    const sessionId = await this.ensureStarted(currentModel, this.state.cwd)
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
      const res = await fetch('/api/dsh-acp/session/prompt', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ sessionId, text }),
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
      }))
    } catch (err) {
      const isAbort = (err as Error)?.name === 'AbortError'
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        streaming: false,
        pendingPermission: undefined,
        ...(isAbort ? {} : { error: err instanceof Error ? err.message : String(err) }),
      }))
    } finally {
      if (this.abortController === controller) this.abortController = null
      this.emit({ busy: false })
    }
  }

  private applyStreamEvent(assistantId: string, event: Record<string, unknown>): void {
    const type = event.type
    if (type === 'thought_delta' && typeof event.text === 'string') {
      this.updateAssistant(assistantId, msg => ({ ...msg, thoughts: `${msg.thoughts ?? ''}${event.text}` }))
    } else if (type === 'message_delta' && typeof event.text === 'string') {
      this.updateAssistant(assistantId, msg => ({ ...msg, text: `${msg.text}${event.text}` }))
    } else if (type === 'plan_update' && Array.isArray(event.entries)) {
      this.updateAssistant(assistantId, msg => ({ ...msg, plan: event.entries as AcpPlanEntry[] }))
    } else if (type === 'tool_call') {
      const call: AcpToolCallItem = {
        toolCallId: String(event.toolCallId ?? ''),
        title: typeof event.title === 'string' ? event.title : undefined,
        kind: typeof event.kind === 'string' ? event.kind : undefined,
        status: typeof event.status === 'string' ? event.status : 'in_progress',
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
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        pendingPermission: {
          permissionId: String(event.permissionId ?? ''),
          title: typeof event.title === 'string' ? event.title : undefined,
          kind: typeof event.kind === 'string' ? event.kind : undefined,
          rawInput: event.rawInput,
          options: Array.isArray(event.options) ? event.options as AcpPermissionPrompt['options'] : [],
        },
      }))
    } else if (type === 'turn_finished') {
      this.updateAssistant(assistantId, msg => ({ ...msg, streaming: false, pendingPermission: undefined }))
    } else if (type === 'error') {
      this.updateAssistant(assistantId, msg => ({
        ...msg,
        streaming: false,
        pendingPermission: undefined,
        error: typeof event.message === 'string' ? event.message : '请求失败',
      }))
    }
  }

  async resolvePermission(assistantMessageId: string, permissionId: string, optionId?: string, cancel = false): Promise<void> {
    this.updateAssistant(assistantMessageId, msg => (msg.pendingPermission
      ? { ...msg, pendingPermission: { ...msg.pendingPermission, resolving: true } }
      : msg))
    try {
      await fetch('/api/dsh-acp/session/permission', {
        method: 'POST',
        headers: ACP_HEADERS,
        body: JSON.stringify({ permissionId, optionId, cancel }),
      })
    } finally {
      this.updateAssistant(assistantMessageId, msg => ({ ...msg, pendingPermission: undefined }))
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

  resetForTests(): void {
    this.abortController?.abort()
    this.abortController = null
    this.diagPromise = null
    this.startPromise = null
    this.sessionSeq = 0
    this.state = {
      active: false,
      viewMode: 'inset',
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
