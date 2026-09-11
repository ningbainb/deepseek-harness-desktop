// Shared wire contract. The Worker bundles this pure module; Electron ships it locally.
const ACTOR = /^[a-f0-9]{64}$/u
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/u
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/u
export const COST_EVENT_NAMES = Object.freeze(['cost_mode_enter', 'cost_mode_toggle', 'cost_mode_strategy', 'cost_mode_route', 'cost_mode_guide'])
export const COST_STRATEGIES = Object.freeze(['saving', 'balanced', 'stronger', 'unknown'])
export const COST_ERROR_TYPES = Object.freeze(['none', 'auth', 'rate_limit', 'timeout', 'network', 'provider', 'invalid_request', 'cancelled', 'unknown'])
export function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
export function validCostParams(name, p) {
  if (name === 'cost_mode_enter') return exactKeys(p, ['config_status', 'source']) && ['configured', 'unconfigured'].includes(p.config_status) && ['hero', 'header', 'settings', 'unknown'].includes(p.source)
  if (name === 'cost_mode_toggle') return exactKeys(p, ['action', 'source']) && ['enabled', 'disabled', 'failed'].includes(p.action) && ['onboarding', 'manual', 'auto', 'settings'].includes(p.source)
  if (name === 'cost_mode_strategy') return exactKeys(p, ['strategy']) && COST_STRATEGIES.includes(p.strategy)
  if (name === 'cost_mode_guide') return exactKeys(p, ['action', 'position']) && ['shown', 'completed', 'dismissed', 'failed'].includes(p.action) && ['hero', 'header', 'settings'].includes(p.position)
  return name === 'cost_mode_route' && exactKeys(p, ['role', 'result', 'strategy', 'model', 'error_type'])
    && ['main', 'subagent'].includes(p.role) && ['started', 'success', 'failure', 'cancelled'].includes(p.result)
    && COST_STRATEGIES.includes(p.strategy) && typeof p.model === 'string' && ID.test(p.model)
    && COST_ERROR_TYPES.includes(p.error_type) && (p.result === 'failure' ? p.error_type !== 'none' : p.result === 'cancelled' ? p.error_type === 'cancelled' : p.error_type === 'none')
}
export function validCostEvent(e) {
  return exactKeys(e, ['name', 'appVersion', 'channel', 'os', 'language', 'dailyActor', 'monthlyActor', 'installationActor', 'params', 'timestamp', 'eventId'])
    && typeof e.appVersion === 'string' && VERSION.test(e.appVersion)
    && ['stable', 'prerelease'].includes(e.channel) && ['windows-10', 'windows-11', 'windows-other', 'macos'].includes(e.os)
    && ['zh', 'en', 'other'].includes(e.language) && [e.dailyActor, e.monthlyActor, e.installationActor].every(a => typeof a === 'string' && ACTOR.test(a))
    && typeof e.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(e.timestamp) && Number.isFinite(Date.parse(e.timestamp))
    && typeof e.eventId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(e.eventId) && validCostParams(e.name, e.params)
}
export function costStrategy(value) { return ({ saver: 'saving', powerful: 'stronger' })[value] ?? (COST_STRATEGIES.includes(value) ? value : 'unknown') }
export function legacyCostEvent(event, now = new Date(), eventId = crypto.randomUUID()) {
  const { name, outcome, detail } = event
  const mapping = {
    value_mode_entry: ['cost_mode_enter', { config_status: detail, source: 'unknown' }],
    value_mode_state: ['cost_mode_toggle', { action: outcome, source: detail }],
    value_mode_strategy: ['cost_mode_strategy', { strategy: costStrategy(detail) }],
    value_mode_onboarding: ['cost_mode_guide', { action: outcome, position: detail }],
    value_mode_call: ['cost_mode_route', { role: detail === 'controller' ? 'main' : 'subagent', result: outcome === 'failed' ? 'failure' : 'started', strategy: 'unknown', model: 'unknown', error_type: outcome === 'failed' ? 'unknown' : 'none' }],
  }[name]
  if (!mapping) return event
  const { appVersion, channel, os, language, dailyActor, monthlyActor, installationActor } = event
  return { name: mapping[0], appVersion, channel, os, language, dailyActor, monthlyActor, installationActor, params: mapping[1], timestamp: now.toISOString(), eventId }
}
export function costDimensions(event) {
  const p = event.params
  if (event.name === 'cost_mode_enter') return { outcome: 'selected', detail: p.config_status, bucket: p.source }
  if (event.name === 'cost_mode_toggle') return { outcome: p.action, detail: p.source, bucket: 'none' }
  if (event.name === 'cost_mode_strategy') return { outcome: 'selected', detail: p.strategy, bucket: 'none' }
  if (event.name === 'cost_mode_guide') return { outcome: p.action, detail: p.position, bucket: 'none' }
  return { outcome: p.result, detail: p.role, bucket: p.strategy }
}
export function isFailure(event) {
  return event.params?.result === 'failure' || event.params?.action === 'failed' || ['failed', 'failure', 'error'].includes(event.outcome)
}
