export interface SessionSummaryLike {
  id: string
  cwd?: string
  agentPreset?: string
  blank: boolean
}

export interface ModePreset {
  id: string
  label: string
  description?: string
}

export interface WorkspaceSummaryLike {
  /** Current dsh-client-runtime uses workspaceId; id keeps older hosts usable. */
  workspaceId?: string
  id?: string
  path: string
  sessionIds?: ReadonlyArray<string>
}

interface AgentPresetListValue {
  presets: ReadonlyArray<{ id: string; name?: string; description?: string; broken?: string; isDefault?: boolean }>
}

interface RpcEnvelope<T> {
  result: { ok: boolean; value?: T; error?: { message?: string } }
}

export interface ModeSwitcherDeps {
  sessions: {
    list: {
      getSnapshot(): { current: string | undefined; byId: Record<string, SessionSummaryLike> }
    }
    open(sessionId: string): void
    refresh(): Promise<void>
    clear(): void
    noteAgentPreset(sessionId: string, agentPreset: string): void
  }
  workspaces: {
    list: { getSnapshot(): { items: ReadonlyArray<WorkspaceSummaryLike> } }
  }
  api: {
    sessions: {
      create(request: { workspaceId?: string; cwd?: string; agentPreset: string }): Promise<RpcEnvelope<{ sessionId: string; agentPreset?: string }>>
    }
    agentPresets: {
      list(request: Record<string, never>): Promise<RpcEnvelope<AgentPresetListValue>>
      select(request: { sessionId: string; agentPreset: string }): Promise<RpcEnvelope<{ agentPreset: string }>>
    }
    settings?: {
      update(request: { ns: string; patch: { default: string } }): Promise<RpcEnvelope<unknown>>
    }
  }
}

const RETRY_DELAYS_MS = [0, 120, 360, 720] as const

export class ModeSwitcherController {
  constructor(private readonly deps: ModeSwitcherDeps) {}

  async list(): Promise<ModePreset[]> {
    const response = await this.deps.api.agentPresets.list({})
    if (!response.result.ok || response.result.value === undefined) {
      throw new Error(response.result.error?.message ?? 'agent preset list failed')
    }
    return response.result.value.presets
      .filter((preset) => preset.broken === undefined)
      .map((preset) => ({
        id: preset.id,
        label: preset.name ?? preset.id,
        ...(preset.description === undefined ? {} : { description: preset.description }),
      }))
  }

  async switch(sessionId: string, agentPreset: string): Promise<string> {
    if (agentPreset === '') throw new Error('未指定目标模式')
    const summary = this.deps.sessions.list.getSnapshot().byId[sessionId]
    if (summary === undefined) throw new Error('session is no longer available')

    if (summary.blank) {
      const selected = await this.selectWithRetry(sessionId, agentPreset)
      this.deps.sessions.noteAgentPreset(sessionId, selected)
      return sessionId
    }

    return this.switchFromCompletedSession(summary, agentPreset)
  }

  /**
   * A running session's agent composition is immutable. Create the receiving
   * session with the target preset in the same host RPC so the official hero
   * chip, the runtime list, and the first prompt all agree from birth.
   */
  private async switchFromCompletedSession(summary: SessionSummaryLike, agentPreset: string): Promise<string> {
    const items = this.deps.workspaces.list.getSnapshot().items
    const workspace = items.find((item) => item.sessionIds?.includes(summary.id) === true)
      ?? items.find((item) => item.path === summary.cwd)
      ?? items[0]
    const workspaceId = workspace?.workspaceId ?? workspace?.id
    if (workspaceId === undefined && (summary.cwd === undefined || summary.cwd === '')) {
      throw new Error('当前会话没有可用的工作区，无法切换模式')
    }

    const restoreDefault = await this.prepareOfficialHero(agentPreset)
    try {
      // Do not create a standard draft and then race a second preset select.
      // session.create already accepts agentPreset and makes the new session's
      // official hero state correct before it becomes current.
      this.deps.sessions.clear()
      const response = await this.deps.api.sessions.create({
        ...workspaceId === undefined ? { cwd: summary.cwd } : { workspaceId },
        agentPreset,
      })
      if (!response.result.ok || response.result.value === undefined) {
        throw new Error(response.result.error?.message ?? '创建模式切换会话失败')
      }

      const targetSessionId = response.result.value.sessionId
      await this.deps.sessions.refresh()
      this.deps.sessions.noteAgentPreset(targetSessionId, response.result.value.agentPreset ?? agentPreset)
      this.deps.sessions.open(targetSessionId)
      await restoreDefault()
      return targetSessionId
    } finally {
      try {
        await restoreDefault()
      } catch (error) {
        // The mode switch already has a valid session. Keep it usable, but make
        // a failed default restoration visible to the host diagnostics.
        console.warn('mode switch default preset restore failed:', error)
      }
    }
  }

  /**
   * The official hero chip owns a small local store and only reloads it after
   * its own settings/selection flow. Temporarily moving the official default
   * lets that public controller refresh; the returned callback restores the
   * user's original default after the new target session is open.
   */
  private async prepareOfficialHero(agentPreset: string): Promise<() => Promise<void>> {
    const update = this.deps.api.settings?.update
    if (typeof update !== 'function') return async () => {}

    let roster: AgentPresetListValue
    try {
      const response = await this.deps.api.agentPresets.list({})
      if (!response.result.ok || response.result.value === undefined) return async () => {}
      roster = response.result.value
    } catch {
      return async () => {}
    }

    const previousDefault = roster.presets.find((preset) => preset.isDefault)?.id
    if (previousDefault === undefined) return async () => {}
    const bridgePreset = roster.presets.find((preset) => preset.broken === undefined && preset.id !== agentPreset)?.id

    try {
      if (previousDefault === agentPreset) {
        if (bridgePreset === undefined) return async () => {}
        const bridge = await update({ ns: 'agent-presets', patch: { default: bridgePreset } })
        if (!bridge.result.ok) return async () => {}
      } else {
        const staged = await update({ ns: 'agent-presets', patch: { default: agentPreset } })
        if (!staged.result.ok) return async () => {}
      }
    } catch {
      return async () => {}
    }

    let restored = false
    return async () => {
      if (restored) return
      const response = await update({ ns: 'agent-presets', patch: { default: previousDefault } })
      if (!response.result.ok) throw new Error(response.result.error?.message ?? '恢复默认模式失败')
      restored = true
      // Let the official seat's settings listener complete before the switch
      // promise settles; otherwise the user can briefly see the old hero label.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  private async selectWithRetry(sessionId: string, agentPreset: string): Promise<string> {
    let lastError: Error | undefined
    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      try {
        const response = await this.deps.api.agentPresets.select({ sessionId, agentPreset })
        if (response.result.ok && response.result.value !== undefined) {
          return response.result.value.agentPreset
        }
        lastError = new Error(response.result.error?.message ?? 'agent preset switch failed')
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
    throw lastError ?? new Error('agent preset switch failed')
  }
}
