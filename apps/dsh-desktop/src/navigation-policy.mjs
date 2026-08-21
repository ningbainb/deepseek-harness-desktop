import { runBestEffort } from './best-effort-events.mjs'

export function classifyNavigation(target, runtimeOrigin) {
  let url
  try {
    url = new URL(target)
  } catch {
    return 'deny'
  }
  if (runtimeOrigin && url.origin === runtimeOrigin) return 'allow'
  if (url.protocol === 'https:') return 'external'
  return 'deny'
}

export function isOAuthPopupBootstrap(target) {
  return target === 'about:blank'
}

function closePopupSoon(browserWindow) {
  setImmediate(() => {
    if (!browserWindow.isDestroyed()) browserWindow.close()
  })
}

function installOAuthPopupPolicy({ browserWindow, openExternal, onError }) {
  const popupContents = browserWindow.webContents
  popupContents.on('will-navigate', (event, target) => {
    if (isOAuthPopupBootstrap(target)) return
    event.preventDefault()
    if (classifyNavigation(target) === 'external') runBestEffort(() => openExternal(target), onError)
    closePopupSoon(browserWindow)
  })
  popupContents.on('will-attach-webview', (event) => event.preventDefault())
  popupContents.setWindowOpenHandler(({ url }) => {
    if (classifyNavigation(url) === 'external') runBestEffort(() => openExternal(url), onError)
    return { action: 'deny' }
  })
}

export function installNavigationPolicy({ webContents, getRuntimeOrigin, openExternal, onError = () => {} }) {
  webContents.on('will-navigate', (event, target) => {
    const decision = classifyNavigation(target, getRuntimeOrigin())
    if (decision === 'allow') return
    event.preventDefault()
  })
  webContents.on('will-attach-webview', (event) => event.preventDefault())
  webContents.setWindowOpenHandler(({ url }) => {
    if (isOAuthPopupBootstrap(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
          },
        },
      }
    }
    // Renderer-owned popups are never promoted to the system browser. The
    // main process exposes explicit Help/community actions for intentional
    // external navigation, while the hidden about:blank bootstrap below is
    // reserved for the Codex OAuth handoff.
    return { action: 'deny' }
  })
  webContents.on('did-create-window', (browserWindow, details) => {
    if (!isOAuthPopupBootstrap(details.url)) {
      browserWindow.close()
      return
    }
    installOAuthPopupPolicy({ browserWindow, openExternal, onError })
  })
}
