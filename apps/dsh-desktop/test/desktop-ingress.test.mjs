import assert from 'node:assert/strict'
import test from 'node:test'

import { createDesktopIngress, desktopDeepLinkFrom } from '../src/desktop-ingress.mjs'

function createFakeApp() {
  const listeners = new Map()
  return {
    on(event, listener) {
      listeners.set(event, listener)
    },
    emit(event, ...args) {
      return listeners.get(event)?.(...args)
    },
    listener(event) {
      return listeners.get(event)
    },
  }
}

function createMainWindow() {
  return {
    minimized: true,
    shown: 0,
    focused: 0,
    restored: 0,
    isDestroyed: () => false,
    isMinimized() { return this.minimized },
    restore() { this.minimized = false; this.restored += 1 },
    show() { this.shown += 1 },
    focus() { this.focused += 1 },
  }
}

test('desktopDeepLinkFrom accepts only bounded allowlisted deep links', () => {
  assert.equal(desktopDeepLinkFrom(['desktop.exe', 'dsh://session/abc-1']), 'dsh://session/abc-1')
  assert.equal(desktopDeepLinkFrom(['desktop.exe', 'https://example.com']), undefined)
  assert.equal(desktopDeepLinkFrom(['desktop.exe', `dsh://${'a'.repeat(4_100)}`]), undefined)
})
test('desktop ingress queues initial links and preset files until dispatchers are installed', async () => {
  const app = createFakeApp()
  const mainWindow = createMainWindow()
  const links = []
  const presets = []
  const ingress = createDesktopIngress({
    app,
    initialCommandLine: ['desktop.exe', 'dsh://task/start', 'C:\\tmp\\first.dshpreset'],
    getMainWindow: () => mainWindow,
  })

  assert.equal(ingress.launchDetail, 'deep-link')
  assert.deepEqual(ingress.pendingPresetFiles, ['C:\\tmp\\first.dshpreset'])
  ingress.setDispatchers({
    deepLink: (link) => { links.push(link.href) },
    presetFile: async (path) => { presets.push(path) },
  })
  ingress.deepLinkRouter.setReady(true)
  await ingress.deepLinkRouter.idle()
  assert.deepEqual(links, ['dsh://task/start'])
  assert.deepEqual(presets, ['C:\\tmp\\first.dshpreset'])
  assert.deepEqual(ingress.pendingPresetFiles, [])
})

test('second-instance separates update shutdown from normal ingress and focuses main window', () => {
  const app = createFakeApp()
  const mainWindow = createMainWindow()
  const updates = []
  const ingress = createDesktopIngress({
    app,
    onUpdateShutdownRequest: (request) => updates.push(request),
    getMainWindow: () => mainWindow,
  })
  ingress.register()
  ingress.register()
  assert.equal(ingress.registered, true)

  const updateResult = app.emit('second-instance', {}, ['desktop.exe', '--shutdown-for-update'], '', { shutdownForUpdate: true })
  assert.equal(updateResult.kind, 'update-shutdown')
  assert.equal(updates.length, 1)

  const normalResult = app.emit('second-instance', {}, ['desktop.exe', 'dsh://session/next'], '')
  assert.equal(normalResult.kind, 'desktop-ingress')
  assert.equal(mainWindow.restored, 1)
  assert.equal(mainWindow.shown, 1)
  assert.equal(mainWindow.focused, 1)
})

test('open-url and open-file always prevent default and enforce bounded queues', () => {
  const app = createFakeApp()
  const ingress = createDesktopIngress({ app, maxPendingPresetFiles: 1 })
  ingress.register()
  let urlPrevented = 0
  let filePrevented = 0
  const urlResult = app.emit('open-url', { preventDefault: () => { urlPrevented += 1 } }, 'dsh://extensions')
  const firstFile = app.emit('open-file', { preventDefault: () => { filePrevented += 1 } }, 'C:\\tmp\\one.dshpreset')
  const secondFile = app.emit('open-file', { preventDefault: () => { filePrevented += 1 } }, 'C:\\tmp\\two.dshpreset')
  assert.equal(urlResult.accepted, true)
  assert.equal(firstFile.accepted, true)
  assert.equal(secondFile.reason, 'queue-full')
  assert.equal(urlPrevented, 1)
  assert.equal(filePrevented, 2)
})
