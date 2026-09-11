import { exactKeys, validCostParams } from './cost-mode-events.mjs'
const VALUE_MODE_RUNTIME_TELEMETRY_PREFIX = 'DSH_VALUE_MODE_METRIC '

const VALUE_MODE_EVENT_KINDS = new Set(['entry', 'onboarding', 'state', 'strategy'])
const VALUE_MODE_ONBOARDING_OUTCOMES = new Set(['shown', 'completed', 'dismissed', 'failed'])
const VALUE_MODE_ONBOARDING_SURFACES = new Set(['hero', 'header', 'settings'])
const VALUE_MODE_STATES = new Set(['enabled', 'disabled', 'failed'])
const VALUE_MODE_STATE_SOURCES = new Set(['onboarding', 'manual', 'auto', 'settings'])
const VALUE_MODE_STRATEGIES = new Set(['saver', 'balanced', 'powerful'])

function exactFields(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).toSorted()
  const expected = [...fields].toSorted()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

/**
 * Parse the internal runtime-to-main-process bridge. The bridge is deliberately
 * bounded to approved route dimensions and an ISO timestamp. Session ids,
 * prompts, credentials, and raw error messages are never accepted.
 */
export function parseValueModeRuntimeTelemetryLine(line) {
  if (typeof line !== 'string') return undefined
  const normalized = line.trimEnd()
  if (!normalized.startsWith(VALUE_MODE_RUNTIME_TELEMETRY_PREFIX)) return undefined
  let value
  try {
    value = JSON.parse(normalized.slice(VALUE_MODE_RUNTIME_TELEMETRY_PREFIX.length))
  } catch {
    return undefined
  }
  if (exactKeys(value, ['event', 'params', 'timestamp']) && value.event === 'cost_mode_route'
    && validCostParams(value.event, value.params) && typeof value.timestamp === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value.timestamp)
    && Number.isFinite(Date.parse(value.timestamp))) return Object.freeze(value)
  if (
    !exactFields(value, ['event', 'outcome', 'role'])
    || value.event !== 'call'
    || (value.outcome !== 'started' && value.outcome !== 'failed')
    || (value.role !== 'controller' && value.role !== 'subagent')
  ) return undefined
  return Object.freeze({ outcome: value.outcome, role: value.role })
}

/**
 * Normalize the renderer-facing Value Mode telemetry contract before it reaches
 * the product recorder. Unknown fields and free-form values fail closed.
 */
export function normalizeValueModeProductEvent(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid value mode telemetry event')
  }
  if (!VALUE_MODE_EVENT_KINDS.has(value.kind)) {
    throw new TypeError('invalid value mode telemetry event')
  }
  if (value.kind === 'entry') {
    if ((!exactFields(value, ['kind', 'configured']) && !exactFields(value, ['kind', 'configured', 'source']))
      || typeof value.configured !== 'boolean' || (value.source !== undefined && !VALUE_MODE_ONBOARDING_SURFACES.has(value.source))) {
      throw new TypeError('invalid value mode telemetry event')
    }
    return Object.freeze({ kind: 'entry', configured: value.configured, ...(value.source ? { source: value.source } : {}) })
  }
  if (value.kind === 'onboarding') {
    if (
      !exactFields(value, ['kind', 'outcome', 'surface'])
      || !VALUE_MODE_ONBOARDING_OUTCOMES.has(value.outcome)
      || !VALUE_MODE_ONBOARDING_SURFACES.has(value.surface)
    ) throw new TypeError('invalid value mode telemetry event')
    return Object.freeze({ kind: 'onboarding', outcome: value.outcome, surface: value.surface })
  }
  if (value.kind === 'state') {
    if (
      !exactFields(value, ['kind', 'source', 'state'])
      || !VALUE_MODE_STATES.has(value.state)
      || !VALUE_MODE_STATE_SOURCES.has(value.source)
    ) throw new TypeError('invalid value mode telemetry event')
    return Object.freeze({ kind: 'state', state: value.state, source: value.source })
  }
  if (!exactFields(value, ['kind', 'strategy']) || !VALUE_MODE_STRATEGIES.has(value.strategy)) {
    throw new TypeError('invalid value mode telemetry event')
  }
  return Object.freeze({ kind: 'strategy', strategy: value.strategy })
}

export const __test = Object.freeze({ VALUE_MODE_RUNTIME_TELEMETRY_PREFIX })
