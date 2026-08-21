import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateFreeModeSessionId } from './free-mode-session.mjs'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/**
 * Prefix for non-persistent BrowserWindow partitions. A session ID is always
 * appended below, so no two free-mode runs share cookies, storage, or cache.
 */
export const FREE_MODE_RUNTIME_PARTITION = 'dsh-desktop-free-mode-runtime'
export const FREE_MODE_RUNTIME_PRELOAD_PATH = join(SOURCE_DIR, 'preload-free-runtime.cjs')

/** Derive an Electron in-memory partition for exactly one app-owned session. */
export function freeModeRuntimePartitionForSession(sessionId) {
  return `${FREE_MODE_RUNTIME_PARTITION}:${validateFreeModeSessionId(sessionId)}`
}

function parseLoopbackRuntimeUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('free-mode Runtime URL must be a non-empty string')
  }
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('free-mode Runtime URL is invalid')
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError('free-mode Runtime URL must use loopback HTTP')
  }
  if (url.username || url.password) {
    throw new TypeError('free-mode Runtime URL must not contain credentials')
  }
  if (!url.port) {
    throw new TypeError('free-mode Runtime URL must contain an explicit port')
  }
  return url
}

/**
 * Validate and canonically serialize the main-process Runtime URL. The full
 * URL, rather than merely its origin, is used as the one permitted initial
 * navigation target.
 */
export function validateFreeModeRuntimeUrl(value) {
  return parseLoopbackRuntimeUrl(value).toString()
}

function isExactUrl(target, expectedUrl) {
  try {
    return new URL(target).toString() === expectedUrl
  } catch {
    return false
  }
}

function assertWebContents(webContents) {
  if (
    !webContents
    || typeof webContents.on !== 'function'
    || typeof webContents.removeListener !== 'function'
    || typeof webContents.setWindowOpenHandler !== 'function'
    || typeof webContents.session?.setPermissionCheckHandler !== 'function'
    || typeof webContents.session?.setPermissionRequestHandler !== 'function'
  ) {
    throw new TypeError('free-mode Runtime webContents are invalid')
  }
}

function assertRuntimeSession(session) {
  if (!session || typeof session.clearStorageData !== 'function') {
    throw new TypeError('free-mode Runtime session cannot clear storage')
  }
  return session
}

/**
 * Erase the per-session Electron state after its window disappears. The
 * partition is already non-persistent, but explicit cleanup prevents reuse
 * when a caller accidentally retries a session ID within the same process.
 */
export async function clearFreeModeRuntimeSessionStorage(session) {
  const target = assertRuntimeSession(session)
  const failures = []
  const operations = [
    () => target.clearStorageData(),
    ...(typeof target.clearCache === 'function' ? [() => target.clearCache()] : []),
    ...(typeof target.clearAuthCache === 'function' ? [() => target.clearAuthCache()] : []),
    ...(typeof target.closeAllConnections === 'function' ? [() => target.closeAllConnections()] : []),
  ]
  for (const operation of operations) {
    try {
      await operation()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'free-mode Runtime session cleanup failed')
  }
}

/**
 * Runtime pages have no Desktop bridge, but they still need an explicit
 * renderer containment policy. During the programmatic initial load, only
 * the exact canonical loopback URL is accepted. Once that load settles,
 * every main-frame, subframe, redirect, popup, webview, and permission escape
 * is denied.
 */
export function installFreeModeRuntimeNavigationPolicy({ webContents, runtimeUrl } = {}) {
  assertWebContents(webContents)
  const expectedUrl = validateFreeModeRuntimeUrl(runtimeUrl)
  let initialLoadActive = true
  let disposed = false

  const denyUnlessInitialExact = (event, target) => {
    if (initialLoadActive && isExactUrl(target, expectedUrl)) return
    event?.preventDefault?.()
  }
  const denyWebview = (event) => event?.preventDefault?.()

  webContents.on('will-navigate', denyUnlessInitialExact)
  webContents.on('will-frame-navigate', denyUnlessInitialExact)
  webContents.on('will-redirect', denyUnlessInitialExact)
  webContents.on('will-attach-webview', denyWebview)
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.session.setPermissionCheckHandler(() => false)
  webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

  return Object.freeze({
    finishInitialLoad() {
      initialLoadActive = false
    },
    dispose() {
      if (disposed) return
      disposed = true
      webContents.removeListener('will-navigate', denyUnlessInitialExact)
      webContents.removeListener('will-frame-navigate', denyUnlessInitialExact)
      webContents.removeListener('will-redirect', denyUnlessInitialExact)
      webContents.removeListener('will-attach-webview', denyWebview)
    },
  })
}

function assertBrowserWindow(BrowserWindow) {
  if (typeof BrowserWindow !== 'function') {
    throw new TypeError('BrowserWindow constructor is required')
  }
}

function assertBrowserWindowOptions(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('browserWindowOptions must be an object')
  }
  return value
}

