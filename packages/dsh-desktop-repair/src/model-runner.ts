import type { ModelSelection } from '@deepseek-ai/dsh-agent'

import type { RepairAttemptSummary, RepairJobSettings, RepairModelSelection } from './job.ts'

interface DefaultModelFace {
  currentSelection(): ModelSelection
}

export interface RepairCandidateResult {
  status: 'candidate-ready' | 'failed'
}

export interface RepairModelRunResult {
  status: 'candidate-ready' | 'model-unavailable' | 'failed' | 'timed-out'
  attempts: RepairAttemptSummary[]
  selection?: RepairModelSelection
}

function validSelection(value: unknown): value is RepairModelSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const selection = value as Partial<RepairModelSelection>
  return typeof selection.provider === 'string'
    && selection.provider.trim() !== ''
    && typeof selection.model === 'string'
    && selection.model.trim() !== ''
}

function detachedSelection(value: RepairModelSelection): RepairModelSelection {
  return Object.freeze({
    provider: value.provider.trim(),
    model: value.model.trim(),
    ...(typeof value.reasoningEffort === 'string' && value.reasoningEffort.trim() !== ''
      ? { reasoningEffort: value.reasoningEffort.trim() }
      : {}),
  })
}

export function repairModelCandidates(
  defaultModel: DefaultModelFace,
  settings: RepairJobSettings = {},
): RepairModelSelection[] {
  const values: RepairModelSelection[] = []
  const current = defaultModel.currentSelection()
  if (validSelection(current)) values.push(detachedSelection(current))
  for (const fallback of settings.fallbackModels ?? []) {
    if (validSelection(fallback)) values.push(detachedSelection(fallback))
  }
  const seen = new Set<string>()
  return values.filter((selection) => {
    const key = `${selection.provider}\0${selection.model}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 2)
}

function failureCategory(error: unknown): RepairAttemptSummary['outcome'] {
  const input = error as { code?: unknown, status?: unknown, name?: unknown }
  const code = typeof input?.code === 'string' ? input.code.toUpperCase() : ''
  const status = typeof input?.status === 'number' ? input.status : undefined
  if (status === 401 || status === 403 || /AUTH|CREDENTIAL|UNAUTHORIZED/u.test(code)) return 'authentication'
  if (status === 402 || status === 429 || /QUOTA|RATE_LIMIT|BILLING/u.test(code)) return 'quota'
  if (code === 'REPAIR_TIMEOUT' || input?.name === 'TimeoutError') return 'timed-out'
  if (/MODEL|PROVIDER|NOT_FOUND|UNAVAILABLE/u.test(code)) return 'model-unavailable'
  return 'failed'
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('repair model attempt timed out'), { code: 'REPAIR_TIMEOUT' })), timeoutMs)
    timer.unref?.()
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function runRepairModelCandidates({
  defaultModel,
  settings = {},
  runCandidate,
  timeoutMs = 90_000,
}: {
  defaultModel: DefaultModelFace
  settings?: RepairJobSettings
  runCandidate: (selection: RepairModelSelection, attempt: number) => Promise<RepairCandidateResult>
  timeoutMs?: number
}): Promise<RepairModelRunResult> {
  if (typeof runCandidate !== 'function') throw new TypeError('repair candidate runner is required')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 90_000) {
    throw new TypeError('repair model timeout is invalid')
  }
  const candidates = repairModelCandidates(defaultModel, settings)
  if (candidates.length === 0) return Object.freeze({ status: 'model-unavailable', attempts: [] })
  const attempts: RepairAttemptSummary[] = []
  const startedAt = Date.now()
  for (let index = 0; index < candidates.length; index += 1) {
    const selection = candidates[index]
    const remaining = timeoutMs - (Date.now() - startedAt)
    if (remaining < 1) return Object.freeze({ status: 'timed-out', attempts })
    try {
      const result = await withTimeout(runCandidate(selection, index + 1), remaining)
      const outcome = result.status === 'candidate-ready' ? 'candidate-ready' : 'failed'
      attempts.push({ provider: selection.provider, model: selection.model, outcome })
      if (result.status === 'candidate-ready') {
        return Object.freeze({ status: 'candidate-ready', attempts, selection })
      }
    } catch (error) {
      const outcome = failureCategory(error)
      attempts.push({ provider: selection.provider, model: selection.model, outcome })
      if (outcome === 'timed-out') return Object.freeze({ status: 'timed-out', attempts })
    }
  }
  return Object.freeze({ status: 'failed', attempts })
}
