import { describe, expect, it, vi } from 'vitest'

import {
  repairModelCandidates,
  runRepairModelCandidates,
} from '../src/model-runner.ts'

function defaultModel(provider: string, model: string) {
  return { currentSelection: () => ({ provider, model }) }
}

describe('repair model selection', () => {
  it('returns model-unavailable for an empty default selection', async () => {
    const runCandidate = vi.fn()
    const result = await runRepairModelCandidates({
      defaultModel: defaultModel('', ''),
      settings: {},
      runCandidate,
    })
    expect(result.status).toBe('model-unavailable')
    expect(runCandidate).not.toHaveBeenCalled()
  })

  it('uses the valid default model once', async () => {
    const runCandidate = vi.fn(async () => ({ status: 'candidate-ready' as const }))
    const result = await runRepairModelCandidates({
      defaultModel: defaultModel('primary', 'repair-1'),
      settings: {},
      runCandidate,
    })
    expect(result.status).toBe('candidate-ready')
    expect(runCandidate).toHaveBeenCalledTimes(1)
  })

  it('moves from an authentication failure to one configured fallback', async () => {
    const runCandidate = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('credential rejected'), { code: 'AUTHENTICATION_FAILED' }))
      .mockResolvedValueOnce({ status: 'candidate-ready' })
    const result = await runRepairModelCandidates({
      defaultModel: defaultModel('primary', 'repair-1'),
      settings: { fallbackModels: [{ provider: 'fallback', model: 'repair-2' }] },
      runCandidate,
    })
    expect(result.status).toBe('candidate-ready')
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual(['authentication', 'candidate-ready'])
    expect(runCandidate).toHaveBeenCalledTimes(2)
  })

  it('skips a tools:none default before trying a compatible fallback', async () => {
    const runCandidate = vi.fn(async (selection) => {
      expect(selection).toEqual({
        provider: 'fallback',
        model: 'repair-2',
        toolsCapability: 'native',
      })
      return { status: 'candidate-ready' as const }
    })
    const result = await runRepairModelCandidates({
      defaultModel: defaultModel('primary', 'repair-1'),
      settings: {
        defaultToolsCapability: 'none',
        fallbackModels: [{
          provider: 'fallback',
          model: 'repair-2',
          toolsCapability: 'native',
        }],
      },
      runCandidate,
    })
    expect(result.status).toBe('candidate-ready')
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual([
      'unsupported-tools',
      'candidate-ready',
    ])
    expect(runCandidate).toHaveBeenCalledTimes(1)
  })

  it('returns model-unavailable without calling a provider when all candidates are tools:none', async () => {
    const runCandidate = vi.fn()
    const result = await runRepairModelCandidates({
      defaultModel: defaultModel('primary', 'repair-1'),
      settings: {
        defaultToolsCapability: 'none',
        fallbackModels: [{
          provider: 'fallback',
          model: 'repair-2',
          toolsCapability: 'none',
        }],
      },
      runCandidate,
    })
    expect(result.status).toBe('model-unavailable')
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual([
      'unsupported-tools',
      'unsupported-tools',
    ])
    expect(runCandidate).not.toHaveBeenCalled()
  })

  it('deduplicates candidates and never tries more than two provider/model pairs', async () => {
    expect(repairModelCandidates(defaultModel('primary', 'repair-1'), {
      fallbackModels: [
        { provider: 'primary', model: 'repair-1' },
        { provider: 'second', model: 'repair-2' },
        { provider: 'third', model: 'repair-3' },
      ],
    })).toEqual([
      { provider: 'primary', model: 'repair-1' },
      { provider: 'second', model: 'repair-2' },
    ])
    const runCandidate = vi.fn(async () => { throw Object.assign(new Error('quota'), { code: 'QUOTA_EXCEEDED' }) })
    const result = await runRepairModelCandidates({
      defaultModel: defaultModel('primary', 'repair-1'),
      settings: { fallbackModels: [
        { provider: 'second', model: 'repair-2' },
        { provider: 'third', model: 'repair-3' },
      ] },
      runCandidate,
    })
    expect(result.status).toBe('failed')
    expect(runCandidate).toHaveBeenCalledTimes(2)
  })

  it('stops the job when the bounded model attempt times out', async () => {
    const result = await runRepairModelCandidates({
      defaultModel: defaultModel('primary', 'repair-1'),
      settings: {},
      timeoutMs: 10,
      runCandidate: async () => new Promise(() => {}),
    })
    expect(result.status).toBe('timed-out')
    expect(result.attempts[0].outcome).toBe('timed-out')
  })
})
