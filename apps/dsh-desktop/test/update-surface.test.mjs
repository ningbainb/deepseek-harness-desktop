import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyUpdateSurface,
  createUpdateSurfaceScript,
  installUpdateSurface,
  UPDATE_SURFACE_CSS,
} from '../src/update-surface.mjs'

test('update surface is an accessible glass dialog driven by desktop update state', () => {
  const script = createUpdateSurfaceScript()
  assert.match(UPDATE_SURFACE_CSS, /backdrop-filter: blur\(32px\)/)
  assert.match(script, /role', 'dialog'/)
  assert.match(script, /aria-modal', 'true'/)
  assert.match(script, /getUpdateStatus/)
  assert.match(script, /onUpdateStatus/)
  assert.match(script, /installUpdate/)
  assert.match(script, /稍后/)
  assert.match(script, /重启并安装/)
})

test('update surface applies CSS before mounting and follows navigation', async () => {
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
  assert.equal(await applyUpdateSurface({ webContents }), true)
  assert.deepEqual(calls.map((entry) => entry[0]), ['css', 'script'])
  assert.deepEqual(calls[0][2], { cssOrigin: 'author' })
  assert.equal(calls[1][2], true)

  const dispose = installUpdateSurface({ browserWindow: { webContents } })
  assert.equal(typeof listeners.get('did-finish-load'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
})
