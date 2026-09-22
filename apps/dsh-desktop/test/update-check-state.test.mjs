import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  DesktopUpdateCheckStore,
  UPDATE_CHECK_OFFLINE_RETRY_MS,
  UPDATE_CHECK_SUCCESS_INTERVAL_MS,
  normalizeUpdateCheckState,
} from '../src/update-check-state.mjs'

test('automatic update cooldown survives a process restart while manual policy stays outside the store', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-check-state-'))
  try {
    const path = join(root, 'state.json')
    let clock = Date.UTC(2026, 8, 21, 0, 0, 0)
    const first = new DesktopUpdateCheckStore({ path, now: () => clock, random: () => 0 })
    assert.equal(await first.shouldCheck('stable'), true)
    await first.recordAttempt('stable')

    const restarted = new DesktopUpdateCheckStore({ path, now: () => clock, random: () => 0 })
    assert.equal(await restarted.shouldCheck('stable'), false)
    clock += UPDATE_CHECK_SUCCESS_INTERVAL_MS
    assert.equal(await restarted.shouldCheck('stable'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('network failures back off progressively and success resets the failure state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-check-backoff-'))
  try {
    const path = join(root, 'state.json')
    let clock = Date.UTC(2026, 8, 21, 0, 0, 0)
    const store = new DesktopUpdateCheckStore({ path, now: () => clock, random: () => 0 })
    const firstFailure = await store.recordFailure('stable', 'network')
    assert.equal(firstFailure.consecutiveFailures, 1)
    assert.equal(firstFailure.nextAutomaticCheckAt - clock, 60 * 60 * 1000)

    clock = firstFailure.nextAutomaticCheckAt
    const secondFailure = await store.recordFailure('stable', 'timeout')
    assert.equal(secondFailure.consecutiveFailures, 2)
    assert.equal(secondFailure.nextAutomaticCheckAt - clock, 3 * 60 * 60 * 1000)

    clock = secondFailure.nextAutomaticCheckAt
    const success = await store.recordSuccess('stable')
    assert.equal(success.consecutiveFailures, 0)
    assert.equal(success.lastFailureType, null)
    assert.equal(success.nextAutomaticCheckAt - clock, UPDATE_CHECK_SUCCESS_INTERVAL_MS)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('offline deferral does not count as a failed update attempt or expose arbitrary state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-check-offline-'))
  try {
    const path = join(root, 'state.json')
    const clock = Date.UTC(2026, 8, 21, 0, 0, 0)
    const store = new DesktopUpdateCheckStore({ path, now: () => clock, random: () => 0 })
    const state = await store.deferOffline('stable')
    assert.equal(state.consecutiveFailures, 0)
    assert.equal(state.lastFailureType, null)
    assert.equal(state.lastDeferralReason, 'offline')
    assert.equal(state.nextAutomaticCheckAt - clock, UPDATE_CHECK_OFFLINE_RETRY_MS)
    assert.deepEqual(Object.keys(JSON.parse(await readFile(path, 'utf8'))).toSorted(), [
      'channel',
      'consecutiveFailures',
      'lastAttemptAt',
      'lastDeferralReason',
      'lastFailureType',
      'lastSuccessAt',
      'nextAutomaticCheckAt',
      'schemaVersion',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('invalid and cross-channel state fail open without carrying a stale cooldown', () => {
  assert.equal(normalizeUpdateCheckState({ schemaVersion: 1, channel: 'stable', nextAutomaticCheckAt: Number.MAX_VALUE }, 'beta').nextAutomaticCheckAt, 0)
  assert.equal(normalizeUpdateCheckState({ private: 'value' }, 'stable').nextAutomaticCheckAt, 0)
})
