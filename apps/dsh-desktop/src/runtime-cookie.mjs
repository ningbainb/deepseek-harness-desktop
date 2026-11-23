// Published plugins may still use the RC Connection authentication method.
export function installLegacyConnectionAdmission(ctx) {
  return ctx.inject(['connection', 'connection.authentication'], scope => {
    const connection = scope.get('connection')
    if (typeof connection.requestRejection === 'function' || typeof connection.admit !== 'function') return
    const requestRejection = request => {
      const result = connection.admit(request)
      return 'rejection' in result ? result.rejection : undefined
    }
    scope.effect(() => {
      Object.defineProperty(connection, 'requestRejection', { configurable: true, value: requestRejection })
      return () => { delete connection.requestRejection }
    }, 'desktop: preserve legacy Connection admission')
  })
}

/** Preserve the official in-process browser session while carrying narrow client cookies. */
export function mergeDesktopPipeCookies(browserCookie, sourceCookie) {
  if (typeof sourceCookie !== 'string' || sourceCookie.trim() === '') return browserCookie
  return `${browserCookie}; ${sourceCookie}`
}

export function createDesktopPipeSessionCookie(ctx) {
  let sessionCookiePromise
  return () => {
    sessionCookiePromise ??= (async () => {
      const launchUrl = ctx.webServer.authenticatedEntryUrl?.() ?? ctx.connection.authenticatedUrl(`http://${ctx.webServer.host}/`)
      const response = await ctx.webServer.authorizeIndex(new Request(launchUrl))
      const cookie = response?.headers.get('set-cookie')?.split(';', 1)[0]
      if (response?.status !== 303 || cookie === undefined || cookie === '') {
        throw new Error('desktop pipe failed to establish the official browser session')
      }
      return cookie
    })()
    return sessionCookiePromise
  }
}

export async function *openDesktopPipeWebSocket(webServer, endpoint, payload, input, signal, sessionCookie) {
  signal.throwIfAborted()
  const cookie = await sessionCookie()
  signal.throwIfAborted()
  yield *webServer.openDuplex(endpoint, payload, input, signal, cookie)
}
