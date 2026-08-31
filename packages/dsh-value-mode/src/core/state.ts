import type { SessionOverrideConfig } from './config.ts'

export interface ConsultationRecord {
  id: string
  timestamp: number
  purpose: 'architecture' | 'plan' | 'debug' | 'review'
  question: string
  summary: string
  tokens: {
    inputTokens: number
    outputTokens: number
  }
  durationMs: number
}

export interface SessionValueModeMetrics {
  executorCalls: number
  expertCalls: number
  executorTokens: {
    inputTokens: number
    outputTokens: number
  }
  expertTokens: {
    inputTokens: number
    outputTokens: number
  }
  manualExpertArmed: boolean
  currentDepth: number
  turnExpertCount: Map<number, number>
  consecutiveFailures: number
  override?: SessionOverrideConfig
  consultations: ConsultationRecord[]
}

class ValueModeStateManager {
  private sessions = new Map<string, SessionValueModeMetrics>()
  private globalExecutorCalls = 0
  private globalExpertCalls = 0

  private getSessionState(sessionId: string): SessionValueModeMetrics {
    let state = this.sessions.get(sessionId)
    if (!state) {
      state = {
        executorCalls: 0,
        expertCalls: 0,
        executorTokens: { inputTokens: 0, outputTokens: 0 },
        expertTokens: { inputTokens: 0, outputTokens: 0 },
        manualExpertArmed: false,
        currentDepth: 0,
        turnExpertCount: new Map(),
        consecutiveFailures: 0,
        consultations: [],
      }
      this.sessions.set(sessionId, state)
    }
    return state
  }

  recordExecutorCall(sessionId?: string, usage?: { inputTokens?: number; outputTokens?: number }): void {
    this.globalExecutorCalls++
    if (sessionId) {
      const state = this.getSessionState(sessionId)
      state.executorCalls++
      if (usage) {
        state.executorTokens.inputTokens += usage.inputTokens ?? 0
        state.executorTokens.outputTokens += usage.outputTokens ?? 0
      }
    }
  }

  /** Record a delegated child-agent call while retaining the legacy field name. */
  recordSubagentCall(sessionId?: string, usage?: { inputTokens?: number; outputTokens?: number }): void {
    this.recordExecutorCall(sessionId, usage)
  }

  recordExpertCall(
    sessionId?: string,
    turn?: number,
    usage?: { inputTokens?: number; outputTokens?: number },
  ): void {
    this.globalExpertCalls++
    if (sessionId) {
      const state = this.getSessionState(sessionId)
      state.expertCalls++
      if (usage) {
        state.expertTokens.inputTokens += usage.inputTokens ?? 0
        state.expertTokens.outputTokens += usage.outputTokens ?? 0
      }
      if (turn !== undefined) {
        const count = state.turnExpertCount.get(turn) ?? 0
        state.turnExpertCount.set(turn, count + 1)
      }
      // Consume the armed manual flag once an expert call is recorded
      state.manualExpertArmed = false
    }
  }

  /** Record a top-level expert-controller call while retaining model metrics compatibility. */
  recordControllerCall(sessionId?: string, usage?: { inputTokens?: number; outputTokens?: number }): void {
    this.recordExpertCall(sessionId, undefined, usage)
  }

  recordConsultation(sessionId: string, record: Omit<ConsultationRecord, 'id' | 'timestamp'>): void {
    const state = this.getSessionState(sessionId)
    const entry: ConsultationRecord = {
      ...record,
      id: `consult-${Date.now()}-${state.consultations.length + 1}`,
      timestamp: Date.now(),
    }
    state.consultations.unshift(entry)
    if (state.consultations.length > 20) {
      state.consultations.length = 20
    }
  }

  getConsultationHistory(sessionId: string): ConsultationRecord[] {
    return this.getSessionState(sessionId).consultations
  }

