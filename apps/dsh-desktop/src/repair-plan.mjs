import { REPAIR_ACTION_IDS, REPAIR_CATEGORIES, REPAIR_STATE_SCHEMA_VERSION } from './repair-state.mjs'

const MAX_DIAGNOSES = 8
const MAX_ACTIONS = 8
const MAX_RATIONALE_LENGTH = 800
const PLAN_KEYS = new Set(['schemaVersion', 'diagnosisIds', 'recommendedActionIds', 'rationale'])

function assertStringArray(value, label, allowed, maximum) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must contain between 1 and ${maximum} entries`)
  }
  if (value.some((entry) => typeof entry !== 'string' || !allowed.includes(entry))) {
    throw new TypeError(`${label} contains an unsupported value`)
  }
  if (new Set(value).size !== value.length) throw new TypeError(`${label} must not contain duplicates`)
  return Object.freeze([...value])
}

/**
 * Validate the deliberately tiny plan language shared with an optional repair
 * advisor. There is no path, URL, shell command, script, or arbitrary action
 * field in this contract.
 */
export function validateRepairPlan(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('repair plan must be an object')
  }
  if (Object.keys(value).some((key) => !PLAN_KEYS.has(key))) {
    throw new TypeError('repair plan contains an unsupported field')
  }
  if (value.schemaVersion !== REPAIR_STATE_SCHEMA_VERSION) {
    throw new TypeError(`unsupported repair plan schemaVersion: ${String(value.schemaVersion)}`)
  }
  const rationale = value.rationale
  if (typeof rationale !== 'string' || rationale.length === 0 || rationale.length > MAX_RATIONALE_LENGTH) {
    throw new TypeError('repair plan rationale is invalid')
  }
  return Object.freeze({
    schemaVersion: REPAIR_STATE_SCHEMA_VERSION,
    diagnosisIds: assertStringArray(value.diagnosisIds, 'repair plan diagnosisIds', REPAIR_CATEGORIES, MAX_DIAGNOSES),
    recommendedActionIds: assertStringArray(value.recommendedActionIds, 'repair plan recommendedActionIds', REPAIR_ACTION_IDS, MAX_ACTIONS),
    rationale,
  })
}

export function createRepairPlan({ diagnosisIds, recommendedActionIds, rationale } = {}) {
  return validateRepairPlan({
    schemaVersion: REPAIR_STATE_SCHEMA_VERSION,
    diagnosisIds,
    recommendedActionIds,
    rationale,
  })
}
