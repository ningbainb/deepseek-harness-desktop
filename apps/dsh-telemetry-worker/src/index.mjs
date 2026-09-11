import { AnalyticsService } from './analytics-service.mjs'
import * as sql from './analytics-sql.mjs'
import { validCostEvent } from '../../dsh-desktop/src/cost-mode-events.mjs'
import { validUpdateEventDiagnostic } from '../../dsh-desktop/src/update-diagnostics.mjs'
import { handleAdminRequest } from './admin-dashboard.mjs'

const MAX_REQUEST_BYTES = 16_384
const MAX_BATCH_EVENTS = 20
const MAX_DOWNLOAD_CLICK_BYTES = 256
const ADMIN_HOSTNAME = 'guanli.1521003.xyz'
const OFFICIAL_WEBSITE_ORIGINS = new Set([
  'https://ningbainb.github.io',
  'https://1521003.xyz',
  'https://www.1521003.xyz',
])
const EVENT_FIELDS_V2 = Object.freeze([
  'name',
  'appVersion',
  'channel',
  'os',
  'language',
  'dailyActor',
  'monthlyActor',
  'outcome',
  'detail',
  'bucket',
])
const EVENT_FIELDS_V3 = Object.freeze([
  ...EVENT_FIELDS_V2.slice(0, 7),
  'installationActor',
  ...EVENT_FIELDS_V2.slice(7),
])
const TOP_LEVEL_FIELDS = Object.freeze(['schema', 'events'])
const DOWNLOAD_CLICK_FIELDS = Object.freeze(['schema', 'source', 'version'])
const APP_VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/u
const ACTOR_PATTERN = /^[a-f0-9]{64}$/u

const CHANNELS = new Set(['stable', 'prerelease'])
const OPERATING_SYSTEMS = new Set(['windows-10', 'windows-11', 'windows-other', 'macos'])
const LANGUAGES = new Set(['zh', 'en', 'other'])
const DOWNLOAD_SOURCES = new Set(['nav', 'hero', 'terminal', 'install'])

const EVENT_POLICY = Object.freeze({
  feature_project: Object.freeze({ outcomes: new Set(['started', 'succeeded', 'failed']), details: new Set(['create', 'connect']), buckets: new Set(['none']) }),
  feature_attachment: Object.freeze({ outcomes: new Set(['started', 'succeeded', 'failed', 'cancelled']), details: new Set(['file']), buckets: new Set(['none']) }),
  feature_dock_setting: Object.freeze({ outcomes: new Set(['opened', 'failed']), details: new Set(['relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image']), buckets: new Set(['none']) }),
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
  value_mode_entry: Object.freeze({
    outcomes: new Set(['selected']),
    details: new Set(['configured', 'unconfigured']),
    buckets: new Set(['none']),
  }),
  value_mode_onboarding: Object.freeze({
    outcomes: new Set(['shown', 'completed', 'dismissed', 'failed']),
    details: new Set(['hero', 'header', 'settings']),
    buckets: new Set(['none']),
  }),
  value_mode_state: Object.freeze({
    outcomes: new Set(['enabled', 'disabled', 'failed']),
    details: new Set(['onboarding', 'manual', 'auto', 'settings']),
    buckets: new Set(['none']),
  }),
  value_mode_strategy: Object.freeze({
    outcomes: new Set(['selected']),
    details: new Set(['saver', 'balanced', 'powerful']),
    buckets: new Set(['none']),
  }),
  value_mode_call: Object.freeze({
    outcomes: new Set(['started', 'failed']),
    details: new Set(['controller', 'subagent']),
    buckets: new Set(['none']),
  }),
  app_session_end: Object.freeze({
    outcomes: new Set(['closed']),
    details: new Set(['normal']),
    buckets: new Set(['under-5m', '5-30m', '30-120m', 'over-120m']),
  }),
})

function response(status, body = null, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

function exactFields(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).toSorted()
  const expected = [...fields].toSorted()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

function exactSearchParams(params, fields) {
  const entries = [...params.entries()]
  return entries.length === fields.length && exactFields(Object.fromEntries(entries), fields)
}

function validEvent(event, schema = 3) {
  if ([5, 6].includes(schema) && event?.name?.startsWith('cost_mode_')) return validCostEvent(event)
  const hasUpdate = schema === 6 && event?.update !== undefined
  if (hasUpdate && !validUpdateEventDiagnostic(event)) return false
  const fields = schema === 2 ? EVENT_FIELDS_V2 : [3, 4, 5, 6].includes(schema) ? [...EVENT_FIELDS_V3, ...(hasUpdate ? ['update'] : [])] : undefined
  if (fields === undefined || !exactFields(event, fields)) return false
  if (typeof event.appVersion !== 'string' || !APP_VERSION_PATTERN.test(event.appVersion)) return false
  if (!ACTOR_PATTERN.test(event.dailyActor) || !ACTOR_PATTERN.test(event.monthlyActor)) return false
  if ([3, 4, 5, 6].includes(schema) && !ACTOR_PATTERN.test(event.installationActor)) return false
  if (!CHANNELS.has(event.channel) || !OPERATING_SYSTEMS.has(event.os) || !LANGUAGES.has(event.language)) return false
  const policy = Object.hasOwn(EVENT_POLICY, event.name) ? EVENT_POLICY[event.name] : undefined
  return policy !== undefined
    && policy.outcomes.has(event.outcome)
    && policy.details.has(event.detail)
    && policy.buckets.has(event.bucket)
}

async function parseBody(request) {
  const length = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) return { status: 413 }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return { status: 400 }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return { status: 413 }
  try {
    return { value: JSON.parse(text) }
  } catch {
    return { status: 400 }
  }
}

