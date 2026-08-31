import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyRuntimeStartFailure,
  ProductMetricsRecorder,
} from '../src/product-metrics.mjs'

function createRecorder({ times = [0] } = {}) {
  const events = []
  let index = 0
  const recorder = new ProductMetricsRecorder({
    client: { record: (name, dimensions) => events.push({ name, ...dimensions }) },
    now: () => times[Math.min(index++, times.length - 1)],
  })
  return { events, recorder }
}

test('runtime failure classification emits only fixed privacy-safe categories', () => {
  assert.equal(classifyRuntimeStartFailure({ error: 'listen EADDRINUSE 127.0.0.1:34115' }), 'port-conflict')
  assert.equal(classifyRuntimeStartFailure({ error: 'runtime entry file is missing' }), 'runtime-missing')
  assert.equal(classifyRuntimeStartFailure({ error: 'runtime integrity checksum mismatch' }), 'integrity-failed')
  assert.equal(classifyRuntimeStartFailure({ restartBlocked: 'repeated-crash' }), 'repeated-crash')
  assert.equal(classifyRuntimeStartFailure({ error: 'child exited before readiness' }), 'startup-failed')
  assert.equal(classifyRuntimeStartFailure({}), 'unknown')
})

test('runtime attempts produce one bounded result without raw errors', () => {
  const { events, recorder } = createRecorder({ times: [0, 1_000, 4_200, 10_000, 11_000] })
  recorder.observeRuntimeStatus({ state: 'starting' })
  recorder.observeRuntimeStatus({ state: 'ready', url: 'http://127.0.0.1:34115/' })
  recorder.observeRuntimeStatus({ state: 'ready', url: 'http://127.0.0.1:34115/' })
  recorder.observeRuntimeStatus({ state: 'starting' })
  recorder.observeRuntimeStatus({ state: 'crashed', error: 'listen EADDRINUSE C:\\private\\file' })

  assert.deepEqual(events, [
    {
      name: 'runtime_start_result',
      outcome: 'ready',
      detail: 'none',
      bucket: '2-5s',
    },
    {
      name: 'runtime_start_result',
      outcome: 'failed',
      detail: 'port-conflict',
      bucket: 'under-2s',
    },
  ])
  assert.equal(JSON.stringify(events).includes('private'), false)
})

test('update status transitions are deduplicated and retain manual origin', () => {
  const { events, recorder } = createRecorder()
  recorder.observeUpdateStatus({ phase: 'checking', visible: true })
  recorder.observeUpdateStatus({ phase: 'downloading', percent: 0 })
  recorder.observeUpdateStatus({ phase: 'downloading', percent: 52 })
  recorder.observeUpdateStatus({ phase: 'ready' })
  recorder.observeUpdateStatus({ phase: 'installing' })

  assert.deepEqual(events, [
    { name: 'update_available', outcome: 'available', detail: 'manual', bucket: 'none' },
    { name: 'update_downloaded', outcome: 'downloaded', detail: 'manual', bucket: 'none' },
    { name: 'update_install_requested', outcome: 'requested', detail: 'manual', bucket: 'none' },
  ])
})

test('update completion and dock funnel actions stay fixed and bounded', () => {
  const { events, recorder } = createRecorder()
  recorder.recordUpdateCompleted()
  recorder.recordDockImpression()
  recorder.recordDockNudgeShown()
  recorder.recordDockNudgeShown()
  recorder.recordDockNudgeDismissed('escape')
  recorder.recordDockClick()
  recorder.recordDockOpened(true)
  recorder.recordDockOpened(false)

  assert.deepEqual(events, [
    { name: 'update_completed', outcome: 'completed', detail: 'receipt', bucket: 'none' },
    { name: 'dock_entry_impression', outcome: 'shown', detail: 'settings-adjacent', bucket: 'none' },
    { name: 'dock_nudge_shown', outcome: 'shown', detail: 'first-three-launches', bucket: 'none' },
    { name: 'dock_nudge_dismissed', outcome: 'dismissed', detail: 'escape', bucket: 'none' },
    { name: 'dock_entry_click', outcome: 'clicked', detail: 'settings-adjacent', bucket: 'none' },
    { name: 'dock_opened', outcome: 'opened', detail: 'settings-adjacent', bucket: 'none' },
    { name: 'dock_opened', outcome: 'failed', detail: 'settings-adjacent', bucket: 'none' },
  ])
})

