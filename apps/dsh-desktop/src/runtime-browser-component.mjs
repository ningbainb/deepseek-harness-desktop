import { join } from 'node:path'
import { homedir } from 'node:os'
import { createBrowserComponentManager } from './browser-component.mjs'
import { browserRuntimeEnvironment, BROWSER_HOST_MARKER, BROWSER_HOST_ENTRY } from './browser-host-bootstrap.mjs'
export { Config } from 'dsh-builtin-browser/browser-electron'

export const name = 'desktop-browser-component'
export const inject = ['browser']
export const BROWSER_COMPONENT_API_PREFIX = '/api/desktop/browser-component'

/** Connection admits and authenticates the carrier and limits these exact routes to owner Peers. */
export function registerBrowserComponentRoutes(ctx, manager) {
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  const routes = [
    { path: `${BROWSER_COMPONENT_API_PREFIX}/status`, methods: ['GET'], requestBody: 'buffered', fetch: async () => json(manager.status()) },
    { path: `${BROWSER_COMPONENT_API_PREFIX}/prepare`, methods: ['POST'], requestBody: 'buffered', fetch: async () => {
      // Return immediately so the same authenticated UI can observe progress and cancel.
      void manager.prepare().catch(() => {})
      return json(manager.status(), 202)
    } },
    { path: `${BROWSER_COMPONENT_API_PREFIX}/cancel`, methods: ['POST'], requestBody: 'buffered', fetch: async () => { manager.cancel(); return json(manager.status(), 202) } },
  ]
  for (const route of routes) ctx.effect(() => ctx.connection.fetch.register(route))
}

export function resolveBrowserComponentPaths(env = process.env) {
  const home = env.DSH_HOME || join(homedir(), '.dsh')
  return {
    componentRoot: env.DSH_DESKTOP_BROWSER_COMPONENT_ROOT || join(home, 'desktop-components', 'browser-electron'),
    cacheRoot: env.DSH_DESKTOP_BROWSER_COMPONENT_CACHE || join(home, 'cache', 'browser-component'),
  }
}

/** Use the vendor's actual public host spawn seam; no upstream files are changed. */
export function wrapBrowserComponentProvider(provider, manager, { env = process.env, execPath = process.execPath, resolveHostMain } = {}) {
  const claimedManaged = Object.hasOwn(env, BROWSER_HOST_MARKER) || Object.hasOwn(env, BROWSER_HOST_ENTRY)
  const inheritedManaged = claimedManaged && env.ELECTRON_PATH === execPath
  if (inheritedManaged) {
    // Reuse the established trusted-host realpath and marker validation. A
    // forged marker must never turn a user override into managed state.
    browserRuntimeEnvironment({ env, execPath, isPackaged: true, resolveHostMain })
  } else if (Object.hasOwn(env, 'ELECTRON_PATH')) return provider
  return new Proxy(provider, {
    get(target, property) {
      if (property === 'available') return () => true
      if (property === 'open') return async (...args) => {
        const ready = await manager.prepare()
        // RemoteElectronViewHost.start passes this field to ElectronChildClient,
        // whose constructor uses it before resolveElectronPath(). Keep selection
        // local to this host so HMR cannot mistake it for a user env override.
        target.host.spawnExecutable = ready.executablePath
        return target.open(...args)
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Replace only the browser-electron row specifier with this module in Desktop's patch. */
export async function apply(ctx, config = {}) {
  const vendor = await import('dsh-builtin-browser/browser-electron')
  const manager = createBrowserComponentManager(resolveBrowserComponentPaths())
  ctx.inject(['connection'], host => registerBrowserComponentRoutes(host, manager))
  const browser = ctx.browser
  const registration = new Proxy(browser, {
    get(target, property) {
      if (property === 'registerBrowserProvider') return provider => target.registerBrowserProvider(
        provider.host instanceof vendor.RemoteElectronViewHost ? wrapBrowserComponentProvider(provider, manager) : provider,
      )
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const adapted = new Proxy(ctx, {
    get(target, property) {
      if (property === 'browser') return registration
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  ctx.effect(() => () => manager.cancel())
  return vendor.apply(adapted, config)
}
