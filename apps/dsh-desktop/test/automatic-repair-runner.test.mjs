import assert from 'node:assert/strict'
import test from 'node:test'

import { AutomaticRepairRunner } from '../src/automatic-repair-runner.mjs'

function fixture({ modelStatus = 'candidate-ready', verification = { ok: true, status: 'verified' } } = {}) {
  const calls = []
  const writeJobInputs = []
  const incident = { fingerprint: 'a'.repeat(64) }
  const incidentStore = {
    incidentDirectory: () => 'C:\\user-data\\repair-agent\\incidents\\' + incident.fingerprint,
    async claim(input) { calls.push(['claim', input]); return { claimed: true, incident } },
    async transition(fingerprint, state, detail) { calls.push(['transition', state, detail]) },
    async recordModelAttempt(fingerprint, attempt) { calls.push(['model', attempt.outcome]) },
    async recordToolAction(fingerprint, action) { calls.push(['action', action.tool]) },
  }
  const transaction = {
    phase: 'created',
    async stage() {
      calls.push(['stage'])
      this.phase = 'staged'
      return { workspace: 'C:\\incident\\staging', roots: [{ id: 'profile', kind: 'profile', relativePath: 'profile' }] }
    },
    async verify(check) {
      calls.push(['verify-transaction'])
      const result = await check({ workspace: 'C:\\incident\\staging', changedFiles: [{ path: 'profile/cordis.patch.yml' }] })
      if (result?.ok === false) throw new Error('candidate verification failed')
      this.phase = 'verified'
    },
    async apply() { calls.push(['apply']); this.phase = 'applied' },
    async commit() { calls.push(['commit']); this.phase = 'committed' },
    async rollback() { calls.push(['rollback']); this.phase = 'rolled-back' },
  }
  const runner = new AutomaticRepairRunner({
    incidentStore,
    desktopVersion: '3.0.2',
    runtimeVersion: '0.1.1-rc.1',
    profileDir: 'C:\\home\\profiles\\desktop',
    builtInBundles: ['@builtin/core'],
    resolveRoots: async () => ({
      roots: [{ id: 'profile', kind: 'profile', path: 'C:\\home\\profiles\\desktop' }],
      bundles: [{ name: '@user/plugin', version: '1.0.0', enabled: true }],
    }),
    createTransaction: async () => transaction,
    writeJob: async (input) => {
      writeJobInputs.push(input)
      return {
      jobPath: 'C:\\user-data\\repair-agent\\incidents\\' + incident.fingerprint + '\\job.json',
      resultPath: 'C:\\user-data\\repair-agent\\incidents\\' + incident.fingerprint + '\\result.json',
      }
    },
    repairRuntime: {
      async run() {
        calls.push(['model-runtime'])
        return {
          status: modelStatus,
          checksRequested: ['test'],
          attempts: [{ provider: 'configured', model: 'default', outcome: modelStatus }],
          actions: [{ tool: 'finish-repair', outcome: modelStatus }],
        }
      },
    },
    createVerifier: () => ({
      async verify(input) { calls.push(['verify-candidate', input.checksRequested]); return verification },
    }),
  })
  return { runner, calls, transaction, writeJobInputs }
}

test('automatic repair applies a verified candidate and defers commit until full startup succeeds', async () => {
  const { runner, calls, transaction } = fixture()

  const repaired = await runner.run({ failures: [Object.assign(new Error('private path omitted'), { code: 'PLUGIN_LOAD' })] })

  assert.equal(repaired.status, 'applied')
  assert.equal(transaction.phase, 'applied')
  assert.deepEqual(calls.map(call => call[0]), [
    'claim', 'transition', 'stage', 'model-runtime', 'model', 'action',
    'verify-transaction', 'verify-candidate', 'transition', 'apply',
  ])
  await repaired.commit()
  assert.equal(transaction.phase, 'committed')
  assert.deepEqual(calls.slice(-2).map(call => call.slice(0, 2)), [['commit'], ['transition', 'applied']])
})

test('automatic repair rolls back and exhausts the incident when no model is configured', async () => {
  const { runner, calls, transaction } = fixture({ modelStatus: 'model-unavailable' })

  const repaired = await runner.run({ failures: [new Error('startup failed')] })

  assert.equal(repaired.status, 'unavailable')
  assert.equal(transaction.phase, 'rolled-back')
  assert.deepEqual(calls.slice(-2).map(call => call.slice(0, 3)), [
    ['rollback'],
    ['transition', 'exhausted', 'model-unavailable'],
  ])
})

test('automatic repair rejects a failed candidate check without applying files', async () => {
  const { runner, calls, transaction } = fixture({
    verification: { ok: false, status: 'failed', category: 'check-failed', check: 'test' },
  })

  const repaired = await runner.run({ failures: [new Error('startup failed')] })

  assert.equal(repaired.status, 'failed')
  assert.equal(transaction.phase, 'rolled-back')
  assert.equal(calls.some(([operation]) => operation === 'apply'), false)
  assert.deepEqual(calls.at(-1).slice(0, 3), ['transition', 'exhausted', 'check-failed'])
})

test('an already claimed fingerprint skips the model and converges to fallback', async () => {
  const { runner, calls } = fixture()
  runner.incidentStore.claim = async () => ({ claimed: false, incident: { fingerprint: 'a'.repeat(64) } })

  const repaired = await runner.run({ failures: [new Error('startup failed')] })

  assert.deepEqual(repaired, { status: 'unavailable', reason: 'budget-exhausted' })
  assert.equal(calls.length, 0)
})

test('passes the checked tools capability and bounded fallback list into the repair job', async () => {
  const { runner, writeJobInputs } = fixture()

  await runner.run({
    failures: [new Error('startup failed')],
    defaultToolsCapability: 'none',
    fallbackModels: [{
      provider: 'fallback',
      model: 'repair-2',
      toolsCapability: 'native',
    }],
  })

  assert.equal(writeJobInputs[0].defaultToolsCapability, 'none')
  assert.deepEqual(writeJobInputs[0].fallbackModels, [{
    provider: 'fallback',
    model: 'repair-2',
    toolsCapability: 'native',
  }])
})