test('Value Mode metrics record roles and lifecycle without model identity', () => {
  const { events, recorder } = createRecorder()
  recorder.recordValueModeEntry(false)
  recorder.recordValueModeOnboarding('shown', 'header')
  recorder.recordValueModeStrategy('balanced')
  recorder.recordValueModeState('enabled', 'onboarding')
  recorder.recordValueModeCall('started', 'controller')
  recorder.recordValueModeCall('failed', 'subagent')
  assert.equal(recorder.recordValueModeEvent({ kind: 'strategy', strategy: 'saver' }), false)
  assert.equal(recorder.recordValueModeEvent({ kind: 'strategy', strategy: 'secret-model' }), false)
  assert.deepEqual(events, [
    { name: 'value_mode_entry', outcome: 'selected', detail: 'unconfigured', bucket: 'none' },
    { name: 'value_mode_onboarding', outcome: 'shown', detail: 'header', bucket: 'none' },
    { name: 'value_mode_strategy', outcome: 'selected', detail: 'balanced', bucket: 'none' },
    { name: 'value_mode_state', outcome: 'enabled', detail: 'onboarding', bucket: 'none' },
    { name: 'value_mode_call', outcome: 'started', detail: 'controller', bucket: 'none' },
    { name: 'value_mode_call', outcome: 'failed', detail: 'subagent', bucket: 'none' },
    { name: 'value_mode_strategy', outcome: 'selected', detail: 'saver', bucket: 'none' },
  ])
  assert.equal(JSON.stringify(events).includes('secret-model'), false)
})

test('fixed product actions and extension outcomes never include extension identity', async () => {
  const { events, recorder } = createRecorder({ times: [0, 31 * 60_000] })
  recorder.recordLaunch('normal')
  recorder.recordLaunch('deep-link')
  recorder.recordRecovery('repair')
  recorder.recordSurface('extensions')
  await recorder.trackExtensionOperation('install', async () => ({ name: '@private/plugin' }))
  await assert.rejects(
    recorder.trackExtensionOperation('disable', async () => { throw new Error('secret plugin path') }),
    /secret plugin path/u,
  )
  recorder.recordSessionEnd()
  recorder.recordSessionEnd()

  assert.deepEqual(events, [
    { name: 'app_launch', outcome: 'started', detail: 'normal', bucket: 'none' },
    { name: 'runtime_recovery_action', outcome: 'requested', detail: 'repair', bucket: 'none' },
    { name: 'surface_opened', outcome: 'opened', detail: 'extensions', bucket: 'none' },
    { name: 'extension_operation', outcome: 'success', detail: 'install', bucket: 'none' },
    { name: 'extension_operation', outcome: 'failure', detail: 'disable', bucket: 'none' },
    { name: 'app_session_end', outcome: 'closed', detail: 'normal', bucket: '30-120m' },
  ])
  assert.equal(JSON.stringify(events).includes('@private/plugin'), false)
  assert.equal(JSON.stringify(events).includes('secret plugin path'), false)
})

test('metrics failures are isolated from product operations', async () => {
  const recorder = new ProductMetricsRecorder({
    client: { record: () => { throw new Error('transport validation failed') } },
    now: () => 0,
  })
  assert.doesNotThrow(() => recorder.recordSurface('help'))
  assert.equal(await recorder.trackExtensionOperation('remove', async () => 'removed'), 'removed')
})

test('direct startup and automatic repair milestones are bounded and deduplicated', () => {
  const { events, recorder } = createRecorder()
  recorder.recordFullStartFailed({ detail: 'plugin-startup', durationMs: 7_000 })
  recorder.recordRepairAgentStarted('default-model')
  recorder.recordRepairAgentStarted('default-model')
  recorder.recordRepairAgentSucceeded({ detail: 'default-model', durationMs: 20_000 })
  recorder.recordDirectStartReady({ detail: 'repaired', durationMs: 31_000 })
  recorder.recordDirectStartReady({ detail: 'repaired', durationMs: 32_000 })

  assert.deepEqual(events, [
    { name: 'full_start_failed', outcome: 'failed', detail: 'plugin-startup', bucket: '5-15s' },
    { name: 'repair_agent_started', outcome: 'started', detail: 'default-model', bucket: 'none' },
    { name: 'repair_agent_succeeded', outcome: 'succeeded', detail: 'default-model', bucket: '15-60s' },
    { name: 'direct_start_ready', outcome: 'ready', detail: 'repaired', bucket: '15-60s' },
  ])
})

test('fallback and installation metrics expose categories but never private contents', () => {
  const { events, recorder } = createRecorder()
  recorder.recordRepairAgentFailed({ detail: 'model-unavailable', durationMs: 10 })
  recorder.recordBuiltinsFallbackReady({ detail: 'repair-failed', durationMs: 70_000 })
  recorder.recordInstallationRepairRequired('integrity-failed')

  assert.deepEqual(events, [
    { name: 'repair_agent_failed', outcome: 'failed', detail: 'model-unavailable', bucket: 'under-2s' },
    { name: 'builtins_fallback_ready', outcome: 'ready', detail: 'repair-failed', bucket: 'over-60s' },
    { name: 'installation_repair_required', outcome: 'blocked', detail: 'integrity-failed', bucket: 'none' },
  ])
  assert.equal(JSON.stringify(events).includes('Users'), false)
})
