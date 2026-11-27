import assert from 'node:assert/strict'
import test from 'node:test'
import { immutableSnapshot } from '../src/immutable-snapshot.mjs'

test('snapshots detach and freeze nested records while callers keep mutable inputs', () => {
  const source = { checks: [{ passed: false }], optional: undefined }
  const snapshot = immutableSnapshot(source)
  source.checks[0].passed = true
  source.checks.push({ passed: true })
  assert.deepEqual(snapshot, { checks: [{ passed: false }], optional: undefined })
  assert.throws(() => { snapshot.checks[0].passed = true }, TypeError)
  assert.throws(() => snapshot.checks.pop(), TypeError)
  assert.ok(Object.isFrozen(snapshot))
})
