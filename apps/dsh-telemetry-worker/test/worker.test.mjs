import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.mjs'

const VALID_EVENT = Object.freeze({
  name: 'runtime_start_result',
  appVersion: '2.5.0',
  channel: 'stable',
  os: 'windows-11',
  language: 'zh',
  dailyActor: 'a'.repeat(64),
  monthlyActor: 'b'.repeat(64),
  outcome: 'ready',
  detail: 'none',
  bucket: '2-5s',
})

const OFFICIAL_WEBSITE_ORIGIN = 'https://ningbainb.github.io'
const VALID_DOWNLOAD_CLICK = Object.freeze({
  schema: '1',
  version: '2.5.0',
  source: 'hero',
})
const ADMIN_PASSWORD = 'correct-horse-battery-staple'
const ADMIN_PASSWORD_SHA256 = 'h8vr_uvAX3xUrJM2xLS77IMSJ6ZBlRpL3n7dVgIPhZA'
const ADMIN_SESSION_SECRET = 'A'.repeat(43)

class FakeStatement {
  constructor(database, sql) {
    this.database = database
    this.sql = sql
    this.values = []
  }

  bind(...values) {
    this.values = values
    return this
  }

  async run() {
    this.database.runs.push({ sql: this.sql, values: this.values })
    if (this.database.fail) throw new Error('private database failure')
    return { success: true }
  }

  async all() {
    this.database.queries.push({ sql: this.sql, values: this.values })
    if (this.database.fail) throw new Error('private database failure')
    return this.database.queryResults.shift() ?? { results: [] }
  }
}

class FakeDatabase {
  constructor({ fail = false, queryResults = [] } = {}) {
    this.fail = fail
    this.batches = []
    this.queries = []
    this.queryResults = [...queryResults]
    this.runs = []
  }

  prepare(sql) {
    return new FakeStatement(this, sql)
  }

  async batch(statements) {
    if (this.fail) throw new Error('private database failure')
    this.batches.push(statements.map(statement => ({ sql: statement.sql, values: statement.values })))
    return statements.map(() => ({ success: true }))
  }
}

function requestFor(body, init = {}) {
  return new Request('https://telemetry.example/v1/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: JSON.stringify(body),
    ...init,
  })
}

function downloadClickRequest(body = VALID_DOWNLOAD_CLICK, init = {}) {
  const { headers = {}, ...requestInit } = init
  return new Request('https://telemetry.example/v1/download-clicks', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      origin: OFFICIAL_WEBSITE_ORIGIN,
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
    ...requestInit,
  })
}

function enabledEnvironment(database = new FakeDatabase()) {
  return { INGEST_ENABLED: '1', METRICS: database }
}

function adminEnvironment(database = new FakeDatabase()) {
  return {
    ...enabledEnvironment(database),
    ADMIN_PASSWORD_SHA256,
    ADMIN_SESSION_SECRET,
  }
}

function adminRequest(path = '/admin', init = {}) {
  return new Request(`https://telemetry.example${path}`, init)
}

function loginRequest(password) {
  return adminRequest('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }).toString(),
  })
}

function cookiePair(setCookie) {
  return setCookie.split(';', 1)[0]
}

async function authenticatedCookie(environment, now = new Date('2026-08-19T08:00:00.000Z')) {
  const result = await worker.fetch(
    loginRequest(ADMIN_PASSWORD),
    environment,
    { now: () => now },
  )
  assert.equal(result.status, 303)
  return cookiePair(result.headers.get('set-cookie'))
}

test('rejects unsupported methods and browser-origin submissions', async () => {
  const method = await worker.fetch(new Request('https://telemetry.example/v1/events'), enabledEnvironment())
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'POST')

  const browser = await worker.fetch(requestFor({ schema: 2, events: [VALID_EVENT] }, {
    headers: { origin: 'https://attacker.example' },
  }), enabledEnvironment())
  assert.equal(browser.status, 403)
})

