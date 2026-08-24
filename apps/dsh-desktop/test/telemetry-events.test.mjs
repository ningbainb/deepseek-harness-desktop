import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProductEvent,
  normalizeProductContext,
  PRODUCT_EVENT_NAMES,
  sessionDurationBucket,
  startupDurationBucket,
} from '../src/telemetry-events.mjs'

const ACTORS = Object.freeze({
  installationActor: 'c'.repeat(64),
  dailyActor: 'a'.repeat(64),
  monthlyActor: 'b'.repeat(64),
})

test('normalizes only coarse product context dimensions', () => {
  assert.deepEqual(normalizeProductContext({
    version: '2.5.0',
    platform: 'win32',
    osRelease: '10.0.22631',
    locale: 'zh-CN',
  }), {
    appVersion: '2.5.0',
    channel: 'stable',
    os: 'windows-11',
    language: 'zh',
  })
  assert.deepEqual(normalizeProductContext({
    version: '2.6.0-beta.1',
    platform: 'win32',
    osRelease: '10.0.19045',
    locale: 'en-US',
  }), {
    appVersion: '2.6.0-beta.1',
    channel: 'prerelease',
    os: 'windows-10',
    language: 'en',
  })
})

test('creates exact fixed-shape events and rejects content-like fields', () => {
  const context = normalizeProductContext({
    version: '2.5.0',
    platform: 'win32',
    osRelease: '10.0.22631',
    locale: 'zh-CN',
  })
  assert.deepEqual(createProductEvent(context, ACTORS, 'surface_opened', {
    outcome: 'opened',
    detail: 'settings',
    bucket: 'none',
  }), {
    name: 'surface_opened',
    appVersion: '2.5.0',
    channel: 'stable',
    os: 'windows-11',
    language: 'zh',
    installationActor: 'c'.repeat(64),
    dailyActor: 'a'.repeat(64),
    monthlyActor: 'b'.repeat(64),
    outcome: 'opened',
    detail: 'settings',
    bucket: 'none',
  })
  assert.throws(() => createProductEvent(context, ACTORS, 'surface_opened', {
    outcome: 'opened',
    detail: 'settings',
    bucket: 'none',
    path: 'C:\\Users\\secret',
  }), /invalid product event dimensions/u)
  assert.throws(() => createProductEvent(context, ACTORS, 'runtime_start_result', {
    outcome: 'failed',
    detail: 'raw exception text',
    bucket: 'unknown',
  }), /invalid product event dimensions/u)
  assert.throws(() => createProductEvent(context, {
    installationActor: 'c'.repeat(64),
    dailyActor: 'stable-installation-id',
    monthlyActor: 'b'.repeat(64),
  }, 'surface_opened', {
    outcome: 'opened',
    detail: 'settings',
    bucket: 'none',
  }), /anonymous product actor/u)
})

test('buckets startup and session durations without sending exact values', () => {
  assert.equal(startupDurationBucket(1_999), 'under-2s')
  assert.equal(startupDurationBucket(2_000), '2-5s')
  assert.equal(startupDurationBucket(5_000), '5-15s')
  assert.equal(startupDurationBucket(60_000), 'over-60s')
  assert.equal(startupDurationBucket(Number.NaN), 'unknown')
  assert.equal(sessionDurationBucket(299_999), 'under-5m')
  assert.equal(sessionDurationBucket(300_000), '5-30m')
  assert.equal(sessionDurationBucket(7_200_000), 'over-120m')
})

test('automatic startup and repair telemetry uses a fixed privacy-safe vocabulary', () => {
  assert.deepEqual(PRODUCT_EVENT_NAMES.filter((name) => (
    name.includes('start')
    || name.includes('repair')
    || name.includes('fallback')
  )), [
    'runtime_start_result',
    'direct_start_ready',
    'full_start_failed',
    'repair_agent_started',
    'repair_agent_succeeded',
    'repair_agent_failed',
    'builtins_fallback_ready',
    'installation_repair_required',
  ])

  const context = normalizeProductContext({
    version: '3.0.2',
    platform: 'win32',
    osRelease: '10.0.22631',
    locale: 'zh-CN',
  })
  assert.deepEqual(createProductEvent(context, ACTORS, 'direct_start_ready', {
    outcome: 'ready',
    detail: 'existing-home',
    bucket: '2-5s',
  }), {
    name: 'direct_start_ready',
    appVersion: '3.0.2',
    channel: 'stable',
    os: 'windows-11',
    language: 'zh',
    installationActor: 'c'.repeat(64),
    dailyActor: 'a'.repeat(64),
    monthlyActor: 'b'.repeat(64),
    outcome: 'ready',
    detail: 'existing-home',
    bucket: '2-5s',
  })
  assert.throws(() => createProductEvent(context, ACTORS, 'repair_agent_failed', {
    outcome: 'failed',
    detail: 'C:\\Users\\alice\\plugin secret prompt',
    bucket: 'unknown',
  }), /invalid product event dimensions/u)
})

test('accepts only the fixed update and dock funnel vocabulary', () => {
  const context = normalizeProductContext({
    version: '3.0.2',
    platform: 'win32',
    osRelease: '10.0.22631',
    locale: 'zh-CN',
  })
  for (const [name, outcome, detail] of [
    ['update_available', 'available', 'automatic'],
    ['update_downloaded', 'downloaded', 'automatic'],
    ['update_install_requested', 'requested', 'manual'],
    ['update_completed', 'completed', 'receipt'],
    ['dock_entry_impression', 'shown', 'settings-adjacent'],
    ['dock_nudge_shown', 'shown', 'first-three-launches'],
    ['dock_nudge_dismissed', 'dismissed', 'close'],
    ['dock_entry_click', 'clicked', 'settings-adjacent'],
    ['dock_opened', 'opened', 'settings-adjacent'],
  ]) {
    assert.doesNotThrow(() => createProductEvent(context, ACTORS, name, {
      outcome,
      detail,
      bucket: 'none',
    }))
  }
})
