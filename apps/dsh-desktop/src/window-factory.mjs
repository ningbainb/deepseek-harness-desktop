import { createCommunityQrImage } from './community.mjs'
import { createDockSettingsView } from './dock-settings-view.mjs'
import { applyWindowPalette } from './window-palette.mjs'
import { getWindowPalette } from './window-chrome.mjs'
import { DESKTOP_SURFACES } from './desktop-contract.mjs'
import { applyWindowIcon } from './app-icon.mjs'
import { installNavigationPolicy } from './navigation-policy.mjs'
import { getWindowChromeTheme, installWindowChrome, setWindowChromeTheme, windowChromeBrowserOptions } from './window-chrome.mjs'
import { installWindowMotion, publishWindowMotion } from './window-motion.mjs'

export const SECONDARY_WINDOW_PARTITION = 'dsh-desktop-secondary'

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

/** Place a child beside its parent when possible and keep it inside one work area. */
export function attachedWindowBounds(parentBounds, childBounds, workArea, gap = 12) {
  const width = Math.min(childBounds.width, workArea.width)
  const height = Math.min(childBounds.height, workArea.height)
  const workRight = workArea.x + workArea.width
  const workBottom = workArea.y + workArea.height
  const right = parentBounds.x + parentBounds.width + gap
  const left = parentBounds.x - width - gap
  const x = right + width <= workRight
    ? right
    : left >= workArea.x
      ? left
      : clamp(parentBounds.x + parentBounds.width - width, workArea.x, workRight - width)
  return {
    x,
    y: clamp(parentBounds.y, workArea.y, workBottom - height),
    width,
    height,
  }
}

/** Center on the main window's display, including monitors with negative coordinates. */
export function centeredWindowBounds(childBounds, workArea) {
  const width = Math.min(childBounds.width, workArea.width)
  const height = Math.min(childBounds.height, workArea.height)
  return { x: workArea.x + Math.round((workArea.width - width) / 2), y: workArea.y + Math.round((workArea.height - height) / 2), width, height }
}

function sameBounds(left, right) {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
}

function matchingWorkArea(screen, bounds) {
  return screen?.getDisplayMatching?.(bounds)?.workArea
    ?? screen?.getPrimaryDisplay?.()?.workArea
}

/**
 * Follow the main window until the user moves the child independently.
 * Display changes still clamp a detached child, and every listener is removed
 * when the child closes.
 */
export function installAttachedWindowPlacement({ parentWindow, childWindow, screen, gap = 12 } = {}) {
  if (!parentWindow || !childWindow || !screen) return () => {}
  let detached = false
  let applying = false
  let disposed = false

  const expectedBounds = () => {
    const parent = parentWindow.getBounds()
    const child = childWindow.getBounds()
    const workArea = matchingWorkArea(screen, parent)
    return workArea === undefined ? child : attachedWindowBounds(parent, child, workArea, gap)
  }
  const applyBounds = (bounds) => {
    if (childWindow.isDestroyed?.()) return
    if (sameBounds(childWindow.getBounds(), bounds)) return
    applying = true
    try { childWindow.setBounds(bounds, false) } finally { applying = false }
  }
  const followParent = () => {
    if (detached || parentWindow.isDestroyed?.() || childWindow.isDestroyed?.()) return
    applyBounds(expectedBounds())
  }
  const childMoved = () => {
    if (applying || detached || parentWindow.isDestroyed?.() || childWindow.isDestroyed?.()) return
    if (!sameBounds(childWindow.getBounds(), expectedBounds())) detached = true
  }
  const displayChanged = () => {
    if (parentWindow.isDestroyed?.() || childWindow.isDestroyed?.()) return
    if (!detached) {
      followParent()
      return
    }
    const child = childWindow.getBounds()
    const workArea = matchingWorkArea(screen, child)
    if (workArea !== undefined) {
      applyBounds({
        ...child,
        width: Math.min(child.width, workArea.width),
        height: Math.min(child.height, workArea.height),
        x: clamp(child.x, workArea.x, workArea.x + workArea.width - Math.min(child.width, workArea.width)),
        y: clamp(child.y, workArea.y, workArea.y + workArea.height - Math.min(child.height, workArea.height)),
      })
    }
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const event of ['move', 'resize', 'maximize', 'unmaximize', 'restore']) {
      parentWindow.removeListener?.(event, followParent)
    }
    childWindow.removeListener?.('move', childMoved)
    childWindow.removeListener?.('closed', dispose)
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.removeListener?.(event, displayChanged)
    }
  }

  for (const event of ['move', 'resize', 'maximize', 'unmaximize', 'restore']) {
    parentWindow.on?.(event, followParent)
  }
  childWindow.on?.('move', childMoved)
  childWindow.once?.('closed', dispose)
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on?.(event, displayChanged)
  }
  followParent()
  return dispose
}

