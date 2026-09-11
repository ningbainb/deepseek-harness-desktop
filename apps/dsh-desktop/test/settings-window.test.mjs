import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'

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
  assert.equal(typeof listeners.get('dom-ready'), 'function')
  assert.equal(typeof listeners.get('did-start-navigation'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
  assert.equal(listeners.size, 0)
})

const settled = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const calls = []
  const webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    insertCSS: async () => { calls.push('css') },
    mainFrame: { isDestroyed: () => false, executeJavaScript: async () => { calls.push('frame'); return true } },
    executeJavaScript: async () => { throw new Error('must use the DOM-ready main frame') },
  })
  return { calls, webContents }
}

test('DOM readiness uses the main frame and load completion does not reinstall an active controller', async () => {
  const { calls, webContents } = fixture()
  const dispose = installSettingsWindow({ browserWindow: { webContents } })
  webContents.emit('dom-ready')
  webContents.emit('did-finish-load')
  await settled()
  webContents.emit('did-finish-load')
  await settled()
  assert.deepEqual(calls, ['css', 'frame'])
  webContents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
  webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
  webContents.emit('did-finish-load')
  await settled()
  assert.deepEqual(calls, ['css', 'frame'])
  webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
  webContents.emit('dom-ready')
  await settled()
  assert.deepEqual(calls, ['css', 'frame', 'css', 'frame'])
  dispose()
})

test('navigation cancels stale CSS completion before it can mount into the next document', async () => {
  const { calls, webContents } = fixture()
  let completeCss
  webContents.insertCSS = () => new Promise(resolve => { completeCss = resolve })
  const dispose = installSettingsWindow({ browserWindow: { webContents } })
  webContents.emit('dom-ready')
  webContents.emit('did-start-navigation', {}, 'http://localhost/next', false, true)
  completeCss()
  await settled()
  assert.deepEqual(calls, [])
  webContents.emit('dom-ready')
  completeCss()
  await settled()
  assert.deepEqual(calls, ['frame'])
  dispose()
})

test('disposal cancels a pending controller and removes every lifecycle listener', async () => {
  const { calls, webContents } = fixture()
  let completeCss
  webContents.insertCSS = () => new Promise(resolve => { completeCss = resolve })
  const dispose = installSettingsWindow({ browserWindow: { webContents } })
  webContents.emit('dom-ready')
  dispose()
  completeCss()
  await settled()
  assert.deepEqual(calls, [])
  assert.equal(webContents.eventNames().length, 0)
})

test('load event retries an unavailable DOM-ready API without polling or suppressing errors', async () => {
  const { webContents } = fixture()
  const failures = []
  let attempts = 0
  webContents.mainFrame.executeJavaScript = async () => {
    attempts++
    if (attempts === 1) throw new Error('fixture document context not ready')
    return true
  }
  const dispose = installSettingsWindow({ browserWindow: { webContents }, onError: error => failures.push(error.message) })
  webContents.emit('dom-ready')
  webContents.emit('did-finish-load')
  await settled()
  assert.equal(attempts, 2)
  assert.deepEqual(failures, ['fixture document context not ready'])
  webContents.emit('did-finish-load')
  await settled()
  assert.equal(attempts, 2)
  dispose()
})
