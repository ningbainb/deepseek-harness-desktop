import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeStartupTiming } from '../src/runtime-startup-timing.mjs'

test('Runtime timing reports bounded fixed phases and independent monotonic durations', () => {
  const lines = []
  let clock = 180.2
  const mark = createRuntimeStartupTiming({ now: () => clock, emit: line => lines.push(line) })
  mark('entry')
  clock = 200.8
  mark('environment')
  mark('environment')
  mark('fixture-private-path')
  clock = 190
  mark('profile')
  clock = 210.8
  mark('patches')
  clock = 510.8
  mark('boot')
  clock = 520.8
  mark('ready')
  assert.deepEqual(lines, [
    '[runtime-startup] entry=180ms', '[runtime-startup] environment=21ms',
    '[runtime-startup] profile=0ms', '[runtime-startup] patches=10ms',
    '[runtime-startup] boot=300ms', '[runtime-startup] ready=10ms',
  ])
})

test('disabled timings leave dump-config output and clocks untouched', () => {
  const fail = () => { throw new Error('must not run') }
  const mark = createRuntimeStartupTiming({ enabled: false, now: fail, emit: fail })
  assert.doesNotThrow(() => mark('entry'))
})

test('invalid clocks and diagnostic sink failures cannot interrupt Runtime boot', () => {
  const lines = []
  const invalid = createRuntimeStartupTiming({ now: () => NaN, emit: line => lines.push(line) })
  invalid('entry')
  assert.deepEqual(lines, [])
  const badClock = createRuntimeStartupTiming({ now: () => { throw new Error('clock') } })
  const badSink = createRuntimeStartupTiming({ now: () => 1, emit: () => { throw new Error('sink') } })
  assert.doesNotThrow(() => badClock('entry'))
  assert.doesNotThrow(() => badSink('entry'))
})