export function secondaryWindowWebPreferences({ preload } = {}) {
  return {
    ...(preload ? { preload } : {}),
    partition: SECONDARY_WINDOW_PARTITION,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: false,
  }
}
/**
 * Keep the primary BrowserWindow security contract in one mechanically
 * testable constructor. Wiring (IPC, renderer surfaces, and lifecycle
 * disposers) remains in electron-app.mjs where the relevant services live.
 */
export function createMainWindow({ BrowserWindow, appIcon, productName, state, preload } = {}) {
  if (typeof BrowserWindow !== 'function') throw new TypeError('main window constructor is required')
  return new BrowserWindow({
    ...state,
    minWidth: 720,
    minHeight: 540,
    show: false,
    title: productName,
    icon: appIcon,
    backgroundColor: '#040814',
    ...windowChromeBrowserOptions(),
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
}

/**
 * Factory for the three auxiliary desktop windows. It owns only window
 * instances and their close cleanup; callers own application services and
 * decide when to invoke each method.
 */
export function createDesktopWindowFactory({
  BrowserWindow,
  WebContentsView,
  dialog,
  getRuntimeOrigin = () => undefined,
  appIcon,
  windowChromeIconDataUrl,
  mainPreload,
  extensionPreload,
  extensionsPath,
  handoffPath,
  communityPath,
  surfaceRegistry,
  screen,
  shell,
  getMainWindow = () => undefined,
  log = () => {},
  productMetrics,
} = {}) {
  if (typeof BrowserWindow !== 'function') throw new TypeError('desktop window constructor is required')
  if (!surfaceRegistry || typeof surfaceRegistry.register !== 'function') {
    throw new TypeError('desktop window surface registry is required')
  }
  if (typeof getMainWindow !== 'function') throw new TypeError('desktop main-window getter is required')

  const windows = new Map()
  let communityWindowPromise
  let dockSettings

  const recordSurface = (name) => {
    try { productMetrics?.recordSurface?.(name) } catch { /* metrics are best effort */ }
  }
  const report = (component, error) => {
    const message = error instanceof Error ? error.message : String(error)
    try { return log(`[${component}] ${message}`) } catch { return undefined }
  }

  const configureSecondaryWindow = ({
    key,
    browserWindow,
    surface,
    preload,
    filePath,
    chromeTheme,
    permissionCheck = false,
    query = {},
  }) => {
    windows.set(key, browserWindow)
    setWindowChromeTheme(browserWindow, chromeTheme)
    const unregisterSurface = surfaceRegistry.register(browserWindow.webContents, surface)
    applyWindowIcon(browserWindow, appIcon)
    const removeWindowChrome = installWindowChrome({
      browserWindow,
      iconDataUrl: windowChromeIconDataUrl,
      onError: (error) => { void report('window-chrome', error) },
    })
    installNavigationPolicy({
      webContents: browserWindow.webContents,
      getRuntimeOrigin: () => undefined,
      openExternal: (url) => shell.openExternal(url),
      onError: (error) => report('navigation', error),
    })
    if (permissionCheck) browserWindow.webContents.session.setPermissionCheckHandler(() => false)
    browserWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    browserWindow.once('ready-to-show', () => {
      if (!browserWindow.isDestroyed()) browserWindow.show()
    })
    browserWindow.on('closed', () => {
      unregisterSurface()
      removeWindowChrome()
      if (windows.get(key) === browserWindow) windows.delete(key)
    })
    return browserWindow.loadFile(filePath, { query: { ...query, theme: chromeTheme } }).then(() => {
      const palette = getWindowPalette(getMainWindow())
      setWindowChromeTheme(browserWindow, chromeTheme, palette)
      return browserWindow.webContents.executeJavaScript(`(${applyWindowPalette.toString()})(document, ${JSON.stringify(palette)})`)
    })
  }

  const getAuxiliaryWindow = (key) => {
    const window = windows.get(key)
    return window && !window.isDestroyed() ? window : undefined
  }

  const createExtensionWindow = async () => {
    recordSurface('extensions')
    const existing = getAuxiliaryWindow('extensions')
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return existing
    }
    const mainWindow = getMainWindow()
    const chromeTheme = mainWindow && !mainWindow.isDestroyed() ? getWindowChromeTheme(mainWindow) : 'dark'
    const parentBounds = mainWindow?.getBounds()
    const workArea = parentBounds && matchingWorkArea(screen, parentBounds)
    const initialBounds = workArea
      ? centeredWindowBounds({ width: 960, height: 680 }, workArea)
      : { width: 960, height: 680 }
    const browserWindow = new BrowserWindow({
      ...initialBounds,
      minWidth: 680,
      minHeight: 480,
      show: false,
      // Windows Dock uses a normal taskbar window, not an owned mini-caption.
      ...(process.platform === 'win32' ? { skipTaskbar: false } : { parent: mainWindow }),
      title: 'Extension Dock',
      icon: appIcon,
      backgroundColor: chromeTheme === 'dark' ? '#0a141b' : '#ffffff',
      ...windowChromeBrowserOptions(chromeTheme),
      webPreferences: secondaryWindowWebPreferences({ preload: extensionPreload }),
    })
    const closeWithMain = () => { if (!browserWindow.isDestroyed()) browserWindow.destroy() }
    mainWindow?.once('closed', closeWithMain)
    browserWindow.once('closed', () => mainWindow?.removeListener('closed', closeWithMain))
    if (WebContentsView) {
      setWindowChromeTheme(browserWindow, chromeTheme)
      dockSettings = createDockSettingsView({ WebContentsView, window: browserWindow, mainWindow, getRuntimeOrigin, dialog, openExternal: url => shell.openExternal(url) })
      browserWindow.once('closed', () => { dockSettings = undefined })
    }
    installWindowMotion(browserWindow, active => {
      publishWindowMotion(mainWindow.webContents, active)
      dockSettings?.setInteracting(active)
    })
    await configureSecondaryWindow({
      key: 'extensions',
      browserWindow,
      surface: DESKTOP_SURFACES.EXTENSIONS,
      filePath: extensionsPath,
      chromeTheme,
      permissionCheck: false,
    })
    return browserWindow
  }

  const createHandoffWindow = async () => {
    recordSurface('conversation-import')
    const existing = getAuxiliaryWindow('handoff')
    if (existing) {
      existing.show()
      existing.focus()
      return existing
    }
    const mainWindow = getMainWindow()
    const chromeTheme = mainWindow && !mainWindow.isDestroyed() ? getWindowChromeTheme(mainWindow) : 'dark'
    const browserWindow = new BrowserWindow({
      width: 1040,
      height: 720,
      minWidth: 780,
      minHeight: 560,
      show: false,
      parent: mainWindow,
      title: '从其他 AI 工具继续工作 - DeepSeek Harness',
      icon: appIcon,
      backgroundColor: chromeTheme === 'dark' ? '#0a141b' : '#ffffff',
      ...windowChromeBrowserOptions(chromeTheme),
      webPreferences: secondaryWindowWebPreferences({ preload: mainPreload }),
    })
    await configureSecondaryWindow({
      key: 'handoff',
      browserWindow,
      surface: DESKTOP_SURFACES.MAIN,
      filePath: handoffPath,
      chromeTheme,
      permissionCheck: false,
    })
    return browserWindow
  }

  const createCommunityWindow = () => {
    recordSurface('community')
    if (communityWindowPromise) return communityWindowPromise
    const existing = getAuxiliaryWindow('community')
    if (existing) {
      existing.show()
      existing.focus()
      return Promise.resolve(existing)
    }
    let createdWindow
    let operation
    operation = (async () => {
      const qrImage = await createCommunityQrImage()
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('main window closed before the community window could open')
      }
      const chromeTheme = getWindowChromeTheme(mainWindow)
      createdWindow = new BrowserWindow({
        width: 580,
        height: 740,
        minWidth: 500,
        minHeight: 680,
        show: false,
        parent: mainWindow,
        title: '加入社群',
        icon: appIcon,
        backgroundColor: chromeTheme === 'dark' ? '#0a141b' : '#f7f8fa',
        ...windowChromeBrowserOptions(chromeTheme),
        webPreferences: secondaryWindowWebPreferences(),
      })
      await configureSecondaryWindow({
        key: 'community',
        browserWindow: createdWindow,
        surface: DESKTOP_SURFACES.COMMUNITY,
        filePath: communityPath,
        chromeTheme,
        permissionCheck: true,
        query: { qr: qrImage },
      })
      return createdWindow
    })().catch((error) => {
      if (createdWindow && !createdWindow.isDestroyed()) createdWindow.destroy()
      if (windows.get('community') === createdWindow) windows.delete('community')
      throw error
    }).finally(() => {
      if (communityWindowPromise === operation) communityWindowPromise = undefined
    })
    communityWindowPromise = operation
    return operation
  }

  const syncTheme = (theme, palette) => {
    dockSettings?.syncTheme(theme)
    if (palette !== undefined) dockSettings?.syncPalette(palette)
    for (const browserWindow of windows.values()) {
      if (!browserWindow || browserWindow.isDestroyed()) continue
      setWindowChromeTheme(browserWindow, theme, palette)
      const script = `document.documentElement.dataset.dshDesktopTheme = ${JSON.stringify(theme)}; document.documentElement.dataset.dshDesktopChromeTheme = ${JSON.stringify(theme)}; (${applyWindowPalette.toString()})(document, ${JSON.stringify(getWindowPalette(browserWindow))})`
      void browserWindow.webContents.executeJavaScript(script).catch(() => {})
    }
  }

  return Object.freeze({
    createExtensionWindow,
    selectDockSetting: (id) => {
      if (!dockSettings) throw new Error('拓展坞设置尚未就绪，请重新打开拓展坞。')
      return dockSettings.select(id)
    },
    createHandoffWindow,
    createCommunityWindow,
    syncTheme,
    getWindow: getAuxiliaryWindow,
    get extensionWindow() { return getAuxiliaryWindow('extensions') },
    get handoffWindow() { return getAuxiliaryWindow('handoff') },
    get communityWindow() { return getAuxiliaryWindow('community') },
  })
}