test('returns no-content without touching D1 when ingestion is disabled', async () => {
  const database = new FakeDatabase()
  const response = await worker.fetch(requestFor({ schema: 2, events: [VALID_EVENT] }), {
    INGEST_ENABLED: '0',
    METRICS: database,
  })
  assert.equal(response.status, 204)
  assert.deepEqual(database.batches, [])
})

test('rejects oversized, malformed, and unknown input', async () => {
  const environment = enabledEnvironment()
  const oversized = await worker.fetch(requestFor({ schema: 2, events: [VALID_EVENT] }, {
    headers: { 'content-length': '8193' },
  }), environment)
  assert.equal(oversized.status, 413)

  const wrongSchema = await worker.fetch(requestFor({ schema: 1, events: [VALID_EVENT] }), environment)
  assert.equal(wrongSchema.status, 400)

  const unknownBody = await worker.fetch(requestFor({ schema: 2, events: [VALID_EVENT], userId: 'forbidden' }), environment)
  assert.equal(unknownBody.status, 400)

  const unknownEventField = await worker.fetch(requestFor({
    schema: 2,
    events: [{ ...VALID_EVENT, prompt: 'forbidden' }],
  }), environment)
  assert.equal(unknownEventField.status, 400)

  const invalidEnum = await worker.fetch(requestFor({
    schema: 2,
    events: [{ ...VALID_EVENT, detail: 'C:\\Users\\secret\\project' }],
  }), environment)
  assert.equal(invalidEnum.status, 400)

  const invalidActor = await worker.fetch(requestFor({
    schema: 2,
    events: [{ ...VALID_EVENT, dailyActor: 'stable-installation-id' }],
  }), environment)
  assert.equal(invalidActor.status, 400)
})

test('groups identical events and binds only aggregate dimensions', async () => {
  const database = new FakeDatabase()
  const now = new Date('2026-08-19T23:59:59.000Z')
  const response = await worker.fetch(requestFor({
    schema: 2,
    events: [VALID_EVENT, VALID_EVENT, { ...VALID_EVENT, language: 'en' }],
  }), enabledEnvironment(database), { now: () => now, country: () => 'CN' })

  assert.equal(response.status, 204)
  assert.equal(database.batches.length, 1)
  assert.equal(database.batches[0].length, 4)
  assert.deepEqual(database.batches[0][0].values, [
    '2026-08-19',
    'runtime_start_result',
    '2.5.0',
    'stable',
    'windows-11',
    'zh',
    'ready',
    'none',
    '2-5s',
    2,
  ])
  assert.doesNotMatch(database.batches[0][0].sql, /ip|user.?agent|timestamp|raw/iu)
  const daily = database.batches[0].find(statement => /product_actor_daily/iu.test(statement.sql))
  const monthly = database.batches[0].find(statement => /product_actor_monthly/iu.test(statement.sql))
  assert.deepEqual(daily.values, [
    '2026-08-19',
    'a'.repeat(64),
    'CN',
    '2.5.0',
    'runtime_start_result',
    'ready',
    'none',
  ])
  assert.deepEqual(monthly.values, [
    '2026-08',
    'b'.repeat(64),
    'CN',
    '2.5.0',
    'runtime_start_result',
    'ready',
    'none',
  ])
  assert.doesNotMatch(daily.sql, /ip|city|user.?agent|timestamp|raw/iu)
})

test('contains D1 failures without exposing internal details', async () => {
  const response = await worker.fetch(
    requestFor({ schema: 2, events: [VALID_EVENT] }),
    enabledEnvironment(new FakeDatabase({ fail: true })),
  )
  assert.equal(response.status, 503)
  assert.equal(await response.text(), 'temporarily unavailable')
})

