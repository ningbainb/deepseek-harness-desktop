import assert from 'node:assert/strict'
import test from 'node:test'

import { StartupRepairCoordinator } from '../src/startup-repair-coordinator.mjs'

function fakeProvider({ profileName, dshHome = 'C:\\same-home', failures = 0, calls }) {
  let remainingFailures = failures
  return {
    profileName,
    dshHome,
    status: { state: 'stopped' },
    async ensureProfile() {
      calls.push(['ensure', profileName])
    },
    async start() {
      calls.push(['start', profileName])
      if (remainingFailures > 0) {
        remainingFailures -= 1
        this.status = { state: 'crashed' }
        throw new Error('bounded fake startup failure')
      }
      this.status = { state: 'ready', url: `http://127.0.0.1/${profileName}` }
      return this.status.url
    },
    async stop() {
      calls.push(['stop', profileName])
      this.status = { state: 'stopped' }
    },
    async forceStop() {
      calls.push(['force-stop', profileName])
      this.status = { state: 'stopped' }
    },
  }
}

test('full startup retries once then reaches same-home builtins without a model', async () => {
  const calls = []
  const states = []
  const full = fakeProvider({ profileName: 'desktop', failures: 2, calls })
  const builtins = fakeProvider({ profileName: 'desktop-builtins', calls })
  const providers = new Map([[full.profileName, full], [builtins.profileName, builtins]])
  const coordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => providers.get(profileName),
    runRepair: async () => ({ status: 'unavailable' }),
    publishState: (state) => states.push(state),
  })

  const result = await coordinator.start()

  assert.equal(result.state, 'ready-builtins')
  assert.equal(result.provider, builtins)
  assert.equal(full.dshHome, builtins.dshHome)
  assert.deepEqual(calls, [
    ['ensure', 'desktop'],
    ['start', 'desktop'],
    ['stop', 'desktop'],
    ['ensure', 'desktop'],
    ['start', 'desktop'],
    ['stop', 'desktop'],
    ['ensure', 'desktop-builtins'],
    ['start', 'desktop-builtins'],
  ])
  assert.deepEqual(states, [
    'starting-full',
    'retrying-full',
    'repairing',
    'starting-builtins',
    'ready-builtins',
  ])
})

test('healthy full startup never creates a fallback provider or calls repair', async () => {
  const calls = []
  const full = fakeProvider({ profileName: 'desktop', calls })
  let repairCalls = 0
  let fallbackCalls = 0
  const coordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => {
      if (profileName === 'desktop-builtins') fallbackCalls += 1
      return full
    },
    runRepair: async () => { repairCalls += 1; return { status: 'unavailable' } },
  })

  const result = await coordinator.start()
  assert.equal(result.state, 'ready-full')
  assert.deepEqual(calls, [['ensure', 'desktop'], ['start', 'desktop']])
  assert.equal(repairCalls, 0)
  assert.equal(fallbackCalls, 0)
})

test('fallback rejects a different Home instead of creating an isolated session', async () => {
  const calls = []
  const full = fakeProvider({ profileName: 'desktop', failures: 2, calls })
  const builtins = fakeProvider({ profileName: 'desktop-builtins', dshHome: 'D:\\other-home', calls })
  const coordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => profileName === 'desktop' ? full : builtins,
    runRepair: async () => ({ status: 'unavailable' }),
  })

  await assert.rejects(coordinator.start(), /same DSH Home/u)
  assert.equal(calls.some(([operation, profileName]) => operation === 'start' && profileName === 'desktop-builtins'), false)
})

test('applied repair commits only after the repaired full Runtime is ready', async () => {
  const calls = []
  const states = []
  const full = fakeProvider({ profileName: 'desktop', failures: 2, calls })
  const builtins = fakeProvider({ profileName: 'desktop-builtins', calls })
  let repairInput
  const coordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => profileName === 'desktop' ? full : builtins,
    runRepair: async (input) => {
      repairInput = input
      calls.push(['repair'])
      return {
        status: 'applied',
        async commit() { calls.push(['commit']) },
        async rollback() { calls.push(['rollback']) },
      }
    },
    publishState: (state) => states.push(state),
  })

  const result = await coordinator.start()

  assert.equal(result.state, 'ready-full')
  assert.equal(result.repaired, true)
  assert.equal(repairInput.fullAttempts, 2)
  assert.equal(repairInput.failures.length, 2)
  assert.equal(repairInput.failures.every(error => error instanceof Error), true)
  assert.deepEqual(calls.slice(-4), [
    ['repair'],
    ['ensure', 'desktop'],
    ['start', 'desktop'],
    ['commit'],
  ])
  assert.equal(calls.some(([operation]) => operation === 'rollback'), false)
  assert.deepEqual(states, ['starting-full', 'retrying-full', 'repairing', 'ready-full'])
})

test('failed repaired full start rolls back before the same-home builtins fallback', async () => {
  const calls = []
  const states = []
  const full = fakeProvider({ profileName: 'desktop', failures: 3, calls })
  const builtins = fakeProvider({ profileName: 'desktop-builtins', calls })
  const coordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => profileName === 'desktop' ? full : builtins,
    runRepair: async () => ({
      status: 'applied',
      async commit() { calls.push(['commit']) },
      async rollback() { calls.push(['rollback']) },
    }),
    publishState: (state) => states.push(state),
  })

  const result = await coordinator.start()

  assert.equal(result.state, 'ready-builtins')
  assert.equal(calls.some(([operation]) => operation === 'commit'), false)
  assert.ok(calls.findIndex(([operation]) => operation === 'rollback')
    < calls.findIndex(([operation, profileName]) => operation === 'start' && profileName === 'desktop-builtins'))
  assert.deepEqual(states, [
    'starting-full',
    'retrying-full',
    'repairing',
    'rolling-back',
    'starting-builtins',
    'ready-builtins',
  ])
})

test('rollback failure is contained and builtins still becomes ready', async () => {
  const calls = []
  const full = fakeProvider({ profileName: 'desktop', failures: 3, calls })
  const builtins = fakeProvider({ profileName: 'desktop-builtins', calls })
  const coordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => profileName === 'desktop' ? full : builtins,
    runRepair: async () => ({
      status: 'applied',
      async rollback() {
        calls.push(['rollback'])
        throw new Error('bounded rollback failure')
      },
    }),
  })

  const result = await coordinator.start()

  assert.equal(result.state, 'ready-builtins')
  assert.equal(result.rollbackFailed, true)
})
