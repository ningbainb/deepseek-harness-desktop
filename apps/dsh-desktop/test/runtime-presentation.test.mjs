import assert from 'node:assert/strict'
import test from 'node:test'

import { createRuntimePresentationGuard } from '../src/runtime-presentation.mjs'

test('active runtime presentation stays valid until shutdown begins', () => {
  const guard = createRuntimePresentationGuard()
  const current = guard.capture()
  assert.equal(guard.active, true)
  assert.equal(current(), true)
  guard.suspend()
  assert.equal(guard.active, false)
  assert.equal(current(), false)
  assert.equal(guard.capture()(), false)
})

test('cancelled shutdown permits new presentation without reviving old work', () => {
  const guard = createRuntimePresentationGuard()
  const beforeQuit = guard.capture()
  guard.suspend()
  const duringQuit = guard.capture()
  guard.resume()
  assert.equal(guard.active, true)
  assert.equal(beforeQuit(), false)
  assert.equal(duringQuit(), false)
  assert.equal(guard.capture()(), true)
})

test('duplicate lifecycle notifications preserve current active work', () => {
  const guard = createRuntimePresentationGuard()
  const initial = guard.capture()
  guard.resume()
  assert.equal(initial(), true)
  guard.suspend()
  guard.suspend()
  guard.resume()
  const recovered = guard.capture()
  guard.resume()
  assert.equal(recovered(), true)
  assert.equal(initial(), false)
})

test('a late renderer rejection cannot schedule recovery after quit and resume', async () => {
  const guard = createRuntimePresentationGuard()
  let rejectLoad
  let restarts = 0
  const current = guard.capture()
  const operation = new Promise((_resolve, reject) => { rejectLoad = reject })
    .catch(() => { if (current()) restarts += 1 })
  guard.suspend()
  guard.resume()
  rejectLoad(new Error('navigation aborted'))
  await operation
  assert.equal(restarts, 0)
  // Positive control: a genuine current failure can still recover.
  const recovered = guard.capture()
  await Promise.reject(new Error('current load failed'))
    .catch(() => { if (recovered()) restarts += 1 })
  assert.equal(restarts, 1)
})
