import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { RepairVerifier } from '../src/repair-verifier.mjs'

function readyProbe(calls) {
  const probe = new EventEmitter()
  probe.status = { state: 'stopped' }
  probe.start = async () => {
    calls.push('probe-start')
    probe.status = { state: 'ready' }
    probe.emit('status', probe.status)
  }
  probe.stop = async () => {
    calls.push('probe-stop')
    probe.status = { state: 'stopped' }
  }
  return probe
}

test('candidate verification runs only requested registered checks then a stable probe', async () => {
  const calls = []
  const probe = readyProbe(calls)
  const verifier = new RepairVerifier({
    registeredChecks: new Map([
      ['typecheck', async () => { calls.push('typecheck'); return { ok: true } }],
      ['test', async () => { calls.push('test'); return { ok: true } }],
    ]),
    createProbe: async () => probe,
    stableMs: 10_000,
    waitStable: async (milliseconds) => {
      assert.equal(milliseconds, 10_000)
      calls.push('stable')
    },
  })

  const result = await verifier.verify({ checksRequested: ['typecheck', 'test'] })

  assert.deepEqual(result, { ok: true, status: 'verified' })
  assert.deepEqual(calls, ['typecheck', 'test', 'probe-start', 'stable', 'probe-stop'])
})

test('unknown model-requested checks fail closed without starting a candidate', async () => {
  let probeCreated = false
  const verifier = new RepairVerifier({
    registeredChecks: new Map([['test', async () => ({ ok: true })]]),
    createProbe: async () => { probeCreated = true; return readyProbe([]) },
    waitStable: async () => {},
  })

  const result = await verifier.verify({ checksRequested: ['download-dependency'] })

  assert.deepEqual(result, { ok: false, status: 'failed', category: 'unregistered-check' })
  assert.equal(probeCreated, false)
})

test('a failed registered check prevents the candidate Runtime probe', async () => {
  let probeCreated = false
  const verifier = new RepairVerifier({
    registeredChecks: new Map([['test', async () => ({ ok: false })]]),
    createProbe: async () => { probeCreated = true; return readyProbe([]) },
    waitStable: async () => {},
  })

  const result = await verifier.verify({ checksRequested: ['test'] })

  assert.deepEqual(result, { ok: false, status: 'failed', category: 'check-failed', check: 'test' })
  assert.equal(probeCreated, false)
})

test('candidate crash during the stability window fails and still stops the probe', async () => {
  const calls = []
  const probe = readyProbe(calls)
  const verifier = new RepairVerifier({
    registeredChecks: new Map(),
    createProbe: async () => probe,
    waitStable: async () => {
      probe.status = { state: 'crashed' }
      probe.emit('status', probe.status)
      await new Promise(resolve => setImmediate(resolve))
    },
  })

  const result = await verifier.verify({ checksRequested: [] })

  assert.deepEqual(result, { ok: false, status: 'failed', category: 'candidate-unstable' })
  assert.deepEqual(calls, ['probe-start', 'probe-stop'])
})

test('candidate start failure is classified and reclaimed', async () => {
  const calls = []
  const probe = readyProbe(calls)
  probe.start = async () => {
    calls.push('probe-start')
    throw new Error('bounded candidate startup failure')
  }
  const verifier = new RepairVerifier({
    registeredChecks: new Map(),
    createProbe: async () => probe,
    waitStable: async () => {},
  })

  const result = await verifier.verify({ checksRequested: [] })

  assert.deepEqual(result, { ok: false, status: 'failed', category: 'candidate-start-failed' })
  assert.deepEqual(calls, ['probe-start', 'probe-stop'])
})
