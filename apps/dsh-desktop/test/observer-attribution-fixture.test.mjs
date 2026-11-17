import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { installObserverAttribution } from '../scripts/observer-attribution-fixture.mjs'

test('observer diagnostics preserve native construction, callback identity arguments, reads and thrown exceptions', () => {
  let reads = 0
  class Element {
    getBoundingClientRect() { reads++; return this.result }
    getClientRects() { reads++; throw this.error }
  }
  class NativeObserver {
    constructor(callback) { if (typeof callback !== 'function') throw new TypeError('callback'); this.callback = callback }
    observe() { return 'native-observe' }
    fire(records) { return this.callback.call(this, records, this) }
  }
  const context = vm.createContext({ Element, MutationObserver: NativeObserver,
    getComputedStyle(element) { reads++; return element.result }, performance, structuredClone })
  vm.runInContext(`(${installObserverAttribution.toString()})()`, context)
  const Observer = context.MutationObserver
  assert.equal(Observer.prototype, NativeObserver.prototype)
  assert.throws(() => Observer(() => {}), TypeError)
  assert.throws(() => new Observer(null), TypeError)
  const element = new Element(), error = new Error('native read failure'), mutations = [{ type: 'childList' }]
  element.result = { width: 1 }; element.error = error
  let observer
  observer = new Observer(function(records, actualObserver) {
    assert.equal(this, observer); assert.equal(actualObserver, observer); assert.equal(records, mutations)
    assert.equal(element.getBoundingClientRect(), element.result)
    assert.equal(context.getComputedStyle(element), element.result)
    element.getClientRects()
  })
  assert.ok(observer instanceof Observer); assert.ok(observer instanceof NativeObserver)
  assert.equal(observer.observe(), 'native-observe')
  assert.throws(() => observer.fire(mutations), value => value === error)
  assert.equal(reads, 3, 'diagnostics add no layout reads')
  element.getBoundingClientRect()
  const record = context.betaObserverAttribution.snapshot().observers[0]
  assert.equal(record.calls, 1)
  assert.match(record.stack, /MutationObserver construction/u)
  for (const key of ['getBoundingClientRect', 'getClientRects', 'getComputedStyle']) assert.equal(record.layoutReads[key].calls, 1)
  assert.equal(reads, 4, 'outside reads remain unattributed after a callback throws')
})