test('accepts an official website download beacon and writes only a country aggregate', async () => {
  const database = new FakeDatabase()
  const response = await worker.fetch(
    downloadClickRequest(),
    enabledEnvironment(database),
    {
      now: () => new Date('2026-08-19T23:59:59.000Z'),
      country: () => 'CN',
    },
  )

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), OFFICIAL_WEBSITE_ORIGIN)
  assert.equal(database.runs.length, 1)
  assert.deepEqual(database.runs[0].values, ['2026-08-19', 'CN', '2.5.0', 'hero', 1])
  assert.doesNotMatch(database.runs[0].sql, /ip|city|user.?agent|timestamp|referrer|raw/iu)
})

test('accepts only the official GitHub Pages and custom-domain download origins', async () => {
  for (const origin of [
    OFFICIAL_WEBSITE_ORIGIN,
    'https://1521003.xyz',
    'https://www.1521003.xyz',
  ]) {
    const response = await worker.fetch(downloadClickRequest(VALID_DOWNLOAD_CLICK, {
      headers: { origin },
    }), enabledEnvironment(), { country: () => 'CN' })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
  }

  const deceptive = await worker.fetch(downloadClickRequest(VALID_DOWNLOAD_CLICK, {
    headers: { origin: 'https://1521003.xyz.attacker.example' },
  }), enabledEnvironment())
  assert.equal(deceptive.status, 403)
})

test('download beacon rejects untrusted origins, unknown fields, and invalid enums', async () => {
  const environment = enabledEnvironment()
  const attacker = await worker.fetch(downloadClickRequest(VALID_DOWNLOAD_CLICK, {
    headers: { origin: 'https://attacker.example' },
  }), environment)
  assert.equal(attacker.status, 403)

  const unknownField = await worker.fetch(downloadClickRequest({
    ...VALID_DOWNLOAD_CLICK,
    project: 'forbidden',
  }), environment)
  assert.equal(unknownField.status, 400)

  const invalidSource = await worker.fetch(downloadClickRequest({
    ...VALID_DOWNLOAD_CLICK,
    source: 'arbitrary-button-text',
  }), environment)
  assert.equal(invalidSource.status, 400)

  const wrongType = await worker.fetch(downloadClickRequest(VALID_DOWNLOAD_CLICK, {
    headers: { 'content-type': 'application/json' },
  }), environment)
  assert.equal(wrongType.status, 400)
})

test('download beacon fails closed without touching D1 when ingestion is disabled', async () => {
  const database = new FakeDatabase()
  const response = await worker.fetch(downloadClickRequest(), {
    INGEST_ENABLED: '0',
    METRICS: database,
  })
  assert.equal(response.status, 204)
  assert.deepEqual(database.runs, [])
})

test('scheduled retention keeps aggregate trends and removes rotating actors on shorter boundaries', async () => {
  const database = new FakeDatabase()
  await worker.scheduled({}, { METRICS: database }, {})
  assert.equal(database.runs.length, 4)
  assert.match(database.runs[0].sql, /DELETE FROM metric_daily/iu)
  assert.match(database.runs[1].sql, /DELETE FROM download_click_daily/iu)
  assert.match(database.runs[2].sql, /DELETE FROM product_actor_daily/iu)
  assert.match(database.runs[3].sql, /DELETE FROM product_actor_monthly/iu)
  assert.match(database.runs[0].sql, /-400 days/iu)
  assert.match(database.runs[1].sql, /-400 days/iu)
  assert.match(database.runs[2].sql, /-35 days/iu)
  assert.match(database.runs[3].sql, /-13 months/iu)
})

test('management custom domain root redirects to the admin surface only', async () => {
  const managementRoot = await worker.fetch(
    new Request('https://guanli.1521003.xyz/'),
    enabledEnvironment(),
  )
  assert.equal(managementRoot.status, 302)
  assert.equal(managementRoot.headers.get('location'), '/admin')
  assert.equal(managementRoot.headers.get('cache-control'), 'no-store')

  const workerRoot = await worker.fetch(
    new Request('https://telemetry.example/'),
    enabledEnvironment(),
  )
  assert.equal(workerRoot.status, 404)
})

