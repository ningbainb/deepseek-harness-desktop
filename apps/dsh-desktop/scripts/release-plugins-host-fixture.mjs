// Mounted only in this runner's temporary profile. Uses the vendor's public
// BrowserRuntime; it never replaces a provider, model response, UI or SDK state.
export const name = 'release-plugins-verification'
export const inject = ['connection', 'browser']
export const FIXTURE_PATH = '/api/release-plugins-fixture'

export function apply(ctx) {
  const expectedHome = process.env.DSH_RELEASE_PLUGINS_HOME
  if (!expectedHome || process.env.DSH_HOME !== expectedHome) throw new Error('Release fixture Home mismatch')
  const target = new URL(process.env.DSH_RELEASE_PLUGINS_PAGE)
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Browser fixture must be loopback')
  let browserSession
  const blocked = []
  const originalFetch = globalThis.fetch
  const guardedFetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (!['127.0.0.1', 'localhost', '[::1]', 'dsh.internal'].includes(url.hostname)) {
      blocked.push({ protocol: url.protocol, hostname: url.hostname })
      return Promise.reject(new Error('Release fixture denied external network egress'))
    }
    return originalFetch(input, init)
  }
  globalThis.fetch = guardedFetch
  ctx.effect(() => () => { if (globalThis.fetch === guardedFetch) globalThis.fetch = originalFetch }, 'release fixture: egress guard')
  ctx.effect(() => () => {
    if (browserSession !== undefined) return ctx.browser.close(browserSession)
  }, 'release fixture: owned browser cleanup')
  ctx.effect(() => ctx.connection.fetch.register({
    path: FIXTURE_PATH, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const { operation } = await request.json()
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])
        let value
        if (operation === 'status') {
          value = { homeMatches: process.env.DSH_HOME === expectedHome, blocked: [...blocked], browserSession }
        } else if (operation === 'open') {
          if (browserSession !== undefined) throw new Error('Fixture already owns a browser session')
          browserSession = await ctx.browser.open('release-plugins-visiblewindow')
          await ctx.browser.navigate(browserSession, { url: target.href }, signal)
          value = { session: browserSession, snapshot: await ctx.browser.snapshot(browserSession, signal) }
        } else {
          if (browserSession === undefined) throw new Error('No fixture-owned browser session')
          if (operation === 'dom') {
            const field = await ctx.browser.setValue(browserSession, {
              target: { by: 'css', value: '#fixture-name' }, value: 'release-plugins DOM value',
            }, signal)
            await ctx.browser.click(browserSession, { target: { by: 'css', value: '#fixture-submit' } }, signal)
            const observed = await ctx.browser.execute(browserSession, { script: `({
              url: location.href, visibility: document.visibilityState,
              value: document.querySelector('#fixture-name').value,
              result: document.querySelector('#fixture-result').textContent,
              inputs: document.documentElement.dataset.fixtureInputs,
              clicks: document.documentElement.dataset.fixtureClicks,
            })` }, signal)
            value = { field, observed, snapshot: await ctx.browser.snapshot(browserSession, signal) }
          } else if (operation === 'screenshot') {
            value = await ctx.browser.screenshot(browserSession, { format: 'png' }, signal)
          } else if (operation === 'close') {
            const session = browserSession
            await ctx.browser.close(session)
            value = { session, exists: ctx.browser.exists(session) }
            browserSession = undefined
          } else throw new Error('Unknown release fixture operation')
        }
        return Response.json({ ok: true, value })
      } catch (error) {
        return Response.json({ ok: false, error: String(error.message) }, { status: 500 })
      }
    },
  }), 'release fixture: authenticated public-browser probe')
}

// Only setup and observation through actual public Session services. Suggestions,
// projections, editor state and request results remain entirely vendor-owned.
export const CLIENT_SOURCE = `window.__ModuleLoader__.load({
  id: '@fixture/dsh-release-plugins', factory: () => ({
    inject: ['sessions', 'conversation', 'uiWorkspace'],
    apply(ctx) {
      const face = {
        async create(workspaceId) { const id = await ctx.sessions.create({ workspaceId }); ctx.uiWorkspace.openSession(id); return id; },
        snapshot(id) { return ctx.sessions.binding(id)?.session.getSnapshot(); },
      };
      globalThis.__releasePluginsFixture = face;
      ctx.effect(() => () => { if (globalThis.__releasePluginsFixture === face) delete globalThis.__releasePluginsFixture; });
    }
  })
});\n`