/**
 * Create an isolated visual surface for a fully authorized free-mode Runtime.
 * This is deliberately a main-process-only factory: it registers no IPC and
 * accepts no renderer-derived state, action, path, command, or preload.
 */
export async function createFreeModeRuntimeWindow({
  BrowserWindow,
  sessionId,
  runtimeUrl,
  browserWindowOptions = {},
} = {}) {
  assertBrowserWindow(BrowserWindow)
  const runtimeSessionId = validateFreeModeSessionId(sessionId)
  const expectedUrl = validateFreeModeRuntimeUrl(runtimeUrl)
  const partition = freeModeRuntimePartitionForSession(runtimeSessionId)
  const safeWindowOptions = assertBrowserWindowOptions(browserWindowOptions)
  const { webPreferences: _ignoredWebPreferences, ...nativeWindowOptions } = safeWindowOptions

  // Security-sensitive preferences are fixed. A caller can choose ordinary
  // native chrome/size options, but can never add a Desktop preload or make
  // this untrusted Runtime renderer privileged.
  const browserWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 560,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness Desktop - Free mode',
    ...nativeWindowOptions,
    show: false,
    webPreferences: {
      preload: FREE_MODE_RUNTIME_PRELOAD_PATH,
      // Electron partitions without the "persist:" prefix are in-memory.
      // The app-owned ID suffix prevents two free-mode runs from sharing one.
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      spellcheck: false,
      webviewTag: false,
    },
  })

  const { webContents } = browserWindow
  const runtimeSession = assertRuntimeSession(webContents.session)
  let policy
  try {
    policy = installFreeModeRuntimeNavigationPolicy({ webContents, runtimeUrl: expectedUrl })
  } catch (error) {
    const failures = [error]
    try {
      if (!browserWindow.isDestroyed?.()) browserWindow.close?.()
    } catch (closeError) {
      failures.push(closeError)
    }
    try {
      await clearFreeModeRuntimeSessionStorage(runtimeSession)
    } catch (cleanupError) {
      failures.push(cleanupError)
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'free-mode Runtime window initialization cleanup failed')
    }
    throw error
  }

  let disposed = false
  let cleanupComplete = false
  let disposePromise
  const onClosed = () => {
    void dispose({ close: false }).catch(() => {
      // The owning launcher observes the same dispose() promise during its
      // cleanup. Avoid an unhandled rejection if the user closed the window.
    })
  }
  browserWindow.once?.('closed', onClosed)

  function dispose({ close = true } = {}) {
    if (cleanupComplete) return disposePromise
    if (disposePromise !== undefined) return disposePromise
    disposed = true
    let resolveDispose
    let rejectDispose
    disposePromise = new Promise((resolve, reject) => {
      resolveDispose = resolve
      rejectDispose = reject
    })
    void (async () => {
      const failures = []
      try {
        browserWindow.removeListener?.('closed', onClosed)
      } catch (error) {
        failures.push(error)
      }
      try {
        browserWindow.removeListener?.('ready-to-show', onReadyToShow)
      } catch (error) {
        failures.push(error)
      }
      try {
        policy.dispose()
      } catch (error) {
        failures.push(error)
      }
      if (close && !browserWindow.isDestroyed?.()) {
        try {
          browserWindow.close?.()
        } catch (error) {
          failures.push(error)
        }
        // A Runtime page must not keep a free-mode partition alive through a
        // beforeunload handler. Electron's destroy() is only a fallback when
        // close() did not actually close the dedicated window.
        if (!browserWindow.isDestroyed?.() && typeof browserWindow.destroy === 'function') {
          try {
            browserWindow.destroy()
          } catch (error) {
            failures.push(error)
          }
        }
      }
      try {
        await clearFreeModeRuntimeSessionStorage(runtimeSession)
      } catch (error) {
        failures.push(error)
      }
      if (failures.length > 0) {
        // All attempted cleanup steps have settled. Let a subsequent owner
        // retry storage cleanup rather than permanently pinning this session
        // behind a rejected promise.
        disposePromise = undefined
        rejectDispose(new AggregateError(failures, 'free-mode Runtime window cleanup failed'))
      } else {
        cleanupComplete = true
        resolveDispose()
      }
    })()
    return disposePromise
  }

  const onReadyToShow = () => {
    if (!disposed && !browserWindow.isDestroyed?.()) browserWindow.show?.()
  }
  browserWindow.once?.('ready-to-show', onReadyToShow)
  try {
    await browserWindow.loadURL(expectedUrl)
    policy.finishInitialLoad()
    if (disposed) {
      throw new Error('free-mode Runtime window closed during its initial load')
    }
  } catch (error) {
    policy.finishInitialLoad()
    await dispose()
    throw error
  }

  return Object.freeze({
    window: browserWindow,
    runtimeUrl: expectedUrl,
    dispose,
  })
}
