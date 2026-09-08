import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  attachedWindowBounds,
  createMainWindow,
  installAttachedWindowPlacement,
  secondaryWindowWebPreferences,
  SECONDARY_WINDOW_PARTITION,
} from '../src/window-factory.mjs'

class FakeWindow extends EventEmitter {
  destroyed = false

  constructor(bounds) {
    super()
    this.bounds = { ...bounds }
  }

  getBounds() { return { ...this.bounds } }

  setBounds(bounds) {
    this.bounds = { ...bounds }
    this.emit('move')
  }

  isDestroyed() { return this.destroyed }
}

test('primary and secondary window constructors preserve the hardened security contract', () => {
  const created = []
  function BrowserWindow(options) {
    created.push(options)
  }
  createMainWindow({
    BrowserWindow,
    appIcon: 'icon',
    productName: 'DSH',
    preload: 'main-preload.cjs',
    state: { width: 900, height: 700 },
  })
  const main = created[0]
  assert.equal(main.webPreferences.contextIsolation, true)
  assert.equal(main.webPreferences.sandbox, true)
  assert.equal(main.webPreferences.nodeIntegration, false)
  assert.equal(main.webPreferences.webSecurity, true)
  assert.equal(main.webPreferences.preload, 'main-preload.cjs')

  const secondary = secondaryWindowWebPreferences({ preload: 'secondary-preload.cjs' })
  assert.equal(secondary.partition, SECONDARY_WINDOW_PARTITION)
  assert.equal(secondary.contextIsolation, true)
  assert.equal(secondary.sandbox, true)
  assert.equal(secondary.nodeIntegration, false)
  assert.equal(secondary.webSecurity, true)
  assert.equal(secondary.preload, 'secondary-preload.cjs')
})

test('attached extension bounds prefer the parent side and never leave the display work area', () => {
  assert.deepEqual(
    attachedWindowBounds(
      { x: 100, y: 120, width: 700, height: 600 },
      { x: 0, y: 0, width: 300, height: 500 },
      { x: 0, y: 0, width: 1_400, height: 900 },
    ),
    { x: 812, y: 120, width: 300, height: 500 },
  )
  assert.deepEqual(
    attachedWindowBounds(
      { x: 1_100, y: -20, width: 280, height: 900 },
      { x: 0, y: 0, width: 500, height: 1_000 },
      { x: 0, y: 0, width: 1_400, height: 900 },
    ),
    { x: 588, y: 0, width: 500, height: 900 },
  )
})

test('extension placement follows parent changes, preserves manual movement, clamps displays, and cleans listeners', () => {
  const parent = new FakeWindow({ x: 100, y: 100, width: 600, height: 600 })
  const child = new FakeWindow({ x: 0, y: 0, width: 300, height: 500 })
  const screen = new EventEmitter()
  screen.getDisplayMatching = () => ({ workArea: { x: 0, y: 0, width: 1_400, height: 900 } })
  screen.getPrimaryDisplay = screen.getDisplayMatching

  const dispose = installAttachedWindowPlacement({ parentWindow: parent, childWindow: child, screen })
  assert.deepEqual(child.getBounds(), { x: 712, y: 100, width: 300, height: 500 })

  parent.bounds.x = 200
  parent.emit('move')
  assert.deepEqual(child.getBounds(), { x: 812, y: 100, width: 300, height: 500 })
  parent.bounds.width = 1_000
  parent.emit('maximize')
  assert.deepEqual(child.getBounds(), { x: 900, y: 100, width: 300, height: 500 })

  child.bounds = { x: 40, y: 60, width: 300, height: 500 }
  child.emit('move')
  parent.bounds.x = 50
  parent.emit('restore')
  assert.deepEqual(child.getBounds(), { x: 40, y: 60, width: 300, height: 500 })

  child.bounds = { x: 1_300, y: 850, width: 300, height: 500 }
  screen.emit('display-metrics-changed')
  assert.deepEqual(child.getBounds(), { x: 1_100, y: 400, width: 300, height: 500 })

  child.emit('closed')
  assert.equal(parent.listenerCount('move'), 0)
  assert.equal(parent.listenerCount('maximize'), 0)
  assert.equal(child.listenerCount('move'), 0)
  assert.equal(screen.listenerCount('display-metrics-changed'), 0)
  dispose()
})
