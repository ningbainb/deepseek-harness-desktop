/**
 * Browser-safe and Electron-Desktop-compatible external URL opener.
 *
 * In Electron Desktop, renderer window popups are blocked by default for security,
 * but an 'about:blank' popup bootstrap is allowed and intercepts subsequent HTTPS
 * navigation, delegating it to shell.openExternal (opening in the system browser)
 * and destroying the temporary window immediately.
 *
 * In standard browser environments, window.open('about:blank') followed by
 * assigning location.href opens the target URL in a new tab.
 */
export function openExternalUrl(href: string): boolean {
  if (typeof window === 'undefined' || typeof href !== 'string') return false
  let parsed: URL
  try {
    parsed = new URL(href)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  if (parsed.username !== '' || parsed.password !== '') return false

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
