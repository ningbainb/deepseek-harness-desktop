import { describe, it, expect, beforeEach } from 'vitest'
import { resolveSessionConfig, type ValueModeConfig } from '../src/core/config.ts'
import { valueModeState } from '../src/core/state.ts'

describe('ValueMode V2 Session Overrides & Analytics', () => {
  beforeEach(() => {
    valueModeState.resetAll()
  })

  it('merges global config with session override', () => {
    const globalConfig: ValueModeConfig = {
      enabled: true,
      strategy: 'balanced',
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o' },
    }

    const merged = resolveSessionConfig(globalConfig, {
      strategy: 'powerful',
      expert: { provider: 'anthropic', model: 'claude-3-7-sonnet' },
    })

    expect(merged.strategy).toBe('powerful')
    expect(merged.expert?.provider).toBe('anthropic')
    expect(merged.expert?.model).toBe('claude-3-7-sonnet')
    expect(merged.executor?.model).toBe('deepseek-chat') // unchanged
  })

  it('tracks session overrides in state manager', () => {
    valueModeState.setSessionOverride('session-1', {
      strategy: 'saver',
    })

    expect(valueModeState.getSessionOverride('session-1')?.strategy).toBe('saver')
    expect(valueModeState.getSessionOverride('session-2')).toBeUndefined()

    valueModeState.clearSessionOverride('session-1')
    expect(valueModeState.getSessionOverride('session-1')).toBeUndefined()
  })

  it('records consultations and caps history at 20', () => {
    for (let i = 1; i <= 25; i++) {
      valueModeState.recordConsultation('session-1', {
        purpose: 'debug',
        question: `Question ${i}`,
        summary: `Summary ${i}`,
        tokens: { inputTokens: 100, outputTokens: 50 },
        durationMs: 300,
      })
    }

    const history = valueModeState.getConsultationHistory('session-1')
    expect(history.length).toBe(20)
    expect(history[0].question).toBe('Question 25') // most recent first
  })

  it('tracks consecutive failures and resets upon success', () => {
    valueModeState.recordExecutorFailure('session-1')
    valueModeState.recordExecutorFailure('session-1')
    expect(valueModeState.getConsecutiveFailures('session-1')).toBe(2)

    valueModeState.resetExecutorFailure('session-1')
    expect(valueModeState.getConsecutiveFailures('session-1')).toBe(0)
  })

  it('calculates estimated savings percent correctly', () => {
    const sessionId = 'session-calc'

    // Initially 0
    let metrics = valueModeState.getSessionMetrics(sessionId)
    expect(metrics.estimatedSavingsPercent).toBe(0)

    // 8 executor calls, 2 expert calls => 80% savings ratio
    for (let i = 0; i < 8; i++) {
      valueModeState.recordExecutorCall(sessionId, { inputTokens: 500, outputTokens: 200 })
    }
    for (let i = 0; i < 2; i++) {
      valueModeState.recordExpertCall(sessionId, undefined, { inputTokens: 2000, outputTokens: 800 })
    }

    metrics = valueModeState.getSessionMetrics(sessionId)
    expect(metrics.executorCalls).toBe(8)
    expect(metrics.expertCalls).toBe(2)
    expect(metrics.estimatedSavingsPercent).toBe(80)
  })
})
