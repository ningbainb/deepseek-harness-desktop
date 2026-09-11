import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { classifyUpdateError, updateDiagnostic, validUpdateDiagnostic } from '../src/update-diagnostics.mjs'
import { DesktopUpdateController } from '../src/updater.mjs'
import { ProductMetricsRecorder } from '../src/product-metrics.mjs'
import { ProductTelemetryClient } from '../src/telemetry-client.mjs'
import { UpdateAnalyticsReceiptStore } from '../src/update-analytics-receipt.mjs'
import { analyzeUpdateLog } from '../src/update-log-analysis.mjs'

const actor = { installationActor: 'a'.repeat(64), dailyActor: 'b'.repeat(64), monthlyActor: 'c'.repeat(64) }
const context = { appVersion: '3.3.0', channel: 'stable', os: 'windows-11', language: 'zh' }
const tick = () => new Promise(resolve => setImmediate(resolve))
function diagnostic(overrides = {}) { return updateDiagnostic({ attemptId: '12345678-1234-1234-1234-123456789abc', stage: 'check', sourceVersion: '3.3.0', error: Object.assign(new Error('private path and token'), { code: 'ECONNRESET' }), ...overrides }) }

test('failure categories use bounded codes and never copy error contents', () => {
  for (const [error, type, code] of [
    [new Error('net::ERR_CONNECTION_RESET https://secret?token=private'), 'network', 'ERR_CONNECTION_RESET'],
    [{ code: 'ETIMEDOUT' }, 'timeout', 'ETIMEDOUT'], [{ statusCode: 429 }, 'rate_limit', 'HTTP_429'],
    [new Error('403 Forbidden'), 'http', 'HTTP_403'], [{ code: 'EACCES' }, 'permission', 'EACCES'],
    [{ code: 'EBUSY' }, 'file_busy', 'EBUSY'], [{ code: 'ENOSPC' }, 'disk_full', 'ENOSPC'],
    [{ code: 'ERR_UPDATER_CHECKSUM_MISMATCH' }, 'checksum', 'ERR_UPDATER_CHECKSUM_MISMATCH'],
    [{ code: 'ERR_UPDATER_INVALID_SIGNATURE' }, 'signature', 'ERR_UPDATER_INVALID_SIGNATURE'],
    [{ code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' }, 'metadata', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'],
    [new Error('update preparation did not finish before the timeout (30000ms)'), 'prepare_timeout', 'UPDATE_PREPARATION_TIMEOUT'],
    [new Error('update installer did not start before the launch timeout'), 'launch_timeout', 'UPDATE_INSTALL_LAUNCH_TIMEOUT'],
  ]) assert.deepEqual(classifyUpdateError(error), { error_type: type, error_code: code })
  const value = diagnostic()
  assert.deepEqual(classifyUpdateError({ code: 'EACCES', message: 'permission denied C:\\checksum\\signature' }), { error_type: 'permission', error_code: 'EACCES' })
  assert.equal(validUpdateDiagnostic(value), true)
  assert.doesNotMatch(JSON.stringify(value), /private|token|secret/u)
  assert.equal(validUpdateDiagnostic({ ...value, path: 'private' }), false)
  assert.equal(validUpdateDiagnostic({ ...value, error_code: 'user supplied message' }), false)
})

test('controller preserves attempt identity across download, verification and terminal error without progress log spam', async () => {
  const updater = new EventEmitter(), logs = [], events = []
  updater.checkForUpdates = async () => {}
  updater.downloadUpdate = async () => {}
  const recorder = new ProductMetricsRecorder({ client: { record(name, value) { events.push({ name, ...value }) } } })
  const controller = new DesktopUpdateController({ updater, enabled: true, currentVersion: '3.3.0', log: line => logs.push(line), setTimeoutFn: () => 0, setIntervalFn: () => 0 })
  controller.on('status', status => recorder.observeUpdateStatus(status)); controller.start()
  try {
    await controller.check({ manual: true })
    const attempt = controller.getStatus().update.attempt_id
    updater.emit('update-available', { version: '3.4.0' }); await tick()
    for (let percent = 1; percent < 90; percent++) updater.emit('download-progress', { percent })
    updater.emit('error', Object.assign(new Error('private checksum failure'), { code: 'ERR_UPDATER_CHECKSUM_MISMATCH' })); await tick()
    const failure = events.find(row => row.name === 'update_error')
    assert.equal(failure.update.attempt_id, attempt); assert.equal(failure.update.stage, 'verify')
    assert.equal(failure.update.target_version, '3.4.0'); assert.equal(failure.detail, 'manual')
    assert.equal(logs.filter(line => line.startsWith('[update-diagnostic]')).length, 3)
    await controller.check()
    assert.notEqual(controller.getStatus().update.attempt_id, attempt)
  } finally { controller.dispose() }
})

test('update drain permits late installer errors and schema 6 retains immutable diagnostics', async () => {
  const batches = []
  const client = new ProductTelemetryClient({ endpoint: 'https://test.invalid', context, actorProvider: () => actor, schedule: () => 0, cancelSchedule() {}, fetchImpl: async (_url, init) => { batches.push(JSON.parse(init.body)); return { ok: true } } })
  assert.equal(client.record('update_install_requested', { outcome: 'requested', detail: 'manual', bucket: 'none' }), true)
  await client.drain()
  const update = { ...diagnostic({ stage: 'install' }) }
  assert.equal(client.record('update_error', { outcome: 'error', detail: 'manual', bucket: 'none', update }), true)
  update.error_code = 'private'
  await client.drain()
  assert.equal(batches[1].schema, 6); assert.equal(batches[1].events[0].update.error_code, 'ECONNRESET')
  await client.shutdown()
  assert.equal(client.record('update_error', { outcome: 'error', detail: 'manual', bucket: 'none' }), false)
})

test('preparation and installer launch failures keep distinct stages even if diagnostic logging rejects', async () => {
  for (const failedStage of ['prepare', 'install']) {
    const updater = new EventEmitter()
    updater.checkForUpdates = updater.downloadUpdate = async () => {}
    updater.quitAndInstall = () => { if (failedStage === 'install') throw Object.assign(new Error('private install path'), { code: 'EACCES' }) }
    const controller = new DesktopUpdateController({ updater, enabled: true, currentVersion: '3.3.0',
      log: () => Promise.reject(new Error('log unavailable')), setTimeoutFn: () => 0, setIntervalFn: () => 0,
      beforeInstall: async () => { if (failedStage === 'prepare') throw new Error('update preparation did not finish before the timeout (30000ms)') } })
    controller.start()
    try {
      await controller.check(); updater.emit('update-available', { version: '3.4.0' }); await tick()
      updater.emit('update-downloaded', { version: '3.4.0' }); await tick()
      assert.equal(await controller.install(), false)
      assert.equal(controller.getStatus().update.stage, failedStage)
      assert.equal(controller.getStatus().update.error_type, failedStage === 'prepare' ? 'prepare_timeout' : 'permission')
    } finally { controller.dispose() }
  }
})

test('update receipt links target Desktop start to the original attempt across restart', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-diagnostic-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new UpdateAnalyticsReceiptStore({ path: join(root, 'receipt.json') })
  const update = diagnostic({ stage: 'prepare', targetVersion: '3.4.0', error: undefined })
  await store.recordInstallRequested({ sourceVersion: '3.3.0', targetVersion: '3.4.0', update })
  assert.equal(await store.consumeCompleted('3.3.0'), false)
  const receipt = await store.consumeCompleted('3.4.0', { withReceipt: true })
  const events = []
  new ProductMetricsRecorder({ client: { record(name, value) { events.push({ name, ...value }) } } }).recordUpdateCompleted(receipt)
  assert.equal(events[0].update.attempt_id, update.attempt_id)
  assert.equal(events[0].update.source_version, '3.3.0'); assert.equal(events[0].update.target_version, '3.4.0')
  assert.equal(events[0].update.stage, 'complete')
  assert.equal(await store.consumeCompleted('3.4.0'), false)
})

