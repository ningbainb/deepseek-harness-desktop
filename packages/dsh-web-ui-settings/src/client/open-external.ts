/**
 * Browser-safe and Electron-Desktop-compatible external URL opener.
 *
 * In Electron Desktop, renderer window popups are blocked by default for security,
 * so explicit browser actions use the trusted preload bridge, never a popup.
 *
 * In standard browser environments, window.open('about:blank') followed by
 * assigning location.href opens the target URL in a new tab.
 */
export function openExternalUrl(href: string, onFailure: () => void = () => {}): boolean {
  if (typeof window === 'undefined' || typeof href !== 'string') return false
  if (href.length > 8192 || /[\u0000-\u0020\u007f]/u.test(href)) return false
  let parsed: URL
  try {
    parsed = new URL(href)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  if (parsed.username !== '' || parsed.password !== '') return false

  const host = window as Window & {
    dshDesktop?: { openExternalUrl?: (url: string) => Promise<boolean> }
    dshDesktopTransport?: { openExternalUrl?: (url: string) => Promise<boolean> }
    dshDockSettings?: { openExternalUrl?: (url: string) => Promise<boolean> }
  }
  const bridge = [host.dshDesktop, host.dshDesktopTransport, host.dshDockSettings]
    .find(candidate => typeof candidate?.openExternalUrl === 'function')
  if (bridge) {
    try {
      void Promise.resolve(bridge.openExternalUrl!(parsed.href)).then(opened => {
        if (opened === false) onFailure()
      }).catch(onFailure)
      return true
    } catch {
      return false
    }
  }
  if (host.dshDesktop || host.dshDesktopTransport || host.dshDockSettings) return false

  try {
    const popup = window.open('about:blank', '_blank')
    if (popup !== null && typeof popup === 'object') {
      popup.location.href = parsed.href
      return true
    }
  } catch {
    // Ignore window.open errors and try fallback
  }

  try {
    const popup = window.open(parsed.href, '_blank', 'noreferrer,noopener')
    return popup !== null
  } catch {
    return false
  }
}
