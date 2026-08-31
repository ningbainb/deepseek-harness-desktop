import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMainWindow,
  secondaryWindowWebPreferences,
  SECONDARY_WINDOW_PARTITION,
} from '../src/window-factory.mjs'

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
