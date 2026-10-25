/** Preserve the official in-process browser session while carrying narrow client cookies. */
export function mergeDesktopPipeCookies(browserCookie, sourceCookie) {
  if (typeof sourceCookie !== 'string' || sourceCookie.trim() === '') return browserCookie
  return `${browserCookie}; ${sourceCookie}`
}

export function createDesktopPipeSessionCookie(ctx) {
  let sessionCookiePromise
  return () => {
    sessionCookiePromise ??= (async () => {
      const launchUrl = ctx.connection.authenticatedUrl(`http://${ctx.webServer.host}/`)
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
