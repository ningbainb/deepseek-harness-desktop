import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  clearFreeModeRuntimeSessionStorage,
  createFreeModeRuntimeWindow,
  FREE_MODE_RUNTIME_PARTITION,
  FREE_MODE_RUNTIME_PRELOAD_PATH,
  freeModeRuntimePartitionForSession,
  installFreeModeRuntimeNavigationPolicy,
  validateFreeModeRuntimeUrl,
} from '../src/free-mode-runtime-window.mjs'

class FakeBrowserWindow extends EventEmitter {
  static instances = []

  constructor(options) {
    super()
    this.options = options
    this.destroyed = false
    this.loadedUrl = undefined
    this.shown = false
    this.handlers = new Map()
    this.sessionCalls = []
    this.webContents = {
      session: {
        setPermissionCheckHandler: (handler) => { this.permissionCheckHandler = handler },
        setPermissionRequestHandler: (handler) => { this.permissionRequestHandler = handler },
        clearStorageData: async () => { this.sessionCalls.push('clear-storage-data') },
        clearCache: async () => { this.sessionCalls.push('clear-cache') },
        clearAuthCache: async () => { this.sessionCalls.push('clear-auth-cache') },
        closeAllConnections: async () => { this.sessionCalls.push('close-all-connections') },
      },
      on: (event, handler) => this.handlers.set(event, handler),
      removeListener: (event, handler) => {
        if (this.handlers.get(event) === handler) this.handlers.delete(event)
      },
      setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler },
    }
    FakeBrowserWindow.instances.push(this)
  }

  async loadURL(url) {
    this.loadedUrl = url
    const event = { prevented: false, preventDefault() { this.prevented = true } }
    this.handlers.get('will-navigate')(event, url)
    assert.equal(event.prevented, false)
  }

  isDestroyed() {
    return this.destroyed
  }

  show() {
    this.shown = true
  }

  close() {
    if (this.destroyed) return
    this.destroyed = true
    this.emit('closed')
  }
}

class FlakyCleanupBrowserWindow extends FakeBrowserWindow {
  constructor(options) {
    super(options)
    let attempts = 0
    this.webContents.session.clearStorageData = async () => {
      this.sessionCalls.push('clear-storage-data')
      attempts += 1
      if (attempts === 1) throw new Error('temporary storage cleanup failure')
    }
  }
}

function navigationEvent() {
  return { prevented: false, preventDefault() { this.prevented = true } }
}

test('free-mode Runtime URL only accepts credential-free loopback HTTP with an explicit port', () => {
  assert.equal(
    validateFreeModeRuntimeUrl('http://127.0.0.1:43125/free?session=1'),
    'http://127.0.0.1:43125/free?session=1',
  )
  for (const invalid of [
    'https://127.0.0.1:43125/',
    'http://example.com:43125/',
    'http://user:pass@127.0.0.1:43125/',
    'http://127.0.0.1/',
    '',
  ]) {
    assert.throws(() => validateFreeModeRuntimeUrl(invalid), /free-mode Runtime URL/u)
  }
})

test('free-mode Runtime window is isolated and cannot inherit caller web preferences', async () => {
  const runtime = await createFreeModeRuntimeWindow({
    BrowserWindow: FakeBrowserWindow,
    sessionId: 'free-session-001',
    runtimeUrl: 'http://127.0.0.1:43125/free?session=1',
    browserWindowOptions: {
      width: 1440,
      show: true,
      webPreferences: {
        preload: 'C:\\unsafe\\preload.cjs',
        nodeIntegration: true,
      },
    },
  })
  const browserWindow = runtime.window
  const { webPreferences } = browserWindow.options

  assert.equal(browserWindow.options.width, 1440)
  assert.equal(browserWindow.options.show, false)
  assert.equal(browserWindow.loadedUrl, 'http://127.0.0.1:43125/free?session=1')
  assert.equal(runtime.runtimeUrl, browserWindow.loadedUrl)
  assert.equal(webPreferences.preload, FREE_MODE_RUNTIME_PRELOAD_PATH)
  assert.equal(webPreferences.partition, freeModeRuntimePartitionForSession('free-session-001'))
  assert.equal(webPreferences.partition.startsWith(`${FREE_MODE_RUNTIME_PARTITION}:`), true)
  assert.equal(webPreferences.partition.startsWith('persist:'), false)
  assert.equal(webPreferences.contextIsolation, true)
  assert.equal(webPreferences.sandbox, true)
  assert.equal(webPreferences.nodeIntegration, false)
  assert.equal(webPreferences.nodeIntegrationInSubFrames, false)
  assert.equal(webPreferences.nodeIntegrationInWorker, false)
  assert.equal(webPreferences.webSecurity, true)
  assert.equal(webPreferences.allowRunningInsecureContent, false)
  assert.equal(webPreferences.webviewTag, false)

  assert.deepEqual(browserWindow.windowOpenHandler({ url: 'https://example.com/' }), { action: 'deny' })
  assert.equal(browserWindow.permissionCheckHandler(), false)
  let permissionValue
  browserWindow.permissionRequestHandler(undefined, 'clipboard-read', (value) => { permissionValue = value })
  assert.equal(permissionValue, false)

  for (const [eventName, target] of [
    ['will-navigate', 'http://127.0.0.1:43125/free?session=1'],
    ['will-frame-navigate', 'http://127.0.0.1:43125/free?session=1'],
    ['will-redirect', 'http://127.0.0.1:43125/free?session=1'],
  ]) {
    const event = navigationEvent()
    browserWindow.handlers.get(eventName)(event, target)
    assert.equal(event.prevented, true, `${eventName} must be blocked after initial load`)
  }
  for (const eventName of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    const event = navigationEvent()
    browserWindow.handlers.get(eventName)(event, 'https://example.com/')
    assert.equal(event.prevented, true, `${eventName} must block an external target`)
  }

  await runtime.dispose()
  assert.equal(browserWindow.destroyed, true)
  assert.equal(browserWindow.handlers.size, 0)
  assert.deepEqual(browserWindow.sessionCalls, [
    'clear-storage-data',
    'clear-cache',
    'clear-auth-cache',
    'close-all-connections',
  ])
})

