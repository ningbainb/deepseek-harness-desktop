import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DESKTOP_MIGRATION_PROBE_QUERY,
  createMigrationProbeUrl,
  denyMigrationProbePermissions,
  installMigrationProbeContentSecurityPolicy,
  installMigrationProbeNavigationPolicy,
} from '../src/migration-probe.mjs'

test('migration probe uses one exact loopback URL and rejects non-loopback origins', () => {
  const probe = createMigrationProbeUrl('http://127.0.0.1:43125/?existing=value')
  const parsed = new URL(probe)
  assert.equal(parsed.searchParams.get('existing'), 'value')
  assert.equal(parsed.searchParams.get(DESKTOP_MIGRATION_PROBE_QUERY), '1')
  assert.throws(() => createMigrationProbeUrl('https://example.com/'), /non-loopback/u)
})

test('migration probe blocks navigation, popups, webviews, permissions, and page scripts', () => {
  const handlers = new Map()
  let windowOpenHandler
  const webContents = {
    id: 42,
    on: (event, handler) => handlers.set(event, handler),
    removeListener: (event) => handlers.delete(event),
    setWindowOpenHandler: (handler) => { windowOpenHandler = handler },
  }
  const headerHandlers = []
  let checkHandler
  let requestHandler
  const session = {
    webRequest: {
      onHeadersReceived: (handler) => headerHandlers.push(handler),
    },
    setPermissionCheckHandler: (handler) => { checkHandler = handler },
    setPermissionRequestHandler: (handler) => { requestHandler = handler },
  }
  const probeUrl = createMigrationProbeUrl('http://127.0.0.1:43125/')
  const removeNavigation = installMigrationProbeNavigationPolicy({ webContents, probeUrl })
  const removeCsp = installMigrationProbeContentSecurityPolicy({ session, webContents })
  denyMigrationProbePermissions(session)

  const deniedNavigation = { prevented: false, preventDefault() { this.prevented = true } }
  handlers.get('will-navigate')(deniedNavigation, 'https://example.com/')
  assert.equal(deniedNavigation.prevented, true)
  const initialNavigation = { prevented: false, preventDefault() { this.prevented = true } }
  handlers.get('will-navigate')(initialNavigation, probeUrl)
  assert.equal(initialNavigation.prevented, false)
  const webview = { prevented: false, preventDefault() { this.prevented = true } }
  handlers.get('will-attach-webview')(webview)
  assert.equal(webview.prevented, true)
  assert.deepEqual(windowOpenHandler({ url: 'http://127.0.0.1:43125/' }), { action: 'deny' })

  let otherHeaders
  headerHandlers[0]({ webContentsId: 1, resourceType: 'mainFrame' }, (value) => { otherHeaders = value })
  assert.deepEqual(otherHeaders, {})
  let probeHeaders
  headerHandlers[0]({
    webContentsId: 42,
    resourceType: 'mainFrame',
    responseHeaders: { 'content-security-policy': ['default-src *'], Server: ['test'] },
  }, (value) => { probeHeaders = value })
  assert.match(probeHeaders.responseHeaders['Content-Security-Policy'][0], /script-src 'none'/u)
  assert.equal(probeHeaders.responseHeaders['content-security-policy'], undefined)

  assert.equal(checkHandler({}, 'clipboard-sanitized-write', 'http://127.0.0.1:43125/'), false)
  let granted
  requestHandler({}, 'notifications', (value) => { granted = value })
  assert.equal(granted, false)

  removeNavigation()
  removeCsp()
  assert.equal(handlers.size, 0)
  assert.equal(headerHandlers.at(-1), null)
})
