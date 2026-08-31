import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { DshRuntimeController } from '../src/runtime-controller.mjs'
import { STARTUP_PHASES } from '../src/startup-phase.mjs'

/**
 * The startup phase is the only thing that can tell a user where a hang
 * actually is, so these tests pin every transition to a real lifecycle event
 * rather than to elapsed time.
 */

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.exitCode = null
    this.killed = false
  }

  kill() {
    this.killed = true
    this.exitCode = 0
    queueMicrotask(() => this.emit('exit', 0, 'SIGTERM'))
    return true
  }
}

function createController(overrides = {}) {
  const child = new FakeChild()
  let controller
  const phasesAtSpawn = []
  controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => {
      phasesAtSpawn.push(controller.status.phase)
      return child
    },
    logStore: { append: async () => {} },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
    platform: 'linux',
    ...overrides,
  })
  return { controller, child, phasesAtSpawn }
}

test('the phase advances through every runtime lifecycle node', async () => {
  const { controller, child, phasesAtSpawn } = createController()

  const ready = controller.start()
  // Resolved before spawn asks for a process.
  assert.equal(phasesAtSpawn[0], STARTUP_PHASES.RUNTIME_SPAWN)
  // Once spawned, the only thing left is the ready signal.
  assert.equal(controller.status.phase, STARTUP_PHASES.RUNTIME_READY)

  child.stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await ready

  assert.equal(controller.status.state, 'ready')
  assert.equal(controller.status.phase, STARTUP_PHASES.READY)
})

test('status keeps every pre-existing field, so old consumers do not break', async () => {
  const { controller, child } = createController({ preferredPort: 43_124 })

  const ready = controller.start()
  child.stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await ready

  assert.equal(controller.status.state, 'ready')
  assert.equal(controller.status.url, 'http://127.0.0.1:43125/')
  assert.equal(controller.status.restartAttempt, 0)
  assert.equal(controller.status.error, undefined)
  // phase is additive: present for new consumers, ignorable for old ones
  assert.equal(controller.status.phase, STARTUP_PHASES.READY)
})

test('a ready-signal timeout is recorded as a timeout outcome, not a generic failure', async () => {
  let fireTimeout
  const { controller } = createController({
    schedule: (callback) => {
      fireTimeout = callback
      return 99
    },
    cancelSchedule: () => {},
  })

  const starting = controller.start()
  assert.equal(controller.status.phase, STARTUP_PHASES.RUNTIME_READY)

  fireTimeout()

  await assert.rejects(starting, /did not become ready/u)
  assert.equal(controller.status.state, 'crashed')
  assert.equal(controller.status.phase, STARTUP_PHASES.FAILED)

  const history = controller.getStartupPhases()
  const waiting = history.find((entry) => entry.phase === STARTUP_PHASES.RUNTIME_READY)
  assert.equal(waiting.outcome, 'timeout')
  assert.equal(history.at(-1).phase, STARTUP_PHASES.FAILED)
})

test('a runtime that exits before ready fails in the waiting phase', async () => {
  const { controller, child } = createController({
    schedule: () => 99,
    cancelSchedule: () => {},
  })

  const starting = controller.start()
  assert.equal(controller.status.phase, STARTUP_PHASES.RUNTIME_READY)

  // Attach the rejection assertion before triggering the exit, so the
  // promise is never momentarily unhandled.
  const rejected = assert.rejects(starting)
  child.exitCode = 1
  child.emit('exit', 1, null)

  await rejected
  assert.equal(controller.status.phase, STARTUP_PHASES.FAILED)

  const waiting = controller.getStartupPhases().find(
    (entry) => entry.phase === STARTUP_PHASES.RUNTIME_READY,
  )
  assert.equal(waiting.outcome, 'failed')
})

test('a spawn failure lands in the spawn phase', async () => {
  const { controller } = createController({
    spawnProcess: () => {
      throw new Error('spawn EACCES')
    },
    schedule: () => 99,
    cancelSchedule: () => {},
  })

  await assert.rejects(controller.start(), /EACCES/u)
  assert.equal(controller.status.phase, STARTUP_PHASES.FAILED)

  const spawn = controller.getStartupPhases().find(
    (entry) => entry.phase === STARTUP_PHASES.RUNTIME_SPAWN,
  )
  assert.equal(spawn.outcome, 'failed')
})

test('a preflight failure lands in the resolve phase', async () => {
  const { controller } = createController({
    preflight: () => {
      throw new Error('runtime integrity checksum mismatch')
    },
    schedule: () => 99,
    cancelSchedule: () => {},
  })

  await assert.rejects(controller.start(), /integrity/u)
  assert.equal(controller.status.phase, STARTUP_PHASES.FAILED)

  const resolve = controller.getStartupPhases().find(
    (entry) => entry.phase === STARTUP_PHASES.RUNTIME_RESOLVE,
  )
  assert.equal(resolve.outcome, 'failed')
})

test('a port conflict is classified separately from a timeout', async () => {
  const { controller, child } = createController({
    probeReady: async () => {
      throw new Error('connect EADDRINUSE 127.0.0.1:43125')
    },
  })

  const starting = controller.start()
  // The ready line arrives, but probing it fails with a port conflict: this
  // is a probe failure, not the startup timer firing.
  child.stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await assert.rejects(starting, /EADDRINUSE/u)
  assert.equal(controller.status.phase, STARTUP_PHASES.FAILED)

  const waiting = controller.getStartupPhases().find(
    (entry) => entry.phase === STARTUP_PHASES.RUNTIME_READY,
  )
  assert.equal(waiting.outcome, 'failed')
})

test('getStartupPhases stays safe to export: no tokens, paths or message text', async () => {
  const { controller, child } = createController()
  const ready = controller.start()
  child.stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await ready

  for (const entry of controller.getStartupPhases()) {
    assert.deepEqual(Object.keys(entry).sort(), ['durationMs', 'outcome', 'phase', 'startedAt'])
    assert.equal(typeof entry.phase, 'string')
    assert.equal(typeof entry.durationMs, 'number')
    assert.match(entry.startedAt, /^\d{4}-\d{2}-\d{2}T/u)
  }
})

test('a restart resets the phase history instead of appending to the old attempt', async () => {
  const { controller, child } = createController()
  const first = controller.start()
  child.stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await first

  const historyAfterFirst = controller.getStartupPhases()
  assert.ok(historyAfterFirst.length > 0)

  // start() short-circuits while the runtime is ready, so stop it first to
  // exercise a genuine second launch.
  await controller.forceStop()
  assert.equal(controller.status.state, 'stopped')

  // A fresh start() must not carry the previous attempt's phases forward.
  const child2 = new FakeChild()
  controller.spawnProcess = () => child2
  const second = controller.start()
  assert.equal(controller.status.state, 'starting')
  const historyAfterSecond = controller.getStartupPhases()
  assert.ok(
    historyAfterSecond.length < historyAfterFirst.length,
    'a new startup attempt must clear the previous phase history',
  )

  child2.stdout.write('dsh web: http://127.0.0.1:43126\r\n')
  await second
  assert.equal(controller.status.phase, STARTUP_PHASES.READY)
})
