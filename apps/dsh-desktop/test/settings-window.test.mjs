import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applySettingsWindow,
  createSettingsWindowScript,
  installSettingsWindow,
  SETTINGS_WINDOW_CSS,
} from '../src/settings-window.mjs'

test('settings controller scopes movement and eight-way resizing to the upstream settings dialog', () => {
  const script = createSettingsWindowScript()
  assert.match(script, /data-slot="settings\.header"/u)
  assert.match(script, /getSettingsWindowBounds/u)
  assert.match(script, /setSettingsWindowBounds/u)
  assert.match(script, /pointerdown/u)
  assert.match(script, /pointermove/u)
  assert.match(script, /pointerup/u)
  for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    assert.match(script, new RegExp(`['"]${edge}['"]`, 'u'))
  }
  assert.match(SETTINGS_WINDOW_CSS, /min\(520px/u)
  assert.match(SETTINGS_WINDOW_CSS, /min\(360px/u)
  assert.match(SETTINGS_WINDOW_CSS, /container-type:\s*inline-size/u)
  assert.match(SETTINGS_WINDOW_CSS, /overflow:\s*auto/u)
  assert.match(SETTINGS_WINDOW_CSS, /scrollbar-gutter:\s*stable/u)
  assert.match(script, /layer\.append\(handle\)/u)
  assert.match(script, /positionResizeHandles/u)
  assert.doesNotMatch(SETTINGS_WINDOW_CSS, /data-dsh-settings-resize="e"\]\s*\{\s*right:\s*2px/u)
})

test('settings controller applies CSS before mounting and follows navigation', async () => {
  const calls = []
  const listeners = new Map()
  const webContents = {
    isDestroyed: () => false,
    insertCSS: async (css, options) => calls.push(['css', css, options]),
    executeJavaScript: async (script, userGesture) => {
      calls.push(['script', script, userGesture])
      return true
    },
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
  }
  assert.equal(await applySettingsWindow({ webContents }), true)
  assert.deepEqual(calls.map((entry) => entry[0]), ['css', 'script'])
  assert.deepEqual(calls[0][2], { cssOrigin: 'author' })

  const dispose = installSettingsWindow({ browserWindow: { webContents } })
  assert.equal(typeof listeners.get('did-finish-load'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
})
