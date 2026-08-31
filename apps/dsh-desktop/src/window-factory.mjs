import { createCommunityQrImage } from './community.mjs'
import { DESKTOP_SURFACES } from './desktop-contract.mjs'
import { applyWindowIcon } from './app-icon.mjs'
import { installNavigationPolicy } from './navigation-policy.mjs'
import { getWindowChromeTheme, installWindowChrome, setWindowChromeTheme, windowChromeBrowserOptions } from './window-chrome.mjs'

export const SECONDARY_WINDOW_PARTITION = 'dsh-desktop-secondary'

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
  appIcon,
  windowChromeIconDataUrl,
  mainPreload,
  extensionPreload,
  extensionsPath,
  handoffPath,
  communityPath,
  surfaceRegistry,
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
    return browserWindow.loadFile(filePath, { query: { ...query, theme: chromeTheme } })
  }

  const getAuxiliaryWindow = (key) => {
    const window = windows.get(key)
    return window && !window.isDestroyed() ? window : undefined
  }

  const createExtensionWindow = async () => {
    recordSurface('extensions')
    const existing = getAuxiliaryWindow('extensions')
    if (existing) {
      existing.show()
      existing.focus()
      return existing
    }
    const mainWindow = getMainWindow()
    const chromeTheme = mainWindow && !mainWindow.isDestroyed() ? getWindowChromeTheme(mainWindow) : 'dark'
    const browserWindow = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 760,
      minHeight: 620,
      show: false,
      parent: mainWindow,
      title: 'Extension Dock',
      icon: appIcon,
      backgroundColor: chromeTheme === 'dark' ? '#0a141b' : '#ffffff',
      ...windowChromeBrowserOptions(chromeTheme),
      webPreferences: secondaryWindowWebPreferences({ preload: extensionPreload }),
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

  const syncTheme = (theme) => {
    for (const browserWindow of windows.values()) {
      if (!browserWindow || browserWindow.isDestroyed()) continue
      setWindowChromeTheme(browserWindow, theme)
      const script = `document.documentElement.dataset.dshDesktopTheme = ${JSON.stringify(theme)}; document.documentElement.dataset.dshDesktopChromeTheme = ${JSON.stringify(theme)}`
      void browserWindow.webContents.executeJavaScript(script).catch(() => {})
    }
  }

  return Object.freeze({
    createExtensionWindow,
    createHandoffWindow,
    createCommunityWindow,
    syncTheme,
    getWindow: getAuxiliaryWindow,
    get extensionWindow() { return getAuxiliaryWindow('extensions') },
    get handoffWindow() { return getAuxiliaryWindow('handoff') },
    get communityWindow() { return getAuxiliaryWindow('community') },
  })
}
