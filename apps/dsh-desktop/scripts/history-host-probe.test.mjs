import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCallProbe, eventLoopSample, apply } from './history-host-probe.mjs'

test('probe retains receiver, arguments, result identity and thrown error identity', () => {
  let clock = 0
  const probe = createCallProbe({ now: () => clock })
  const result = {}, error = new Error('private failure')
  const target = { read(arg) { assert.equal(this, target); assert.equal(arg, 'private input'); clock += 75; return result } }
  const original = target.read
  assert.equal(probe.wrap(target, 'read', 'persistence.open'), true)
  assert.equal(target.read('private input'), result)
  const rejecting = { read() { clock += 100; throw error } }
  probe.wrap(rejecting, 'read', 'query.observe')
  assert.throws(() => rejecting.read(), actual => actual === error)
  assert.equal(probe.snapshot().operations[1].failed, 1)
  assert.equal(JSON.stringify(probe.snapshot()).includes('private'), false)
  probe.dispose()
  assert.equal(target.read, original)
})

test('promise identity and rejection remain intact while overlapping calls are measured', async () => {
  let clock = 0, resolve, reject
  const first = new Promise(done => { resolve = done }), failure = new Error('private')
  const second = new Promise((_done, fail) => { reject = fail })
  const probe = createCallProbe({ now: () => clock })
  const target = { read: value => value }
  probe.wrap(target, 'read', 'query.observe')
  assert.equal(target.read(first), first)
  assert.equal(target.read(second), second)
  clock = 80; resolve({ secret: 'private' }); reject(failure)
  await first; await assert.rejects(second, actual => actual === failure)
  assert.deepEqual(probe.snapshot().operations[0], { operation: 'query.observe', count: 2, settled: 2,
    failed: 1, active: 0, maxConcurrent: 2, totalMs: 160, maxMs: 80 })
  probe.dispose()
})

test('samples are bounded and cleanup preserves subsequent owners and inherited descriptors', () => {
  let clock = 0
  const original = function () { clock += 100 }
  const target = Object.create({ read: original })
  const probe = createCallProbe({ now: () => clock, maxSamples: 3 })
  probe.wrap(target, 'read', 'persistence.stat')
  for (let index = 0; index < 20; index++) target.read()
  assert.equal(probe.snapshot().slowest.length, 3)
  assert.equal(probe.snapshot().operations[0].count, 20)
  probe.dispose()
  assert.equal(Object.hasOwn(target, 'read'), false)
  const other = createCallProbe(), replacement = () => {}
  other.wrap(target, 'read', 'persistence.stat'); target.read = replacement; other.dispose()
  assert.equal(target.read, replacement)
  assert.equal(other.wrap(target, 'read', 'query.observe'), false)
})

test('disabled fixture does not access services or write and unpatchable methods remain intact', () => {
  apply(new Proxy({}, { get() { throw new Error('must not access services') } }), {})
  const probe = createCallProbe(), original = () => {}
  const target = Object.freeze({ read: original })
  assert.equal(probe.wrap(target, 'read', 'query.observe'), false)
  assert.equal(probe.wrap(target, 'read', 'untrusted-operation'), false)
  assert.equal(target.read, original)
  assert.deepEqual(probe.snapshot().operations, [])
})

test('event loop delay uses numeric milliseconds and marks an empty interval unavailable', () => {
  assert.deepEqual(eventLoopSample({ count: 3, max: 105000000, mean: 30000000, percentile: () => 105000000 }, 1200.4),
    { atMs: 1200, count: 3, maxMs: 105, meanMs: 30, p99Ms: 105 })
  assert.deepEqual(eventLoopSample({ count: 0, max: 0, mean: NaN, percentile: () => 0 }, 5),
    { atMs: 5, count: 0, maxMs: null, meanMs: null, p99Ms: null })
})