async function parseDownloadClick(request) {
  const length = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(length) && length > MAX_DOWNLOAD_CLICK_BYTES) return { status: 413 }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/x-www-form-urlencoded') return { status: 400 }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_DOWNLOAD_CLICK_BYTES) return { status: 413 }
  const params = new URLSearchParams(text)
  if (!exactSearchParams(params, DOWNLOAD_CLICK_FIELDS)) return { status: 400 }
  const value = Object.fromEntries(params.entries())
  if (
    value.schema !== '1'
    || !APP_VERSION_PATTERN.test(value.version)
    || !DOWNLOAD_SOURCES.has(value.source)
  ) return { status: 400 }
  return { value }
}

function downloadResponse(status, body = null, origin, headers = {}) {
  return response(status, body, {
    'access-control-allow-origin': origin,
    vary: 'Origin',
    ...headers,
  })
}

function countryCode(request, seams, fallback = 'XX') {
  const value = typeof seams.country === 'function' ? seams.country(request) : request.cf?.country
  return typeof value === 'string' && /^[A-Z]{2}$/u.test(value) ? value : fallback
}

async function handleProductEvents(request, env, seams) {
  if (request.method !== 'POST') return response(405, 'method not allowed', { allow: 'POST' })
  if (request.headers.has('origin')) return response(403, 'forbidden')
  if (env?.INGEST_ENABLED !== '1') return response(204)

  const parsed = await parseBody(request)
  if (parsed.status) return response(parsed.status, parsed.status === 413 ? 'request too large' : 'invalid request')
  const body = parsed.value
  if (!exactFields(body, TOP_LEVEL_FIELDS) || ![2, 3, 4, 5, 6].includes(body.schema) || !Array.isArray(body.events)) {
    return response(400, 'invalid request')
  }
  if (body.events.length < 1 || body.events.length > MAX_BATCH_EVENTS || body.events.some(event => !validEvent(event, body.schema))) {
    return response(400, 'invalid request')
  }

  const service = new AnalyticsService(env, { ...seams, countryCode: countryCode(request, seams, 'ZZ') })
  const operation = service.record(body.events, body.schema)
  if (typeof seams.waitUntil === 'function') seams.waitUntil(operation)
  else await operation
  return response(204)
}

async function handleDownloadClick(request, env, seams) {
  const origin = request.headers.get('origin')
  if (!OFFICIAL_WEBSITE_ORIGINS.has(origin)) return response(403, 'forbidden')
  if (request.method !== 'POST') {
    return downloadResponse(405, 'method not allowed', origin, { allow: 'POST' })
  }
  if (env?.INGEST_ENABLED !== '1') return downloadResponse(204, null, origin)
  const parsed = await parseDownloadClick(request)
  if (parsed.status) {
    return downloadResponse(
      parsed.status,
      parsed.status === 413 ? 'request too large' : 'invalid request',
      origin,
    )
  }
  await new AnalyticsService(env, seams).download(parsed.value, countryCode(request, seams))
  return downloadResponse(204, null, origin)
}

async function handleFetch(request, env, seams = {}) {
  const url = new URL(request.url)
  if (url.hostname === ADMIN_HOSTNAME && url.pathname === '/') {
    return response(302, null, { location: '/admin' })
  }
  if (url.pathname === '/v1/events') return handleProductEvents(request, env, seams)
  if (url.pathname === '/v1/download-clicks') return handleDownloadClick(request, env, seams)
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    return handleAdminRequest(request, env, seams)
  }
  return response(404, 'not found')
}

async function handleScheduled(controller, env) {
  await new AnalyticsService(env).scheduled(controller)
}

export const __test = Object.freeze({
  ADMIN_HOSTNAME,
  EVENT_FIELDS_V2,
  EVENT_FIELDS_V3,
  EVENT_POLICY,
  DOWNLOAD_CLICK_FIELDS,
  DOWNLOAD_CLICK_UPSERT_SQL: sql.DOWNLOAD_CLICK_UPSERT_SQL,
  DOWNLOAD_RETENTION_SQL: sql.DOWNLOAD_RETENTION_SQL,
  DAILY_ACTOR_INSERT_SQL: sql.DAILY_ACTOR_INSERT_SQL,
  MONTHLY_ACTOR_INSERT_SQL: sql.MONTHLY_ACTOR_INSERT_SQL,
  INSTALLATION_FIRST_SEEN_INSERT_SQL: sql.INSTALLATION_FIRST_SEEN_INSERT_SQL,
  INSTALLATION_DAILY_INSERT_SQL: sql.INSTALLATION_DAILY_INSERT_SQL,
  DAILY_ACTOR_RETENTION_SQL: sql.DAILY_ACTOR_RETENTION_SQL,
  MONTHLY_ACTOR_RETENTION_SQL: sql.MONTHLY_ACTOR_RETENTION_SQL,
  INSTALLATION_FIRST_SEEN_RETENTION_SQL: sql.INSTALLATION_FIRST_SEEN_RETENTION_SQL,
  INSTALLATION_DAILY_RETENTION_SQL: sql.INSTALLATION_DAILY_RETENTION_SQL,
  DOWNLOAD_SOURCES,
  MAX_BATCH_EVENTS,
  MAX_DOWNLOAD_CLICK_BYTES,
  MAX_REQUEST_BYTES,
  OFFICIAL_WEBSITE_ORIGINS,
  RETENTION_SQL: sql.RETENTION_SQL,
  UPSERT_SQL: sql.UPSERT_SQL,
  RELEASE_DAILY_INSERT_SQL: sql.RELEASE_DAILY_INSERT_SQL,
  RELEASE_RETENTION_SQL: sql.RELEASE_RETENTION_SQL,
  validEvent,
})

export default Object.freeze({
  fetch: handleFetch,
  scheduled: handleScheduled,
})
