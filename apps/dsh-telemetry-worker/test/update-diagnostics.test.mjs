import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/index.mjs'
import { updateDiagnostic } from '../../dsh-desktop/src/update-diagnostics.mjs'
import { updateDiagnosticsSummary } from '../src/update-diagnostics-summary.mjs'
import { database } from './analytics-fixture.mjs'
import { dataPoint } from '../src/analytics-service.mjs'

const now = new Date('2026-09-10T01:00:00.000Z')
const event = { name: 'update_error', appVersion: '3.3.0', channel: 'stable', os: 'windows-11', language: 'zh', installationActor: 'a'.repeat(64), dailyActor: 'b'.repeat(64), monthlyActor: 'c'.repeat(64), outcome: 'error', detail: 'automatic', bucket: 'none',
  update: updateDiagnostic({ attemptId: '12345678-1234-1234-1234-123456789abc', stage: 'check', sourceVersion: '3.3.0', timestamp: now.toISOString(), error: { code: 'ECONNRESET' } }) }
function request(events) { return new Request('https://test.invalid/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: 6, events }) }) }

test('schema 6 stores one diagnostic per failed attempt without extra rows or indexes, even when AE is absent', async () => {
  const { db, wrapper } = database()
  try {
    const env = { INGEST_ENABLED: '1', METRICS: wrapper }
    for (let i = 0; i < 2; i++) assert.equal((await worker.fetch(request([event]), env, { now: () => now })).status, 204)
    const rows = db.prepare('SELECT * FROM analytics_failure').all()
    assert.equal(rows.length, 1); assert.equal(rows[0].error_type, 'network')
    assert.equal(JSON.parse(rows[0].diagnostic).error_code, 'ECONNRESET')
    assert.equal(db.prepare("PRAGMA index_list('analytics_failure')").all().length, 1)
    const summary = await updateDiagnosticsSummary(wrapper, { days: 90, version: '3.3.0' }, now)
    assert.equal(summary.rangeDays, 30); assert.equal(summary.failures, 1); assert.equal(summary.failedAttempts, 1)
    assert.equal(summary.observedInstances, 1); assert.equal(summary.groups[0].stage, 'check')
    assert.equal(summary.recent[0].targetVersion, 'unknown')
    assert.doesNotMatch(JSON.stringify(summary), /installation_actor|aaaaaaaa/u)
    assert.equal((await updateDiagnosticsSummary(wrapper, { days: 7, version: '3.2.0' }, now)).failures, 0)
  } finally { db.close() }
})

test('wire rejects raw details, inconsistent versions, unknown fields and invalid diagnostic event names', async () => {
  for (const invalid of [
    { ...event, update: { ...event.update, raw: 'private' } },
    { ...event, update: { ...event.update, error_code: 'private error message' } },
    { ...event, update: { ...event.update, source_version: '3.2.0' } },
    { ...event, name: 'app_launch', outcome: 'started', detail: 'normal' },
    { ...event, update: { ...event.update, error_type: 'none', error_code: 'none' } },
  ]) assert.equal((await worker.fetch(request([invalid]), { INGEST_ENABLED: '1' })).status, 400)
  const response = await worker.fetch(request([event]), { INGEST_ENABLED: '1', METRICS: { prepare() { throw new Error('quota') } } })
  assert.equal(response.status, 204)
})

test('diagnostic API requires an admin session and rejects invalid filters', async () => {
  const { db, wrapper } = database()
  try {
    const env = { METRICS: wrapper, ADMIN_PASSWORD_SHA256: 'h8vr_uvAX3xUrJM2xLS77IMSJ6ZBlRpL3n7dVgIPhZA', ADMIN_SESSION_SECRET: 'A'.repeat(43) }
    const unauthenticated = await worker.fetch(new Request('https://test.invalid/admin/api/update-diagnostics?days=7'), env)
    assert.equal(unauthenticated.status, 401)
    const login = await worker.fetch(new Request('https://test.invalid/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=correct-horse-battery-staple' }), env)
    assert.equal(login.status, 303)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    for (const [params, status] of [['days=7', 200], ['days=31', 400], ['days=7&version=private', 400], ['days=7&path=private', 400]]) {
      assert.equal((await worker.fetch(new Request('https://test.invalid/admin/api/update-diagnostics?' + params, { headers: { cookie } }), env)).status, status)
    }
  } finally { db.close() }
})

test('mixed schema 6 batches retain cost route aggregation and bounded AE dimensions', async () => {
  const { db, wrapper } = database()
  try {
    const { update, outcome, detail, bucket, ...context } = event
    const route = { ...context, name: 'cost_mode_route', params: { role: 'main', result: 'success', strategy: 'balanced', model: 'deepseek-chat', error_type: 'none' }, timestamp: now.toISOString(), eventId: crypto.randomUUID() }
    const response = await worker.fetch(request([event, route]), { INGEST_ENABLED: '1', METRICS: wrapper, ANALYTICS: wrapper.analytics }, { now: () => now })
    assert.equal(response.status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_failure').get().n, 1)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM metric_daily WHERE event LIKE 'cost_mode_%'").get().n, 0)
    const point = dataPoint(event, '2026-09-10', 'ZZ')
    assert.ok(point.blobs.length <= 20)
    assert.ok(point.blobs.reduce((sum, value) => sum + new TextEncoder().encode(value).length, 0) <= 16384)
    assert.equal(JSON.parse(point.blobs[16]).attempt_id, event.update.attempt_id)
  } finally { db.close() }
})
