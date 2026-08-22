import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { RepairRuntimeController } from '../src/repair-runtime-controller.mjs'

function fakeChild(calls) {
  const child = new EventEmitter()
  child.status = { state: 'stopped' }
  child.start = async () => {
    calls.push('start')
    child.status = { state: 'ready' }
    child.emit('status', child.status)
  }
  child.stop = async () => {
    calls.push('stop')
    child.status = { state: 'stopped' }
  }
  child.forceStop = async () => {
    calls.push('force-stop')
    child.status = { state: 'stopped' }
  }
  return child
}

test('repair Runtime uses only its managed profile and private job environment', async () => {
  const incidentDir = join(tmpdir(), 'repair-runtime-controller-test')
  const calls = []
  const child = fakeChild(calls)
  let controllerOptions
  const runtime = new RepairRuntimeController({
    ensureProfile: async () => calls.push('ensure'),
    createController: (options) => {
      controllerOptions = options
      return child
    },
    waitForResult: async () => ({ status: 'candidate-ready', checksRequested: ['test'] }),
  })

  const result = await runtime.run({
    jobPath: join(incidentDir, 'job.json'),
    resultPath: join(incidentDir, 'result.json'),
  })

  assert.equal(result.status, 'candidate-ready')
  assert.equal(controllerOptions.profileName, 'desktop-repair')
  assert.equal(controllerOptions.preferredPort, 0)
  assert.deepEqual(controllerOptions.patchFiles, [])
  assert.equal(controllerOptions.environment.DSH_DESKTOP_REPAIR_JOB, join(incidentDir, 'job.json'))
  assert.equal(controllerOptions.environment.DSH_DESKTOP_REPAIR_MODE, '1')
  assert.equal(controllerOptions.environment.DSH_DESKTOP_BACKGROUND_AUTOMATION, '0')
  assert.deepEqual(calls, ['ensure', 'start', 'stop'])
})

test('repair Runtime rejects job and result paths outside one incident directory', async () => {
  const runtime = new RepairRuntimeController({
    ensureProfile: async () => {},
    createController: () => fakeChild([]),
    waitForResult: async () => ({ status: 'candidate-ready' }),
  })

  await assert.rejects(runtime.run({ jobPath: 'job.json', resultPath: 'result.json' }), /absolute/u)
  await assert.rejects(runtime.run({
    jobPath: join(tmpdir(), 'incident-a', 'job.json'),
    resultPath: join(tmpdir(), 'incident-b', 'result.json'),
  }), /incident directory/u)
})

test('repair Runtime reports a child crash and always reclaims the process', async () => {
  const incidentDir = join(tmpdir(), 'repair-runtime-controller-crash')
  const calls = []
  const child = fakeChild(calls)
  const runtime = new RepairRuntimeController({
    ensureProfile: async () => {},
    createController: () => child,
    waitForResult: async () => {
      await new Promise(resolve => setImmediate(resolve))
      child.status = { state: 'crashed' }
      child.emit('status', child.status)
      return new Promise(() => {})
    },
  })

  await assert.rejects(runtime.run({
    jobPath: join(incidentDir, 'job.json'),
    resultPath: join(incidentDir, 'result.json'),
  }), /exited before producing/u)
  assert.deepEqual(calls, ['start', 'stop'])
})

test('repair Runtime force-stops a child whose graceful stop is bounded out', async () => {
  const incidentDir = join(tmpdir(), 'repair-runtime-controller-stop-timeout')
  const calls = []
  const child = fakeChild(calls)
  child.stop = async () => {
    calls.push('stop')
    return new Promise(() => {})
  }
  const runtime = new RepairRuntimeController({
    ensureProfile: async () => {},
    createController: () => child,
    waitForResult: async () => ({ status: 'model-unavailable' }),
    stopTimeoutMs: 10,
  })

  const result = await runtime.run({
    jobPath: join(incidentDir, 'job.json'),
    resultPath: join(incidentDir, 'result.json'),
  })

  assert.equal(result.status, 'model-unavailable')
  assert.deepEqual(calls, ['start', 'stop', 'force-stop'])
})