  recordExecutorFailure(sessionId: string): void {
    const state = this.getSessionState(sessionId)
    state.consecutiveFailures++
  }

  resetExecutorFailure(sessionId: string): void {
    const state = this.getSessionState(sessionId)
    state.consecutiveFailures = 0
  }

  getConsecutiveFailures(sessionId: string): number {
    return this.getSessionState(sessionId).consecutiveFailures
  }

  setSessionOverride(sessionId: string, override?: SessionOverrideConfig): void {
    const state = this.getSessionState(sessionId)
    state.override = override ? { ...override } : undefined
  }

  getSessionOverride(sessionId: string): SessionOverrideConfig | undefined {
    return this.getSessionState(sessionId).override
  }

  clearSessionOverride(sessionId: string): void {
    const state = this.getSessionState(sessionId)
    state.override = undefined
  }

  getTurnExpertCalls(sessionId: string, turn: number): number {
    const state = this.getSessionState(sessionId)
    return state.turnExpertCount.get(turn) ?? 0
  }

  getDepth(sessionId: string): number {
    return this.getSessionState(sessionId).currentDepth
  }

  enterExpertCall(sessionId: string): void {
    const state = this.getSessionState(sessionId)
    state.currentDepth++
  }

  exitExpertCall(sessionId: string): void {
    const state = this.getSessionState(sessionId)
    state.currentDepth = Math.max(0, state.currentDepth - 1)
  }

  setManualExpertArmed(sessionId: string, armed: boolean): void {
    const state = this.getSessionState(sessionId)
    state.manualExpertArmed = armed
  }

  isManualExpertArmed(sessionId: string): boolean {
    return this.getSessionState(sessionId).manualExpertArmed
  }

  getSessionMetrics(sessionId: string): {
    controllerCalls: number
    subagentCalls: number
    executorCalls: number
    expertCalls: number
    controllerTokens: { inputTokens: number; outputTokens: number }
    subagentTokens: { inputTokens: number; outputTokens: number }
    executorTokens: { inputTokens: number; outputTokens: number }
    expertTokens: { inputTokens: number; outputTokens: number }
    inputTokens: number
    outputTokens: number
    manualExpertArmed: boolean
    consecutiveFailures: number
    consultationsCount: number
    estimatedSavingsPercent: number
  } {
    const state = this.getSessionState(sessionId)
    const totalCalls = state.executorCalls + state.expertCalls
    const estimatedSavingsPercent = totalCalls > 0
      ? Math.min(99, Math.round((state.executorCalls / totalCalls) * 100))
      : 0
    return {
      controllerCalls: state.expertCalls,
      subagentCalls: state.executorCalls,
      executorCalls: state.executorCalls,
      expertCalls: state.expertCalls,
      controllerTokens: { ...state.expertTokens },
      subagentTokens: { ...state.executorTokens },
      executorTokens: { ...state.executorTokens },
      expertTokens: { ...state.expertTokens },
      inputTokens: state.expertTokens.inputTokens + state.executorTokens.inputTokens,
      outputTokens: state.expertTokens.outputTokens + state.executorTokens.outputTokens,
      manualExpertArmed: state.manualExpertArmed,
      consecutiveFailures: state.consecutiveFailures,
      consultationsCount: state.consultations.length,
      estimatedSavingsPercent,
    }
  }

  getGlobalMetrics(): {
    controllerCalls: number
    subagentCalls: number
    executorCalls: number
    expertCalls: number
    activeSessions: number
  } {
    return {
      controllerCalls: this.globalExpertCalls,
      subagentCalls: this.globalExecutorCalls,
      executorCalls: this.globalExecutorCalls,
      expertCalls: this.globalExpertCalls,
      activeSessions: this.sessions.size,
    }
  }

  resetAll(): void {
    this.sessions.clear()
    this.globalExecutorCalls = 0
    this.globalExpertCalls = 0
  }
}

export const valueModeState = new ValueModeStateManager()
