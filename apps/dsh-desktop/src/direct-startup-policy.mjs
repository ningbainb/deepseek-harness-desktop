export const DIRECT_STARTUP_ACTIONS = Object.freeze([
  'start-full',
  'retry-full',
  'repair',
  'verify',
  'start-builtins',
  'repair-installation',
])

const INSTALLATION_STATES = new Set([
  'healthy',
  'runtime-missing',
  'integrity-failed',
  'unsupported',
])

const REPAIR_BUDGET_STATES = new Set([
  'available',
  'claimed',
  'unavailable',
  'exhausted',
])

const REPAIR_OUTCOMES = new Set([
  'candidate',
  'verified',
  'failed',
  'unavailable',
  'rejected',
])

function assertPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('startup policy input must be an object')
  }
}

/**
 * Pure, bounded policy for choosing the next automatic startup action.
 * Renderer input, raw failures, plugin identities, and user content never
 * participate in this decision.
 */
export function nextDirectStartupAction(input = {}) {
  assertPlainObject(input)
  const {
    installation,
    fullAttempts,
    repairBudget,
    repairOutcome,
    repairedFullFailed = false,
  } = input

  if (!INSTALLATION_STATES.has(installation)) {
    throw new TypeError('invalid installation state')
  }
  if (!Number.isInteger(fullAttempts) || fullAttempts < 0 || fullAttempts > 3) {
    throw new TypeError('fullAttempts must be an integer from 0 to 3')
  }
  if (repairBudget !== undefined && !REPAIR_BUDGET_STATES.has(repairBudget)) {
    throw new TypeError('invalid repairBudget')
  }
  if (repairOutcome !== undefined && !REPAIR_OUTCOMES.has(repairOutcome)) {
    throw new TypeError('invalid repairOutcome')
  }

  if (installation !== 'healthy') {
    return Object.freeze({ type: 'repair-installation' })
  }
  if (repairedFullFailed) {
    return Object.freeze({ type: 'start-builtins', profileName: 'desktop-builtins' })
  }
  if (repairBudget === 'claimed' && repairOutcome === 'verified') {
    return Object.freeze({ type: 'start-full', profileName: 'desktop', repaired: true })
  }
  if (repairBudget === 'claimed' && repairOutcome === 'candidate') {
    return Object.freeze({ type: 'verify', profileName: 'desktop-repair-candidate' })
  }
  if (
    repairBudget === 'unavailable'
    || repairBudget === 'exhausted'
    || (repairBudget === 'claimed' && ['failed', 'unavailable', 'rejected'].includes(repairOutcome))
  ) {
    return Object.freeze({ type: 'start-builtins', profileName: 'desktop-builtins' })
  }
  if (fullAttempts === 0) {
    return Object.freeze({ type: 'start-full', profileName: 'desktop' })
  }
  if (fullAttempts === 1) {
    return Object.freeze({ type: 'retry-full', profileName: 'desktop' })
  }
  if (repairBudget === 'available') {
    return Object.freeze({ type: 'repair', profileName: 'desktop-repair' })
  }
  return Object.freeze({ type: 'start-builtins', profileName: 'desktop-builtins' })
}
