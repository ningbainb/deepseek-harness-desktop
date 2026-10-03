import { runBestEffort } from './best-effort-events.mjs'
import { desktopRuntimeOrigin } from './runtime-origin.mjs'

export const EXTERNAL_URL_OPEN_CHANNEL = 'desktop:external-url-open'

export function trustedExternalUrl(target, runtimeOrigin) {
  if (typeof target !== 'string' || target.length > 8192 || /[\u0000-\u0020\u007f]/u.test(target)) return undefined
  try {
    const url = new URL(target)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined
    const runtime = desktopRuntimeOrigin(runtimeOrigin)
    if (runtime !== undefined && desktopRuntimeOrigin(url.href) === runtime) return undefined
    return url.href
  } catch {
    return undefined
  }
}

export function installTrustedExternalOpenPolicy({ webContents, getRuntimeOrigin, openExternal }) {
  if (typeof webContents.ipc?.handle !== 'function') return
  webContents.ipc.handle(EXTERNAL_URL_OPEN_CHANNEL, async (event, target) => {
    const runtime = desktopRuntimeOrigin(getRuntimeOrigin())
    if (runtime === undefined || event.senderFrame !== webContents.mainFrame
      || desktopRuntimeOrigin(event.senderFrame?.url) !== runtime) {
      throw new Error('external URL sender is not the active Runtime main frame')
    }
    const url = trustedExternalUrl(target, runtime)
    if (url === undefined) throw new Error('external URL target is not an allowed web URL')
    await openExternal(url)
    return true
  })
}

export function classifyNavigation(target, runtimeOrigin) {
  let url
  try {
    url = new URL(target)
  } catch {
    return 'deny'
  }
  const expectedOrigin = desktopRuntimeOrigin(runtimeOrigin)
  if (expectedOrigin !== undefined && desktopRuntimeOrigin(url.href) === expectedOrigin) return 'allow'
  if (url.protocol === 'https:') return 'external'
  return 'deny'
}

export function isOAuthPopupBootstrap(target) {
  return target === 'about:blank'
}

export function isOfficialAccountAuthorization(target) {
  try {
    const url = new URL(target)
    return url.origin === 'https://platform.deepseek.com'
      && url.pathname === '/dsh/authorize'
      && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
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
  installTrustedExternalOpenPolicy({ webContents, getRuntimeOrigin, openExternal })
  webContents.on('will-navigate', (event, target) => {
    const decision = classifyNavigation(target, getRuntimeOrigin())
    if (decision === 'allow') return
    event.preventDefault()
  })
  webContents.on('will-attach-webview', (event) => event.preventDefault())
  webContents.setWindowOpenHandler(({ url }) => {
    if (isOfficialAccountAuthorization(url)) {
      runBestEffort(() => openExternal(url), onError)
      return { action: 'deny' }
    }
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
