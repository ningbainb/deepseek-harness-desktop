import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { normalizeFeatureEvent } from '../src/feature-telemetry.mjs'
import { ProductMetricsRecorder } from '../src/product-metrics.mjs'
import { ProductTelemetryClient, PRODUCT_TELEMETRY_MAX_QUEUED_EVENTS } from '../src/telemetry-client.mjs'
import { registerDesktopIpc } from '../src/ipc.mjs'
import { DesktopSurfaceRegistry } from '../src/desktop-surfaces.mjs'

test('feature bridge accepts only fixed fields and telemetry failure cannot break work', () => {
  const event = { feature: 'attachment', outcome: 'succeeded', detail: 'file' }
  assert.deepEqual(normalizeFeatureEvent(event), event)
  for (const bad of [{ ...event, filename: 'private.txt' }, { ...event, detail: 'private.txt' }, { ...event, feature: 'constructor' }, { ...event, error: 'secret' }]) assert.throws(() => normalizeFeatureEvent(bad))
  const recorder = new ProductMetricsRecorder({ client: { record() { throw Error('offline') } } })
  assert.equal(recorder.recordFeatureEvent(event), false)
})

test('feature IPC rejects other surfaces and free-form fields', async () => {
  const handlers = new Map(); const surfaceRegistry = new DesktopSurfaceRegistry(); const sender = {}; const foreign = {}
  surfaceRegistry.register(sender, 'main'); surfaceRegistry.register(foreign, 'extensions')
  const events = []; const controller = new EventEmitter(); controller.status = { state: 'ready' }
  const dispose = registerDesktopIpc({ ipcMain: { handle: (key, fn) => handlers.set(key, fn), removeHandler: key => handlers.delete(key) }, surfaceRegistry, controller, getWindow() {}, metadata: {}, recordFeatureEvent: event => events.push(event) })
  try {
    const event = { feature: 'project', outcome: 'succeeded', detail: 'create' }
    await handlers.get('desktop:feature-event')({ sender }, event)
    await assert.rejects(() => handlers.get('desktop:feature-event')({ sender: foreign }, event))
    await assert.rejects(() => handlers.get('desktop:feature-event')({ sender }, { ...event, path: 'secret' }))
    assert.deepEqual(events, [event])
  } finally { dispose() }
  assert.equal(handlers.has('desktop:feature-event'), false)
})

test('a stalled transport has bounded memory and shutdown drains pending batches', async () => {
  let release; let sent = 0
  const client = new ProductTelemetryClient({ endpoint: 'https://test.invalid/v1/events', context: { appVersion: '3.3.0', channel: 'stable', os: 'windows-11', language: 'zh' }, actorProvider: () => ({ installationActor: 'a'.repeat(64), dailyActor: 'b'.repeat(64), monthlyActor: 'c'.repeat(64) }), schedule: () => 1, cancelSchedule() {}, fetchImpl: async (_url, init) => { sent += JSON.parse(init.body).events.length; if (!release) await new Promise(resolve => { release = resolve }); return new Response(null, { status: 204 }) } })
  for (let i = 0; i < 1000; i++) client.record('surface_opened', { outcome: 'opened', detail: 'settings', bucket: 'none' })
  await Promise.resolve()
  assert.equal(client.queued, PRODUCT_TELEMETRY_MAX_QUEUED_EVENTS)
  assert.equal(client.droppedEvents, 780)
  const stopping = client.shutdown({ deadlineMs: 1000 }); release()
  assert.equal(await stopping, true); assert.equal(sent, 220); assert.equal(client.queued, 0)
  assert.equal(client.record('surface_opened', { outcome: 'opened', detail: 'settings', bucket: 'none' }), false)
})