test('admin surface fails closed when production secrets are not configured', async () => {
  for (const path of ['/admin', '/admin/login', '/admin/api/summary', '/admin/dashboard.js']) {
    const response = await worker.fetch(adminRequest(path), enabledEnvironment())
    assert.equal(response.status, 404)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
})

test('admin surface rejects legacy plaintext and malformed cryptographic secrets', async () => {
  const invalidEnvironments = [
    {
      ...enabledEnvironment(),
      ADMIN_PASSWORD,
      ADMIN_SESSION_SECRET,
    },
    {
      ...enabledEnvironment(),
      ADMIN_PASSWORD_SHA256: 'not-a-sha256-verifier',
      ADMIN_SESSION_SECRET,
    },
    {
      ...enabledEnvironment(),
      ADMIN_PASSWORD_SHA256,
      ADMIN_SESSION_SECRET: 'not-256-bits',
    },
  ]
  for (const environment of invalidEnvironments) {
    const response = await worker.fetch(adminRequest('/admin'), environment)
    assert.equal(response.status, 404)
  }
})

test('admin login rejects a wrong password and issues a hardened session for the right password', async () => {
  const environment = adminEnvironment()
  const wrong = await worker.fetch(loginRequest('wrong-password'), environment)
  assert.equal(wrong.status, 401)
  assert.equal(wrong.headers.get('set-cookie'), null)
  assert.doesNotMatch(await wrong.text(), /correct-horse|session-secret/iu)

  const right = await worker.fetch(
    loginRequest(ADMIN_PASSWORD),
    environment,
    { now: () => new Date('2026-08-19T08:00:00.000Z') },
  )
  assert.equal(right.status, 303)
  assert.equal(right.headers.get('location'), '/admin')
  const setCookie = right.headers.get('set-cookie')
  assert.match(setCookie, /^__Secure-dsh_admin_session=v1\.\d{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43};/u)
  assert.match(setCookie, /HttpOnly/iu)
  assert.match(setCookie, /Secure/iu)
  assert.match(setCookie, /SameSite=Strict/iu)
  assert.match(setCookie, /Path=\/admin/iu)
  assert.match(setCookie, /Max-Age=28800/iu)
  assert.doesNotMatch(setCookie, /correct-horse|h8vr_uv|session-secret/iu)

  const second = await worker.fetch(
    loginRequest(ADMIN_PASSWORD),
    environment,
    { now: () => new Date('2026-08-19T08:00:00.000Z') },
  )
  assert.equal(second.status, 303)
  assert.notEqual(second.headers.get('set-cookie'), setCookie)
})

test('authenticated admin page is dependency-free and protected by strict browser headers', async () => {
  const environment = adminEnvironment()
  const cookie = await authenticatedCookie(environment)
  const response = await worker.fetch(adminRequest('/admin', {
    headers: { cookie },
  }), environment, { now: () => new Date('2026-08-19T08:01:00.000Z') })

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^text\/html/iu)
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/iu)
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/iu)
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/iu)
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  const body = await response.text()
  assert.match(body, /产品数据看板/u)
  assert.match(body, /下载按钮点击/u)
  assert.match(body, /日活用户/u)
  assert.match(body, /月活用户/u)
  assert.match(body, /应用内更新漏斗/u)
  assert.match(body, /拓展坞漏斗/u)
  assert.match(body, /\/admin\/dashboard\.js/u)
  assert.doesNotMatch(body, /https:\/\/(?:cdn|fonts|unpkg|jsdelivr)\./iu)
  assert.doesNotMatch(body, /correct-horse|session-secret/iu)
})

