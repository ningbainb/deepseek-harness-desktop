import { handleAdminRequest } from './admin-dashboard.mjs'

const MAX_REQUEST_BYTES = 8_192
const MAX_BATCH_EVENTS = 20
const MAX_DOWNLOAD_CLICK_BYTES = 256
const ADMIN_HOSTNAME = 'guanli.1521003.xyz'
const OFFICIAL_WEBSITE_ORIGINS = new Set([
  'https://ningbainb.github.io',
  'https://1521003.xyz',
  'https://www.1521003.xyz',
])
const EVENT_FIELDS = Object.freeze([
  'name',
  'appVersion',
  'channel',
  'os',
  'language',
  'outcome',
  'detail',
  'bucket',
])
const TOP_LEVEL_FIELDS = Object.freeze(['schema', 'events'])
const DOWNLOAD_CLICK_FIELDS = Object.freeze(['schema', 'source', 'version'])
const APP_VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/u

const CHANNELS = new Set(['stable', 'prerelease'])
const OPERATING_SYSTEMS = new Set(['windows-10', 'windows-11', 'windows-other'])
const LANGUAGES = new Set(['zh', 'en', 'other'])
const DOWNLOAD_SOURCES = new Set(['nav', 'hero', 'terminal', 'install'])

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

const UPSERT_SQL = `
INSERT INTO metric_daily (
  day,
  event,
  app_version,
  channel,
  os_family,
  language,
  outcome,
  detail,
  bucket,
  count
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (
  day,
  event,
  app_version,
  channel,
  os_family,
  language,
  outcome,
  detail,
  bucket
) DO UPDATE SET count = count + excluded.count
`

const DOWNLOAD_CLICK_UPSERT_SQL = `
INSERT INTO download_click_daily (
  day,
  country_code,
  release_version,
  source,
  count
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT (
  day,
  country_code,
  release_version,
  source
) DO UPDATE SET count = count + excluded.count
`

const RETENTION_SQL = "DELETE FROM metric_daily WHERE day < date('now', '-365 days')"
const DOWNLOAD_RETENTION_SQL = "DELETE FROM download_click_daily WHERE day < date('now', '-365 days')"

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

function validEvent(event) {
  if (!exactFields(event, EVENT_FIELDS)) return false
  if (typeof event.appVersion !== 'string' || !APP_VERSION_PATTERN.test(event.appVersion)) return false
  if (!CHANNELS.has(event.channel) || !OPERATING_SYSTEMS.has(event.os) || !LANGUAGES.has(event.language)) return false
  const policy = EVENT_POLICY[event.name]
  return policy !== undefined
    && policy.outcomes.has(event.outcome)
    && policy.details.has(event.detail)
    && policy.buckets.has(event.bucket)
}

function aggregateEvents(events) {
  const groups = new Map()
  for (const event of events) {
    const dimensions = [
      event.name,
      event.appVersion,
      event.channel,
      event.os,
      event.language,
      event.outcome,
      event.detail,
      event.bucket,
    ]
    const key = JSON.stringify(dimensions)
    const current = groups.get(key)
    if (current) current.count += 1
    else groups.set(key, { dimensions, count: 1 })
  }
  return groups.values()
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

function countryCode(request, seams) {
  const value = typeof seams.country === 'function' ? seams.country(request) : request.cf?.country
  return typeof value === 'string' && /^[A-Z]{2}$/u.test(value) ? value : 'XX'
}

async function handleProductEvents(request, env, seams) {
  if (request.method !== 'POST') return response(405, 'method not allowed', { allow: 'POST' })
  if (request.headers.has('origin')) return response(403, 'forbidden')
  if (env?.INGEST_ENABLED !== '1') return response(204)
  if (!env?.METRICS || typeof env.METRICS.prepare !== 'function' || typeof env.METRICS.batch !== 'function') {
    return response(503, 'temporarily unavailable')
  }

  const parsed = await parseBody(request)
  if (parsed.status) return response(parsed.status, parsed.status === 413 ? 'request too large' : 'invalid request')
  const body = parsed.value
  if (!exactFields(body, TOP_LEVEL_FIELDS) || body.schema !== 1 || !Array.isArray(body.events)) {
    return response(400, 'invalid request')
  }
  if (body.events.length < 1 || body.events.length > MAX_BATCH_EVENTS || body.events.some(event => !validEvent(event))) {
    return response(400, 'invalid request')
  }

  const now = typeof seams.now === 'function' ? seams.now() : new Date()
  const day = now.toISOString().slice(0, 10)
  const statements = [...aggregateEvents(body.events)].map(({ dimensions, count }) => (
    env.METRICS.prepare(UPSERT_SQL).bind(day, ...dimensions, count)
  ))
  try {
    await env.METRICS.batch(statements)
    return response(204)
  } catch {
    return response(503, 'temporarily unavailable')
  }
}

async function handleDownloadClick(request, env, seams) {
  const origin = request.headers.get('origin')
  if (!OFFICIAL_WEBSITE_ORIGINS.has(origin)) return response(403, 'forbidden')
  if (request.method !== 'POST') {
    return downloadResponse(405, 'method not allowed', origin, { allow: 'POST' })
  }
  if (env?.INGEST_ENABLED !== '1') return downloadResponse(204, null, origin)
  if (!env?.METRICS || typeof env.METRICS.prepare !== 'function') {
    return downloadResponse(503, 'temporarily unavailable', origin)
  }
  const parsed = await parseDownloadClick(request)
  if (parsed.status) {
    return downloadResponse(
      parsed.status,
      parsed.status === 413 ? 'request too large' : 'invalid request',
      origin,
    )
  }
  const now = typeof seams.now === 'function' ? seams.now() : new Date()
  const { source, version } = parsed.value
  try {
    await env.METRICS.prepare(DOWNLOAD_CLICK_UPSERT_SQL)
      .bind(now.toISOString().slice(0, 10), countryCode(request, seams), version, source, 1)
      .run()
    return downloadResponse(204, null, origin)
  } catch {
    return downloadResponse(503, 'temporarily unavailable', origin)
  }
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

async function handleScheduled(_controller, env) {
  if (!env?.METRICS || typeof env.METRICS.prepare !== 'function') return
  await env.METRICS.prepare(RETENTION_SQL).run()
  await env.METRICS.prepare(DOWNLOAD_RETENTION_SQL).run()
}

export const __test = Object.freeze({
  ADMIN_HOSTNAME,
  EVENT_FIELDS,
  EVENT_POLICY,
  DOWNLOAD_CLICK_FIELDS,
  DOWNLOAD_CLICK_UPSERT_SQL,
  DOWNLOAD_RETENTION_SQL,
  DOWNLOAD_SOURCES,
  MAX_BATCH_EVENTS,
  MAX_DOWNLOAD_CLICK_BYTES,
  MAX_REQUEST_BYTES,
  OFFICIAL_WEBSITE_ORIGINS,
  RETENTION_SQL,
  UPSERT_SQL,
  validEvent,
})

export default Object.freeze({
  fetch: handleFetch,
  scheduled: handleScheduled,
})