test('legacy log analysis separates checking failures from migration blocks without exporting private content', () => {
  const result = analyzeUpdateLog('[updater] checking from 3.2.0\n[updater] net::ERR_CONNECTION_RESET https://secret?token=private\n[updater] checking from 3.2.0\n[updater] version 3.3.0 is available\n[updater] checksum mismatch C:\\Users\\private\n[migration] pre-bootstrap migration repair required; bootstrap blocked')
  assert.equal(result.failedAttempts, 2); assert.equal(result.migrationBlocks, 1)
  assert.deepEqual(result.groups.map(row => row.stage), ['check', 'verify'])
  assert.doesNotMatch(JSON.stringify(result), /secret|token|Users/u)
  assert.equal(analyzeUpdateLog(`[update-diagnostic] ${JSON.stringify({ phase: 'error', ...diagnostic() })}`).failures.length, 1)
  const mixed = '[updater] checking from 3.2.0\n[updater] net::ERR_CONNECTION_RESET\n'
    + `[update-diagnostic] ${JSON.stringify({ phase: 'checking', ...diagnostic({ error: undefined }) })}\n`
    + '[updater] checking from 3.3.0\n[updater] net::ERR_CONNECTION_RESET\n'
    + `[update-diagnostic] ${JSON.stringify({ phase: 'error', ...diagnostic() })}`
  assert.equal(analyzeUpdateLog(mixed).failedAttempts, 2)
})

test('draining a stalled transport is bounded and still allows subsequent failures', async () => {
  const client = new ProductTelemetryClient({ endpoint: 'https://test.invalid', context, actorProvider: () => actor, fetchImpl: async () => new Promise(() => {}) })
  client.record('update_install_requested', { outcome: 'requested', detail: 'manual', bucket: 'none' })
  const started = Date.now()
  assert.equal(await client.drain({ deadlineMs: 20 }), false)
  assert.ok(Date.now() - started < 500)
  assert.equal(client.record('update_error', { outcome: 'error', detail: 'manual', bucket: 'none', update: diagnostic({ stage: 'install' }) }), true)
  await client.shutdown({ deadlineMs: 20 })
})
