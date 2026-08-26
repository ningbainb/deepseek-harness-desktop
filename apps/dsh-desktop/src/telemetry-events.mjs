const APP_VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/u
const DIMENSION_FIELDS = Object.freeze(['outcome', 'detail', 'bucket'])
const ACTOR_FIELDS = Object.freeze(['installationActor', 'dailyActor', 'monthlyActor'])
const ACTOR_PATTERN = /^[a-f0-9]{64}$/u

const EVENT_POLICY = Object.freeze({
  app_launch: Object.freeze({
    outcomes: new Set(['started']),
    details: new Set(['normal', 'updated', 'deep-link', 'unknown']),
    buckets: new Set(['none']),
  }),
  runtime_start_result: Object.freeze({
    outcomes: new Set(['ready', 'failed']),
    details: new Set([
      'none',
      'runtime-missing',
      'port-conflict',
      'integrity-failed',
      'repeated-crash',
      'startup-failed',
      'unknown',
    ]),
    buckets: new Set(['under-2s', '2-5s', '5-15s', '15-60s', 'over-60s', 'unknown']),
  }),
  direct_start_ready: Object.freeze({
    outcomes: new Set(['ready']),
    details: new Set(['fresh-home', 'existing-home', 'repaired', 'unknown']),
    buckets: new Set(['under-2s', '2-5s', '5-15s', '15-60s', 'over-60s', 'unknown']),
  }),
  full_start_failed: Object.freeze({
    outcomes: new Set(['failed']),
    details: new Set([
      'plugin-startup',
      'profile-invalid',
      'runtime-missing',
      'port-conflict',
      'integrity-failed',
      'repeated-crash',
      'startup-failed',
      'unknown',
    ]),
    buckets: new Set(['under-2s', '2-5s', '5-15s', '15-60s', 'over-60s', 'unknown']),
  }),
  repair_agent_started: Object.freeze({
    outcomes: new Set(['started']),
    details: new Set(['default-model', 'fallback-model']),
    buckets: new Set(['none']),
  }),
  repair_agent_succeeded: Object.freeze({
    outcomes: new Set(['succeeded']),
    details: new Set(['default-model', 'fallback-model']),
    buckets: new Set(['under-2s', '2-5s', '5-15s', '15-60s', 'over-60s', 'unknown']),
  }),
  repair_agent_failed: Object.freeze({
    outcomes: new Set(['failed']),
    details: new Set([
      'model-unavailable',
      'model-error',
      'timeout',
      'invalid-result',
      'verification-failed',
      'restart-failed',
      'rollback-failed',
      'budget-exhausted',
      'unknown',
    ]),
    buckets: new Set(['under-2s', '2-5s', '5-15s', '15-60s', 'over-60s', 'unknown']),
  }),
  builtins_fallback_ready: Object.freeze({
    outcomes: new Set(['ready']),
    details: new Set(['no-model', 'repair-failed', 'budget-exhausted', 'full-retry-failed', 'unknown']),
    buckets: new Set(['under-2s', '2-5s', '5-15s', '15-60s', 'over-60s', 'unknown']),
  }),
  installation_repair_required: Object.freeze({
    outcomes: new Set(['blocked']),
    details: new Set(['runtime-missing', 'integrity-failed', 'unsupported', 'unknown']),
    buckets: new Set(['none']),
  }),
  runtime_recovery_action: Object.freeze({
    outcomes: new Set(['requested']),
    details: new Set(['retry', 'repair', 'safe-mode', 'disable-plugin']),
    buckets: new Set(['none']),
  }),
  surface_opened: Object.freeze({
    outcomes: new Set(['opened']),
    details: new Set(['settings', 'extensions', 'community', 'updates', 'help']),
    buckets: new Set(['none']),
  }),
  update_result: Object.freeze({
    outcomes: new Set(['current', 'available', 'downloaded', 'install-requested', 'error']),
    details: new Set(['automatic', 'manual', 'none']),
    buckets: new Set(['none']),
  }),
  update_available: Object.freeze({
    outcomes: new Set(['available']),
    details: new Set(['automatic', 'manual', 'none']),
    buckets: new Set(['none']),
  }),
  update_downloaded: Object.freeze({
    outcomes: new Set(['downloaded']),
    details: new Set(['automatic', 'manual', 'none']),
    buckets: new Set(['none']),
  }),
  update_install_requested: Object.freeze({
    outcomes: new Set(['requested']),
    details: new Set(['automatic', 'manual', 'none']),
    buckets: new Set(['none']),
  }),
  update_completed: Object.freeze({
    outcomes: new Set(['completed']),
    details: new Set(['receipt']),
    buckets: new Set(['none']),
  }),
  update_error: Object.freeze({
    outcomes: new Set(['error']),
    details: new Set(['automatic', 'manual', 'none']),
    buckets: new Set(['none']),
  }),
  dock_entry_impression: Object.freeze({
    outcomes: new Set(['shown']),
    details: new Set(['settings-adjacent']),
    buckets: new Set(['none']),
  }),
  dock_nudge_shown: Object.freeze({
    outcomes: new Set(['shown']),
    details: new Set(['first-three-launches']),
    buckets: new Set(['none']),
  }),
  dock_nudge_dismissed: Object.freeze({
    outcomes: new Set(['dismissed']),
    details: new Set(['close', 'escape', 'clicked', 'limit']),
    buckets: new Set(['none']),
  }),
  dock_entry_click: Object.freeze({
    outcomes: new Set(['clicked']),
    details: new Set(['settings-adjacent']),
    buckets: new Set(['none']),
  }),
  dock_opened: Object.freeze({
    outcomes: new Set(['opened', 'failed']),
    details: new Set(['settings-adjacent']),
    buckets: new Set(['none']),
  }),
  extension_operation: Object.freeze({
    outcomes: new Set(['success', 'failure']),
    details: new Set(['install', 'update', 'remove', 'enable', 'disable']),
    buckets: new Set(['none']),
  }),
  app_session_end: Object.freeze({
    outcomes: new Set(['closed']),
    details: new Set(['normal']),
    buckets: new Set(['under-5m', '5-30m', '30-120m', 'over-120m']),
  }),
})