test('each free-mode session receives a unique in-memory partition and clears it after a user close', async () => {
  const first = await createFreeModeRuntimeWindow({
    BrowserWindow: FakeBrowserWindow,
    sessionId: 'free-session-002',
    runtimeUrl: 'http://127.0.0.1:43125/free?session=2',
  })
  const second = await createFreeModeRuntimeWindow({
    BrowserWindow: FakeBrowserWindow,
    sessionId: 'free-session-003',
    runtimeUrl: 'http://127.0.0.1:43125/free?session=3',
  })

  const firstPartition = first.window.options.webPreferences.partition
  const secondPartition = second.window.options.webPreferences.partition
  assert.notEqual(firstPartition, secondPartition)
  assert.equal(firstPartition, 'dsh-desktop-free-mode-runtime:free-session-002')
  assert.equal(secondPartition, 'dsh-desktop-free-mode-runtime:free-session-003')

  first.window.close()
  await first.dispose({ close: false })
  assert.deepEqual(first.window.sessionCalls, [
    'clear-storage-data',
    'clear-cache',
    'clear-auth-cache',
    'close-all-connections',
  ])
  await second.dispose()
})

test('session cleanup is mandatory and aggregates best-effort cache cleanup failures', async () => {
  const calls = []
  await assert.rejects(
    clearFreeModeRuntimeSessionStorage({
      clearStorageData: async () => { calls.push('storage'); throw new Error('storage unavailable') },
      clearCache: async () => { calls.push('cache') },
      clearAuthCache: async () => { calls.push('auth'); throw new Error('auth unavailable') },
      closeAllConnections: async () => { calls.push('connections') },
    }),
    AggregateError,
  )
  assert.deepEqual(calls, ['storage', 'cache', 'auth', 'connections'])
  await assert.rejects(
    clearFreeModeRuntimeSessionStorage({}),
    /cannot clear storage/u,
  )
})

test('a failed session-storage cleanup can be retried without reopening or sharing the session', async () => {
  const runtime = await createFreeModeRuntimeWindow({
    BrowserWindow: FlakyCleanupBrowserWindow,
    sessionId: 'free-session-004',
    runtimeUrl: 'http://127.0.0.1:43125/free?session=4',
  })

  await assert.rejects(runtime.dispose(), AggregateError)
  assert.equal(runtime.window.destroyed, true)
  await runtime.dispose({ close: false })
  assert.deepEqual(runtime.window.sessionCalls, [
    'clear-storage-data',
    'clear-cache',
    'clear-auth-cache',
    'close-all-connections',
    'clear-storage-data',
    'clear-cache',
    'clear-auth-cache',
    'close-all-connections',
  ])
})

test('navigation policy permits only the exact initial URL and removes its hooks on dispose', () => {
  const browserWindow = new FakeBrowserWindow({})
  const policy = installFreeModeRuntimeNavigationPolicy({
    webContents: browserWindow.webContents,
    runtimeUrl: 'http://127.0.0.1:43125/free?session=1',
  })

  const exactInitial = navigationEvent()
  browserWindow.handlers.get('will-navigate')(exactInitial, 'http://127.0.0.1:43125/free?session=1')
  assert.equal(exactInitial.prevented, false)
  const alteredInitial = navigationEvent()
  browserWindow.handlers.get('will-navigate')(alteredInitial, 'http://127.0.0.1:43125/free?session=2')
  assert.equal(alteredInitial.prevented, true)

  policy.finishInitialLoad()
  const repeat = navigationEvent()
  browserWindow.handlers.get('will-navigate')(repeat, 'http://127.0.0.1:43125/free?session=1')
  assert.equal(repeat.prevented, true)

  policy.dispose()
  assert.equal(browserWindow.handlers.size, 0)
})

test('free-mode Runtime preload is empty and source contains no renderer bridge or IPC registration', async () => {
  const [preload, source] = await Promise.all([
    readFile(new URL('../src/preload-free-runtime.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/free-mode-runtime-window.mjs', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(preload, /require\(|contextBridge|ipcRenderer|dshDesktop|dshPreflightRecovery/u)
  assert.doesNotMatch(source, /ipcMain|ipcRenderer|contextBridge|desktop:/u)
})
