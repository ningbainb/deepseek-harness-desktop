import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import {
  STARTUP_OUTCOMES,
  STARTUP_PHASES,
  STARTUP_PHASE_LABELS,
  classifyStartupFailure,
  createStartupPhaseRecorder,
  isStartupPhase,
} from '../src/startup-phase.mjs'

/** A hand-driven clock so durations are asserted exactly, never by sleeping. */
function fakeClock(start = 1_000) {
  let current = start
  const clock = () => current
  clock.advance = (ms) => {
    current += ms
  }
  return clock
}

describe('phase vocabulary', () => {
  test('every phase has user-facing copy', () => {
    for (const phase of Object.values(STARTUP_PHASES)) {
      assert.equal(typeof STARTUP_PHASE_LABELS[phase], 'string', `missing label for ${phase}`)
      assert.ok(STARTUP_PHASE_LABELS[phase].length > 0, `empty label for ${phase}`)
    }
  })

  test('labels contain no emoji', () => {
    // AGENTS.md forbids emoji across the repository, UI copy included.
    const emoji = /\p{Extended_Pictographic}/u
    for (const label of Object.values(STARTUP_PHASE_LABELS)) {
      assert.equal(emoji.test(label), false, `emoji in label: ${label}`)
    }
  })

  test('isStartupPhase rejects unknown values', () => {
    assert.equal(isStartupPhase(STARTUP_PHASES.RUNTIME_SPAWN), true)
    assert.equal(isStartupPhase('not-a-phase'), false)
    assert.equal(isStartupPhase(undefined), false)
    assert.equal(isStartupPhase(42), false)
  })
})

describe('classifyStartupFailure', () => {
  test('recognises the ready-signal timeout', () => {
    const error = new Error('DSH runtime did not become ready within 120000ms')
    assert.equal(classifyStartupFailure(error), 'startup-timeout')
  })

  test('recognises a port conflict', () => {
    assert.equal(classifyStartupFailure(new Error('listen EADDRINUSE: address already in use')), 'port-conflict')
  })

  test('recognises a permission failure', () => {
    assert.equal(classifyStartupFailure(new Error('spawn EACCES')), 'permission')
  })

  test('recognises an integrity failure', () => {
    assert.equal(classifyStartupFailure(new Error('runtime integrity checksum mismatch')), 'integrity')
  })

  test('falls back to unknown rather than guessing', () => {
    assert.equal(classifyStartupFailure(new Error('something else entirely')), 'unknown')
    assert.equal(classifyStartupFailure(undefined), 'unknown')
  })
})

describe('createStartupPhaseRecorder', () => {
  test('records a completed phase with its real duration', () => {
    const clock = fakeClock()
    const recorder = createStartupPhaseRecorder({ now: clock })
    recorder.enter(STARTUP_PHASES.RUNTIME_SPAWN)
    clock.advance(302)
    recorder.complete(STARTUP_PHASES.RUNTIME_SPAWN)

    assert.deepEqual(recorder.history(), [{
      phase: 'runtime-spawn',
      startedAt: new Date(1_000).toISOString(),
      durationMs: 302,
      outcome: 'ok',
    }])
  })

  test('reports the open phase as pending with a live duration', () => {
    const clock = fakeClock()
    const recorder = createStartupPhaseRecorder({ now: clock })
    recorder.enter(STARTUP_PHASES.RUNTIME_READY)
    clock.advance(34_000)

    assert.equal(recorder.current(), STARTUP_PHASES.RUNTIME_READY)
    assert.equal(recorder.currentElapsedMs(), 34_000)
    assert.deepEqual(recorder.history(), [{
      phase: 'runtime-ready',
      startedAt: new Date(1_000).toISOString(),
      durationMs: 34_000,
      outcome: STARTUP_OUTCOMES.PENDING,
    }])
  })

  test('a timeout closes the open phase with the timeout outcome', () => {
    const clock = fakeClock()
    const recorder = createStartupPhaseRecorder({ now: clock })
    recorder.enter(STARTUP_PHASES.RUNTIME_READY)
    clock.advance(120_000)
    recorder.complete(STARTUP_PHASES.RUNTIME_READY, STARTUP_OUTCOMES.TIMEOUT)
    recorder.enter(STARTUP_PHASES.FAILED)

    assert.equal(recorder.current(), STARTUP_PHASES.FAILED)
    assert.equal(recorder.history()[0].outcome, STARTUP_OUTCOMES.TIMEOUT)
    assert.equal(recorder.history()[0].durationMs, 120_000)
  })

  test('re-entering the same phase does not create a duplicate entry', () => {
    const clock = fakeClock()
    const recorder = createStartupPhaseRecorder({ now: clock })
    recorder.enter(STARTUP_PHASES.PROFILE)
    clock.advance(10)
    recorder.enter(STARTUP_PHASES.PROFILE)
    clock.advance(10)
    recorder.complete(STARTUP_PHASES.PROFILE)

    assert.equal(recorder.history().length, 1)
    // Duration is measured from the FIRST enter, not the last.
    assert.equal(recorder.history()[0].durationMs, 20)
  })

  test('ignores unknown phases instead of corrupting the history', () => {
    const recorder = createStartupPhaseRecorder({ now: fakeClock() })
    recorder.enter('nope')
    recorder.complete('nope')
    assert.deepEqual(recorder.history(), [])
    assert.equal(recorder.current(), undefined)
  })

  test('completing a phase that was never entered is a no-op', () => {
    const recorder = createStartupPhaseRecorder({ now: fakeClock() })
    recorder.complete(STARTUP_PHASES.REPAIR)
    assert.deepEqual(recorder.history(), [])
  })

  test('bounds the history so a restart loop cannot grow without limit', () => {
    const clock = fakeClock()
    const recorder = createStartupPhaseRecorder({ now: clock, maxEntries: 3 })
    for (let index = 0; index < 10; index += 1) {
      recorder.enter(STARTUP_PHASES.RUNTIME_RESOLVE)
      clock.advance(1)
      recorder.complete(STARTUP_PHASES.RUNTIME_RESOLVE)
    }
    assert.equal(recorder.history().length, 3)
  })

  test('reset clears both closed entries and the open phase', () => {
    const clock = fakeClock()
    const recorder = createStartupPhaseRecorder({ now: clock })
    recorder.enter(STARTUP_PHASES.SHELL)
    recorder.complete(STARTUP_PHASES.SHELL)
    recorder.enter(STARTUP_PHASES.PROFILE)
    recorder.reset()

    assert.deepEqual(recorder.history(), [])
    assert.equal(recorder.current(), undefined)
    assert.equal(recorder.currentElapsedMs(), 0)
  })

  test('currentElapsedMs is zero when no phase is open', () => {
    const recorder = createStartupPhaseRecorder({ now: fakeClock() })
    assert.equal(recorder.currentElapsedMs(), 0)
  })

  test('history never carries credentials, paths or message text', () => {
    const clock = fakeClock()
    const recorder = createStartupPhaseRecorder({ now: clock })
    recorder.enter(STARTUP_PHASES.RUNTIME_READY)
    clock.advance(5)
    for (const entry of recorder.history()) {
      assert.deepEqual(Object.keys(entry).sort(), ['durationMs', 'outcome', 'phase', 'startedAt'])
    }
  })

  test('rejects a non-function clock', () => {
    assert.throws(() => createStartupPhaseRecorder({ now: 42 }), TypeError)
  })
})
