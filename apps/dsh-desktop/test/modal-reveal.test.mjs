import assert from 'node:assert/strict'
import test from 'node:test'
import { deferModalReveal } from '../src/modal-reveal.mjs'

function fixture(claim = async () => true) {
  const timers = new Map(), frames = new Map(), events = new Map()
  let next = 0, shown = 0, claims = 0, disconnected = false, mutate
  const root = { isConnected: true, contains: dialog => dialog.ours === true }
  const document = { visibilityState: 'visible', body: {}, dialogs: [],
    querySelectorAll: () => document.dialogs, addEventListener: (key, value) => events.set(key, value),
    removeEventListener: key => events.delete(key) }
  const window = { setTimeout: callback => { timers.set(++next, callback); return next }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { frames.set(++next, callback); return next }, cancelAnimationFrame: id => frames.delete(id),
    addEventListener: document.addEventListener, removeEventListener: document.removeEventListener,
    getComputedStyle: dialog => ({ display: dialog.display ?? 'block', visibility: 'visible' }),
    MutationObserver: class { constructor(callback) { mutate = callback } observe() {} disconnect() { disconnected = true } } }
  const failures = []
  const dispose = deferModalReveal({ root, document, window, delayMs: 1100, claim: async () => { claims++; return claim() },
    reveal: () => { shown++ }, onError: error => failures.push(error) })
  const flushFrame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()) }
  const fireTimer = async () => { const pending = [...timers.values()]; timers.clear(); await Promise.all(pending.map(callback => callback())) }
  const dialog = (extra = {}) => ({ closest: () => null, getBoundingClientRect: () => ({ width: 300, height: 200 }), ...extra })
  return { root, document, timers, frames, events, dispose, failures, flushFrame, fireTimer, dialog,
    mutate: () => mutate(), state: () => ({ shown, claims, disconnected }) }
}

test('optional prompt waits for an existing dialog without claiming or stealing focus', async () => {
  const f = fixture()
  f.document.dialogs = [f.dialog()]
  f.flushFrame()
  assert.equal(f.timers.size, 0)
  assert.equal(f.state().claims, 0)
  f.document.dialogs = []
  f.mutate(); f.mutate(); f.mutate()
  assert.equal(f.frames.size, 1)
  f.flushFrame()
  await f.fireTimer()
  assert.deepEqual(f.state(), { shown: 1, claims: 1, disconnected: true })
  assert.equal(f.events.size, 0)
})

test('a dialog arriving during the delay cancels the pending reveal', async () => {
  const f = fixture()
  f.flushFrame()
  assert.equal(f.timers.size, 1)
  f.document.dialogs = [f.dialog()]
  f.mutate(); f.flushFrame()
  assert.equal(f.timers.size, 0)
  await f.fireTimer()
  assert.equal(f.state().shown, 0)
  f.dispose()
})

test('a dialog appearing during an async claim defers the reveal without a second claim', async () => {
  let resolveClaim
  const f = fixture(() => new Promise(resolve => { resolveClaim = resolve }))
  f.flushFrame()
  const pending = f.fireTimer()
  f.document.dialogs = [f.dialog()]
  resolveClaim(true)
  await pending
  assert.equal(f.state().shown, 0)
  f.document.dialogs = []; f.mutate(); f.flushFrame(); await f.fireTimer()
  assert.deepEqual(f.state(), { shown: 1, claims: 1, disconnected: true })
})

test('hidden dialogs and its own panel do not indefinitely block the optional prompt', async () => {
  const f = fixture()
  f.document.dialogs = [f.dialog({ ours: true }), f.dialog({ display: 'none' }), f.dialog({ closest: () => ({}) })]
  f.flushFrame(); await f.fireTimer()
  assert.equal(f.state().shown, 1)
})

test('navigation cancels an outstanding claim without a late reveal', async () => {
  let resolveClaim
  const f = fixture(() => new Promise(resolve => { resolveClaim = resolve }))
  f.flushFrame()
  const pending = f.fireTimer()
  f.events.get('pagehide')()
  resolveClaim(true)
  await pending
  assert.deepEqual(f.state(), { shown: 0, claims: 1, disconnected: true })
  assert.equal(f.events.size, 0)
})

test('page hiding, removal, refusal, errors and disposal retain bounded lifecycle ownership', async () => {
  for (const mode of ['hidden', 'removed', 'refused', 'error', 'disposed']) {
    const failure = new Error('claim failed')
    const f = fixture(async () => { if (mode === 'error') throw failure; return mode !== 'refused' })
    if (mode === 'hidden') f.document.visibilityState = 'hidden'
    if (mode === 'removed') f.root.isConnected = false
    if (mode === 'disposed') f.dispose()
    f.flushFrame(); await f.fireTimer()
    assert.equal(f.state().shown, 0)
    if (mode === 'error') assert.deepEqual(f.failures, [failure])
    f.dispose()
    assert.equal(f.events.size, 0)
    assert.equal(f.frames.size + f.timers.size, 0)
  }
})
