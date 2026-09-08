import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { setTimeout as wait } from 'node:timers/promises'
import { installWindowMotion } from '../src/window-motion.mjs'

test('native moves publish only start/end and restore effects on close', async () => {
  const window = new EventEmitter(), states = []
  installWindowMotion(window, active => states.push(active), { delay: 5 })
  for (let i = 0; i < 100; i++) window.emit('will-move')
  assert.deepEqual(states, [true])
  await wait(20)
  assert.deepEqual(states, [true, false])
  window.emit('will-resize'); window.emit('closed')
  assert.deepEqual(states, [true, false, true, false])
  assert.equal(window.listenerCount('will-move'), 0)
})
