import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { CONVERSATION_RENDERING_CSS, CONVERSATION_RENDERING_SCRIPT } from '../src/conversation-rendering.mjs'

function fixture() {
  let now = 0, serial = 0, contentTop = 1000, busy = false, rowPresent = true
  const frames = new Map(), timers = new Map(), listeners = new Map(), windowListeners = new Map(), observers = []
  const add = map => (name, fn) => { const set = map.get(name) ?? new Set(); set.add(fn); map.set(name, set) }
  const remove = map => (name, fn) => map.get(name)?.delete(fn)
  const row = { getBoundingClientRect: () => ({ top: contentTop - scroll.scrollTop }) }
  const scroll = { isConnected: true, scrollTop: 0, scrollHeight: 5000, clientHeight: 500,
    querySelector: () => rowPresent ? row : null, getBoundingClientRect: () => ({ top: 0 }) }
  const button = { isConnected: true, getAttribute: name => name === 'aria-label' ? 'Jump to turn 349' : name === 'aria-busy' && busy ? 'true' : null,
    getBoundingClientRect: () => ({ top: 25, height: 10 }), closest: selector => selector === 'button' ? button : nav }
  const nav = { getAttribute: () => 'Turn navigation', querySelectorAll: () => [button], closest: selector => selector === 'button' ? null : selector.endsWith(' nav') ? nav : scroll }
  const context = {
    performance: { now: () => now },
    document: { addEventListener: add(listeners), removeEventListener: remove(listeners), querySelectorAll: () => [] },
    addEventListener: add(windowListeners), removeEventListener: remove(windowListeners),
    requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id },
    clearTimeout: id => timers.delete(id),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; this.active = true; observers.push(this) }
      observe() {}
      disconnect() { this.active = false }
    },
  }
  const install = () => runInNewContext(CONVERSATION_RENDERING_SCRIPT, context)
  const dispatch = (name, event = {}) => { for (const fn of [...(listeners.get(name) ?? [])]) fn(event) }
  const click = () => dispatch('click', { target: button, detail: 0 })
  const tick = ms => {
    now += ms
    for (const [id, timer] of [...timers]) if (now >= timer.at) { timers.delete(id); timer.fn() }
    for (const [id, fn] of [...frames]) { frames.delete(id); fn() }
  }
  return { install, click, dispatch, tick, scroll, button, nav, row, frames, timers, listeners,
    allObservers: observers, get observers() { return observers.slice(1) },
    setBusy: value => { busy = value }, setRowPresent: value => { rowPresent = value }, setTop: value => { contentTop = value },
    notify: () => observers.filter(item => item.active).forEach(item => item.fn()),
    hide: () => windowListeners.get('pagehide').forEach(fn => fn()),
    dispose: () => context.dshConversationRenderingController.dispose() }
}

test('offscreen rendering retains DOM semantics, hidden rows, and full print output', () => {
  assert.match(CONVERSATION_RENDERING_CSS, /:not\(\[hidden\]\):not\(:empty\)/u)
  assert.match(CONVERSATION_RENDERING_CSS, /\[data-chat-flow\]\[data-dsh-long-chat-flow\]/u)
  assert.doesNotMatch(CONVERSATION_RENDERING_CSS, /:has|nth-child/u)
  assert.match(CONVERSATION_RENDERING_CSS, /content-visibility: auto/u)
  assert.match(CONVERSATION_RENDERING_CSS, /@media print[^]*content-visibility: visible/u)
  assert.doesNotMatch(CONVERSATION_RENDERING_CSS, /display:\s*none|content-visibility:\s*hidden/u)
})
test('idle and repeated installation have one listener and no polling', () => {
  const f = fixture(); f.install(); f.install()
  assert.equal(f.listeners.get('click').size, 1)
  assert.equal(f.allObservers.filter(item => item.active).length, 1)
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0)
  f.dispose(); assert.equal(f.listeners.get('click').size, 0)
  assert.equal(f.allObservers.filter(item => item.active).length, 0)
})
test('missing history waits on native changes, then corrects newly realized heights', () => {
  const f = fixture(); f.install(); f.setBusy(true); f.setRowPresent(false); f.click(); f.tick(16)
  assert.equal(f.frames.size, 0); assert.equal(f.scroll.scrollTop, 0)
  f.setBusy(false); f.setRowPresent(true); f.notify(); f.tick(16)
  assert.equal(f.scroll.scrollTop, 976)
  f.setTop(2300); f.tick(16); assert.equal(f.scroll.scrollTop, 2276)
  f.tick(16); f.tick(501)
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.observers[0].active, false)
})
for (const name of ['wheel', 'pointerdown', 'keydown']) test(`reader ${name} immediately cancels pending corrections`, () => {
  const f = fixture(); f.install(); f.click(); f.dispatch(name); f.tick(16)
  assert.equal(f.scroll.scrollTop, 0); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0)
  assert.equal(f.observers[0].active, false)
})
test('missing target has a hard deadline and page hiding releases pending work', () => {
  const f = fixture(); f.install(); f.setRowPresent(false); f.click(); f.tick(16); f.tick(60000)
  assert.equal(f.observers[0].active, false); assert.equal(f.timers.size, 0)
  f.click(); f.hide(); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0)
})
test('removed conversation and disposal cannot scroll a replacement document', () => {
  const f = fixture(); f.install(); f.click(); f.scroll.isConnected = false; f.tick(16)
  assert.equal(f.scroll.scrollTop, 0); assert.equal(f.observers[0].active, false)
  f.scroll.isConnected = true; f.click(); f.dispose(); f.tick(16); assert.equal(f.scroll.scrollTop, 0)
})
test('only the native turn rail is eligible and its handler is not intercepted', () => {
  const f = fixture(); f.install(); f.nav.getAttribute = () => 'Other navigation'; f.click()
  assert.equal(f.observers.length, 0)
  f.nav.getAttribute = () => '轮次导航'; f.button.getAttribute = name => name === 'aria-label' ? '加载并跳转到第 1 轮' : null
  f.click(); f.tick(16); assert.equal(f.scroll.scrollTop, 976)
})
test('pointer clicks on the native rail resolve the actual mark geometry', () => {
  const f = fixture(); f.install()
  f.dispatch('click', { target: f.nav, detail: 1, clientY: 30 })
  f.tick(16); assert.equal(f.scroll.scrollTop, 976)
})
test('bottom targets are clamped and continuously changing layout cannot retain ownership', () => {
  const f = fixture(); f.install(); f.setTop(10000); f.click(); f.tick(16)
  assert.equal(f.scroll.scrollTop, 4500)
  for (let index = 0; index < 8; index++) { f.setTop(1000 + index * 200); f.tick(400) }
  assert.equal(f.observers[0].active, false); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0)
})
test('long-flow eligibility is counted once per batch and removed when the session empties', () => {
  const f = fixture(); f.install()
  let enabled = false, writes = 0
  const flow = { isConnected: true, childElementCount: 201,
    hasAttribute: () => enabled, toggleAttribute: (_name, value) => { enabled = value; writes++ } }
  const record = { target: { closest: () => flow }, addedNodes: [] }
  f.allObservers[0].fn([record, record]); assert.equal(enabled, true); assert.equal(writes, 1)
  f.allObservers[0].fn([record]); assert.equal(writes, 1)
  flow.childElementCount = 40; f.allObservers[0].fn([record]); assert.equal(enabled, false); assert.equal(writes, 2)
})