test('admin summary returns only bounded aggregate queries for a signed session', async () => {
  const database = new FakeDatabase({
    queryResults: [
      { results: [{ total: 42 }] },
      { results: [{ day: '2026-08-19', count: 9 }] },
      { results: [{ countryCode: 'CN', count: 21 }] },
      { results: [{ source: 'hero', count: 20 }] },
      { results: [{ version: '2.5.0', count: 42 }] },
      { results: [{ total: 16 }] },
      { results: [{ surface: 'settings', count: 7 }] },
      { results: [{ event: 'app_launch', count: 16 }] },
      { results: [{ day: '2026-08-19', count: 11 }] },
      { results: [{ month: '2026-08', count: 31 }] },
      { results: [{ countryCode: 'CN', count: 21 }] },
      { results: [{ version: '3.0.2', count: 25 }] },
      { results: [{ event: 'update_completed', count: 9 }] },
      { results: [{ event: 'dock_opened', count: 12 }] },
    ],
  })
  const environment = adminEnvironment(database)
  const now = new Date('2026-08-19T08:00:00.000Z')
  const cookie = await authenticatedCookie(environment, now)
  const response = await worker.fetch(adminRequest('/admin/api/summary?days=30', {
    headers: { cookie },
  }), environment, { now: () => new Date('2026-08-19T08:02:00.000Z') })

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^application\/json/iu)
  assert.deepEqual(await response.json(), {
    schema: 2,
    rangeDays: 30,
    generatedAt: '2026-08-19T08:02:00.000Z',
    downloads: {
      totalClicks: 42,
      trend: [{ day: '2026-08-19', count: 9 }],
      countries: [{ countryCode: 'CN', count: 21 }],
      sources: [{ source: 'hero', count: 20 }],
      versions: [{ version: '2.5.0', count: 42 }],
    },
    desktop: {
      launches: 16,
      surfaces: [{ surface: 'settings', count: 7 }],
      events: [{ event: 'app_launch', count: 16 }],
    },
    active: {
      dau: 11,
      mau: 31,
      dailyTrend: [{ day: '2026-08-19', count: 11 }],
      monthlyTrend: [{ month: '2026-08', count: 31 }],
      countries: [{ countryCode: 'CN', count: 21 }],
      versions: [{ version: '3.0.2', count: 25 }],
    },
    funnels: {
      updates: [{ event: 'update_completed', count: 9 }],
      dock: [{ event: 'dock_opened', count: 12 }],
    },
  })
  assert.equal(database.queries.length, 14)
  for (const query of database.queries) {
    assert.deepEqual(query.values, ['-29 days'])
    assert.doesNotMatch(query.sql, /ip|city|user.?agent|referrer|raw/iu)
  }
})

test('admin API rejects invalid ranges and expired or tampered sessions', async () => {
  const environment = adminEnvironment()
  const issuedAt = new Date('2026-08-19T08:00:00.000Z')
  const cookie = await authenticatedCookie(environment, issuedAt)

  const invalidRange = await worker.fetch(adminRequest('/admin/api/summary?days=31', {
    headers: { cookie },
  }), environment, { now: () => new Date('2026-08-19T08:01:00.000Z') })
  assert.equal(invalidRange.status, 400)

  const tampered = await worker.fetch(adminRequest('/admin/api/summary?days=30', {
    headers: { cookie: `${cookie}x` },
  }), environment, { now: () => new Date('2026-08-19T08:01:00.000Z') })
  assert.equal(tampered.status, 401)

  const expired = await worker.fetch(adminRequest('/admin/api/summary?days=30', {
    headers: { cookie },
  }), environment, { now: () => new Date('2026-08-20T08:01:00.000Z') })
  assert.equal(expired.status, 401)
})

test('admin logout clears the scoped session cookie', async () => {
  const environment = adminEnvironment()
  const cookie = await authenticatedCookie(environment)
  const response = await worker.fetch(adminRequest('/admin/logout', {
    method: 'POST',
    headers: { cookie },
  }), environment)
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/admin')
  assert.match(response.headers.get('set-cookie'), /__Secure-dsh_admin_session=;/u)
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/iu)
})
