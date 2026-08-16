import assert from 'node:assert/strict'
import test from 'node:test'

import {
  installRendererPermissions,
  isAllowedRendererPermission,
} from '../src/renderer-permissions.mjs'

const ACTIVE_ORIGIN = 'http://127.0.0.1:43125'

test('only sanitized clipboard writes from the active loopback runtime are allowed', () => {
  assert.equal(isAllowedRendererPermission({
    permission: 'clipboard-sanitized-write',
    requestingUrl: `${ACTIVE_ORIGIN}/workspace/code`,
    activeOrigin: ACTIVE_ORIGIN,
  }), true)
  for (const permission of ['clipboard-read', 'media', 'notifications', 'openExternal']) {
    assert.equal(isAllowedRendererPermission({ permission, requestingUrl: ACTIVE_ORIGIN, activeOrigin: ACTIVE_ORIGIN }), false)
  }
  for (const requestingUrl of [
    'http://127.0.0.1:43126/',
    'https://example.com/',
    'file:///startup.html',
    'not a url',
  ]) {
    assert.equal(isAllowedRendererPermission({
      permission: 'clipboard-sanitized-write',
      requestingUrl,
      activeOrigin: ACTIVE_ORIGIN,
    }), false)
  }
})

test('permission handlers read the current runtime origin and deny by default', () => {
  let checkHandler
  let requestHandler
  let activeOrigin = ACTIVE_ORIGIN
  const session = {
    setPermissionCheckHandler: (handler) => { checkHandler = handler },
    setPermissionRequestHandler: (handler) => { requestHandler = handler },
  }
  installRendererPermissions({ session, getActiveOrigin: () => activeOrigin })
  assert.equal(checkHandler(null, 'clipboard-sanitized-write', `${ACTIVE_ORIGIN}/`, {}), true)
  assert.equal(checkHandler(null, 'clipboard-read', `${ACTIVE_ORIGIN}/`, {}), false)

  let granted
  requestHandler({ getURL: () => `${ACTIVE_ORIGIN}/chat` }, 'clipboard-sanitized-write', (value) => { granted = value }, {})
  assert.equal(granted, true)
  activeOrigin = undefined
  requestHandler({ getURL: () => `${ACTIVE_ORIGIN}/chat` }, 'clipboard-sanitized-write', (value) => { granted = value }, {})
  assert.equal(granted, false)
})
