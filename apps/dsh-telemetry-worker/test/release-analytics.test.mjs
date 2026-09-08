import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import worker, { __test as ingest } from '../src/index.mjs'
import { releaseFilters, releaseSummary } from '../src/release-analytics.mjs'
import { ProductTelemetryClient } from '../../dsh-desktop/src/telemetry-client.mjs'
import { createProductEvent } from '../../dsh-desktop/src/telemetry-events.mjs'

function database() {
  const db = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'))
  const wrapper = {
    prepare(sql) {
      let args = []
      const statement = { bind(...values) { args = values; return statement }, async all() { return { results: db.prepare(sql).all(...args) } }, async run() { return db.prepare(sql).run(...args) } }
      return statement
    },
    async batch(statements) { db.exec('BEGIN'); try { const out = []; for (const s of statements) out.push(await s.run()); db.exec('COMMIT'); return out } catch (e) { db.exec('ROLLBACK'); throw e } },
  }
  return { db, wrapper }
}
const actors = { installationActor: 'a'.repeat(64), dailyActor: 'b'.repeat(64), monthlyActor: 'c'.repeat(64) }
const context = { appVersion: '3.3.0', channel: 'stable', os: 'windows-11', language: 'zh' }
const launch = createProductEvent(context, actors, 'app_launch', { outcome: 'started', detail: 'normal', bucket: 'none' })
function send(db, events, day = '2026-09-09') {
  return worker.fetch(new Request('https://test.invalid/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: 4, events }) }), { INGEST_ENABLED: '1', METRICS: db }, { now: () => new Date(day + 'T12:00:00Z') })
}

test('client maximum batch reaches the actual Worker, including long valid dimensions', async () => {
  const { db, wrapper } = database()
  try {
    let received = 0
    const client = new ProductTelemetryClient({ endpoint: 'https://test.invalid/v1/events', context: { ...context, appVersion: '9999.9999.9999-' + 'a'.repeat(20) }, actorProvider: () => actors,
      schedule: () => 1, cancelSchedule() {},
      fetchImpl: async (url, init) => {
        assert.ok(new TextEncoder().encode(init.body).byteLength <= ingest.MAX_REQUEST_BYTES)
        const response = await worker.fetch(new Request(url, init), { INGEST_ENABLED: '1', METRICS: wrapper })
        assert.equal(response.status, 204); received += JSON.parse(init.body).events.length; return response
      },
    })
    for (let i = 0; i < 20; i++) client.record('full_start_failed', { outcome: 'failed', detail: 'integrity-failed', bucket: 'over-60s' })
    await client.shutdown({ deadlineMs: 1000 })
    assert.equal(received, 20)
    assert.equal(db.prepare('SELECT SUM(count) AS n FROM product_release_daily').get().n, 20)
  } finally { db.close() }
})

test('release observations keep upgrades, deduplicate across months, and separate counts from instances', async () => {
  const { db, wrapper } = database()
  try {
    assert.equal((await send(wrapper, [{ ...launch, appVersion: '3.2.0' }, launch, launch], '2026-08-31')).status, 204)
    assert.equal((await send(wrapper, [launch], '2026-09-01')).status, 204)
    const data = await releaseSummary(wrapper, { days: 30, version: '' }, new Date('2026-09-09T00:00:00Z'))
    assert.equal(data.activeInstances, 1)
    assert.deepEqual(data.versions.map(row => [row.version, row.instances]), [['3.3.0', 1], ['3.2.0', 1]])
    assert.equal(data.events[0].count, 4); assert.equal(data.events[0].instances, 1)
    const selected = await releaseSummary(wrapper, { days: 30, version: '3.3.0' }, new Date('2026-09-09T00:00:00Z'))
    assert.equal(selected.events[0].count, 3)
    assert.equal(selected.coverage.startedDay, '2026-08-31'); assert.equal(selected.coverage.partial, true)
    assert.equal(selected.startup.successRate, null)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_installation_daily').get().n, 2)
  } finally { db.close() }
})

test('startup ratio has a real denominator and feature events carry no private fields', async () => {
  const { db, wrapper } = database()
  try {
    const events = [launch, ...['ready', 'ready', 'failed'].map(outcome => ({ ...launch, name: 'runtime_start_result', outcome, detail: outcome === 'ready' ? 'none' : 'unknown', bucket: 'unknown' })), { ...launch, name: 'feature_attachment', outcome: 'succeeded', detail: 'file' }]
    assert.equal((await send(wrapper, events)).status, 204)
    const summary = await releaseSummary(wrapper, { days: 7, version: '3.3.0' }, new Date('2026-09-09'))
    assert.equal(summary.startup.denominator, 3); assert.equal(summary.startup.successRate, 2 / 3)
    assert.equal((await send(wrapper, [{ ...events.at(-1), path: 'private' }])).status, 400)
    assert.equal(db.prepare('SELECT SUM(count) AS n FROM product_release_daily').get().n, 5)
    assert.equal((await worker.fetch(new Request('https://test.invalid/admin/api/release'), { ADMIN_PASSWORD_SHA256: 'a'.repeat(43), ADMIN_SESSION_SECRET: 'b'.repeat(43), METRICS: wrapper })).status, 401)
  } finally { db.close() }
})

test('release filters reject unknown fields, repeated values and SQL input', () => {
  assert.deepEqual(releaseFilters(new URLSearchParams('days=7&version=3.3.0')), { days: 7, version: '3.3.0' })
  for (const params of ['days=365', 'days=7&days=30', 'version=x', 'version=3.3.0&path=secret', 'days=7;DROP TABLE metric_daily']) assert.equal(releaseFilters(new URLSearchParams(params)), undefined)
})

test('every Worker allowlisted combination is also accepted by the Desktop schema', () => {
  assert.ok(Object.values(ingest.EVENT_POLICY).reduce((count, policy) => count + policy.outcomes.size * policy.details.size, 0) <= 200, 'release query must return every allowed event dimension')
  for (const [name, policy] of Object.entries(ingest.EVENT_POLICY)) for (const outcome of policy.outcomes) for (const detail of policy.details) for (const bucket of policy.buckets) {
    assert.equal(createProductEvent(context, actors, name, { outcome, detail, bucket }).name, name)
  }
})

test('legacy schema 3 retains its storage boundary and release cleanup retains the full 90-day window', async () => {
  const { db, wrapper } = database()
  try {
    const request = new Request('https://test.invalid/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: 3, events: [launch] }) })
    assert.equal((await worker.fetch(request, { INGEST_ENABLED: '1', METRICS: wrapper })).status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_release_daily').get().n, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_installation_daily').get().n, 1)
    db.exec("INSERT INTO product_release_daily VALUES (date('now','-90 days'), '" + 'a'.repeat(64) + "', '3.3.0', 'app_launch', 'started', 'normal', 1), (date('now','-89 days'), '" + 'a'.repeat(64) + "', '3.3.0', 'app_launch', 'started', 'normal', 1)")
    await worker.scheduled({}, { METRICS: wrapper })
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_release_daily').get().n, 1)
  } finally { db.close() }
})
