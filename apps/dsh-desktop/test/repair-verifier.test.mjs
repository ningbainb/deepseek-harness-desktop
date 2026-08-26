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

test('repair command children receive only allowlisted environment variables', async () => {
  const { runRegisteredRepairCommand, verifierChildEnvironment } = await import('../src/repair-verifier.mjs')
  const seen = []
  const fakeSpawn = (executable, args, options) => {
    seen.push(options.env)
    return {
      pid: 4242,
      once(event, handler) {
        if (event === 'exit') setImmediate(() => handler(0))
      },
      kill() {},
    }
  }

  const outcome = await runRegisteredRepairCommand(
    { executable: 'C:/node.exe', args: ['cli.mjs'], cwd: 'packages/example' },
    'C:/incident/staging',
    { spawnProcess: fakeSpawn, timeoutMs: 1000 },
  )

  assert.equal(outcome.ok, true)
  const childEnv = seen[0]
  assert.equal(childEnv.DSH_DESKTOP_REPAIR_JOB, undefined)
  assert.equal(childEnv.apiKey ?? childEnv.API_KEY, undefined)
  assert.equal(childEnv.GITHUB_TOKEN, undefined)
  assert.equal(childEnv.AWS_SECRET_ACCESS_KEY, undefined)
  assert.equal(childEnv.CI, '1')
  assert.equal(typeof childEnv.PATH, 'string')
  assert.equal(childEnv.DSH_DESKTOP_REPAIR_MODE, undefined)

  const filtered = verifierChildEnvironment({
    PATH: 'C:/bin',
    SystemRoot: 'C:/Windows',
    DEEPSEEK_API_KEY: 'sk-secret',
    ANTHROPIC_AUTH_TOKEN: 'token',
    DSH_DESKTOP_REPAIR_MODE: '1',
    NPM_TOKEN: 'npm-secret',
  })
  assert.deepEqual(Object.keys(filtered).toSorted(), [
    'CI', 'PATH', 'SystemRoot',
    'npm_config_audit', 'npm_config_fund', 'npm_config_offline',
  ].toSorted())
})
