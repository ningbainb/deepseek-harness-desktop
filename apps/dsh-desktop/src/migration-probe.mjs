/**
 * Hardened same-origin document used only to read an old browser Task ledger.
 * It deliberately has no Desktop bridge, no navigation escape, no popups,
 * no renderer permissions, and a response CSP that prevents the DSH page's
 * scripts from running.  Electron code is injected after load only to read
 * one bounded localStorage key.
 */

export const DESKTOP_MIGRATION_PROBE_QUERY = 'dshDesktopMigrationProbe'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const MIGRATION_PROBE_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; style-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"

function normalizedUrl(value, label = 'migration probe URL') {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError(`${label} is invalid`)
  }
  return parsed
}

/** Add the one explicit recovery marker to a loopback Runtime URL. */
export function createMigrationProbeUrl(runtimeUrl) {
  const url = normalizedUrl(runtimeUrl, 'Runtime URL')
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('Task ledger migration refused a non-loopback Runtime origin')
  }
  url.searchParams.set(DESKTOP_MIGRATION_PROBE_QUERY, '1')
  url.hash = ''
  return url.toString()
}

/**
 * The probe needs exactly one main-frame navigation.  It never opens a
 * window, follows a redirect, embeds a webview, or hands URLs to the system.
 */
export function installMigrationProbeNavigationPolicy({ webContents, probeUrl }) {
  if (typeof webContents?.on !== 'function' || typeof webContents?.setWindowOpenHandler !== 'function') {
    throw new TypeError('migration probe webContents are invalid')
  }
  const allowedUrl = normalizedUrl(probeUrl).toString()
  const isAllowed = (target) => {
    try {
      return normalizedUrl(target).toString() === allowedUrl
    } catch {
      return false
    }
  }
  const denyNavigation = (event, target) => {
    if (isAllowed(target)) return
    event?.preventDefault?.()
  }
  const denyWebview = (event) => event?.preventDefault?.()
  webContents.on('will-navigate', denyNavigation)
  webContents.on('will-redirect', denyNavigation)
  webContents.on('will-attach-webview', denyWebview)
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return () => {
    webContents.removeListener?.('will-navigate', denyNavigation)
    webContents.removeListener?.('will-redirect', denyNavigation)
    webContents.removeListener?.('will-attach-webview', denyWebview)
  }
}

/**
 * `webRequest` is session-scoped, so this is installed only while the hidden
 * pre-main-window probe loads. At that point it is the sole renderer; the
 * regular renderer installs its normal policy after migration finishes.
 */
export function installMigrationProbeContentSecurityPolicy({ session, webContents }) {
  const webRequest = session?.webRequest
  if (typeof webRequest?.onHeadersReceived !== 'function' || !Number.isInteger(webContents?.id)) {
    throw new TypeError('migration probe session is invalid')
  }
  let active = true
  webRequest.onHeadersReceived((details, callback) => {
    if (!active || details?.webContentsId !== webContents.id || details?.resourceType !== 'mainFrame') {
      callback({})
      return
    }
    const headers = { ...(details.responseHeaders ?? {}) }
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') delete headers[key]
    }
    headers['Content-Security-Policy'] = [MIGRATION_PROBE_CSP]
    callback({ responseHeaders: headers })
  })
  return () => {
    if (!active) return
    active = false
    // Electron permits a single listener for this event. The default session
    // has no renderer yet; clear this short-lived probe handler before the
    // main Desktop window installs its normal policy.
    webRequest.onHeadersReceived(null)
  }
}

/** Deny every permission request during the pre-DSH recovery probe. */
export function denyMigrationProbePermissions(session) {
  if (typeof session?.setPermissionCheckHandler !== 'function' || typeof session?.setPermissionRequestHandler !== 'function') {
    throw new TypeError('migration probe permission session is invalid')
  }
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
}