function exactFields(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).toSorted()
  const expected = [...fields].toSorted()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

function operatingSystemFamily(platform, release) {
  if (platform !== 'win32' || typeof release !== 'string') return 'windows-other'
  const [major, minor, buildText] = release.split('.')
  const build = Number.parseInt(buildText ?? '', 10)
  if (major === '10' && minor === '0' && Number.isInteger(build)) {
    return build >= 22_000 ? 'windows-11' : 'windows-10'
  }
  return 'windows-other'
}

function languageFamily(locale) {
  const normalized = typeof locale === 'string' ? locale.trim().toLowerCase() : ''
  if (normalized === 'zh' || normalized.startsWith('zh-') || normalized.startsWith('zh_')) return 'zh'
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.startsWith('en_')) return 'en'
  return 'other'
}

export function normalizeProductContext({ version, platform, osRelease, locale }) {
  if (typeof version !== 'string' || !APP_VERSION_PATTERN.test(version)) {
    throw new TypeError('invalid product telemetry version')
  }
  return Object.freeze({
    appVersion: version,
    channel: version.includes('-') ? 'prerelease' : 'stable',
    os: operatingSystemFamily(platform, osRelease),
    language: languageFamily(locale),
  })
}

export function createProductEvent(context, actors, name, dimensions) {
  if (!exactFields(context, ['appVersion', 'channel', 'os', 'language'])) {
    throw new TypeError('invalid product telemetry context')
  }
  if (!exactFields(dimensions, DIMENSION_FIELDS)) throw new TypeError('invalid product event dimensions')
  if (
    !exactFields(actors, ACTOR_FIELDS)
    || !ACTOR_PATTERN.test(actors.installationActor)
    || !ACTOR_PATTERN.test(actors.dailyActor)
    || !ACTOR_PATTERN.test(actors.monthlyActor)
  ) throw new TypeError('invalid anonymous product actor')
  const policy = EVENT_POLICY[name]
  if (
    policy === undefined
    || !policy.outcomes.has(dimensions.outcome)
    || !policy.details.has(dimensions.detail)
    || !policy.buckets.has(dimensions.bucket)
  ) {
    throw new TypeError('invalid product event dimensions')
  }
  return Object.freeze({
    name,
    ...context,
    ...actors,
    outcome: dimensions.outcome,
    detail: dimensions.detail,
    bucket: dimensions.bucket,
  })
}

export function startupDurationBucket(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'unknown'
  if (milliseconds < 2_000) return 'under-2s'
  if (milliseconds < 5_000) return '2-5s'
  if (milliseconds < 15_000) return '5-15s'
  if (milliseconds < 60_000) return '15-60s'
  return 'over-60s'
}

export function sessionDurationBucket(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'under-5m'
  if (milliseconds < 5 * 60_000) return 'under-5m'
  if (milliseconds < 30 * 60_000) return '5-30m'
  if (milliseconds < 120 * 60_000) return '30-120m'
  return 'over-120m'
}

export const PRODUCT_EVENT_NAMES = Object.freeze(Object.keys(EVENT_POLICY))
