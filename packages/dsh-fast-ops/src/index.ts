import type { Context } from '@deepseek-ai/cordis'
import {
  getHostService,
  type UserScopeServiceLike,
  type WebRoutePeerLike,
  type WebRouteRequestLike,
  type WebRouteResponseLike,
  type WebServerLike,
} from './core/host-types.ts'
import {
  ROUTE_PREFIX,
  defaultSettings,
  normalizeSettings,
  type FastOpsSettings,
} from './core/settings.ts'
import { readSettings, resolveDshHome, writeSettingsAtomic } from './host/settings-store.ts'
import { FAST_OPS_RESULTS_SERVICE, FastOpsController, type FastOpsResultsService } from './host/tool-registry.ts'

export {
  INLINE_BYTE_OPTIONS,
  PACKAGE_ID,
  ROUTE_PREFIX,
  SETTINGS_FILE,
  TTL_MS_OPTIONS,
  defaultSettings,
  normalizeSettings,
} from './core/settings.ts'
export type { FastOpsSettings } from './core/settings.ts'
export { readSettings, resolveDshHome, writeSettingsAtomic } from './host/settings-store.ts'
export { resolveSafeWorkspacePath, sha256Hex } from './host/workspace-path.ts'
export { ResultCache } from './host/result-cache.ts'
export {
  buildCompactDiff,
  diffPreview,
  editFilesBatch,
  parseDelimitedTable,
  readFilesBatch,
  readTableFile,
  replaceAcrossFiles,
  searchWorkspace,
  statFile,
} from './host/file-ops.ts'
export {
  ALL_FAST_OPS_TOOLS,
  FAST_OPS_RESULTS_SERVICE,
  FastOpsController,
  RESIDENT_TOOLS,
  SPECIALIZED_TOOLS,
  type FastOpsResultsService,
} from './host/tool-registry.ts'

function sendJson(response: WebRouteResponseLike, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: WebRouteRequestLike): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === 'function') {
    for await (const chunk of request as AsyncIterable<Uint8Array | string>) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)
      total += buf.byteLength
      if (total > 64 * 1024) throw new Error('request body too large')
      chunks.push(buf)
    }
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  return text === '' ? {} : JSON.parse(text)
}

function isAuthorizedRequest(ctx: Context, request: WebRouteRequestLike, peer?: WebRoutePeerLike): boolean {
  const addr = request.socket?.remoteAddress
  if (addr !== undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return false
  if (request.headers['x-dsh-fast-ops'] !== '1') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  if (peer?.principal?.kind !== undefined && peer.principal.kind !== 'owner') return false

  const userScope = getHostService<UserScopeServiceLike>(ctx, 'userScope')
  if (userScope?.currentScope) {
    const current = userScope.currentScope()
    const scope = userScope.desktopScope?.()
    if (current?.source !== undefined && current.source !== 'desktop') return false
    if (current !== undefined && scope !== undefined && current.principalId !== scope.principalId) return false
  }
  return true
}

export function apply(ctx: Context): void {
  const home = resolveDshHome()
  let cachedSettings: FastOpsSettings = defaultSettings()

  const controller = new FastOpsController({
    ctx,
    getSettings: () => cachedSettings,
  })
  const results: FastOpsResultsService = { putText: input => controller.putText(input) }
  ctx.provide(FAST_OPS_RESULTS_SERVICE, results)

  void readSettings(home).then((loaded) => {
    cachedSettings = loaded
    controller.reapply()
  }).catch(() => {})

  const handleRequest = async (
    request: WebRouteRequestLike,
    response: WebRouteResponseLike,
    peer?: WebRoutePeerLike,
  ): Promise<void> => {
    if (!isAuthorizedRequest(ctx, request, peer)) {
      sendJson(response, 403, { error: 'forbidden' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://localhost')
    const method = (request.method ?? 'GET').toUpperCase()
    try {
      if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/state`) {
        sendJson(response, 200, {
          settings: cachedSettings,
          counters: controller.counters,
          astAvailable: await controller.isAstAvailable(),
          cache: controller.cache.stats(),
        })
        return
      }
      if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/settings`) {
        cachedSettings = await readSettings(home)
        sendJson(response, 200, { settings: cachedSettings })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/settings`) {
        const body = await readJsonBody(request)
        const saved = await writeSettingsAtomic(body, home)
        cachedSettings = saved.settings
        controller.reapply()
        sendJson(response, 200, saved)
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/cache/reclaim`) {
        const reclaimed = controller.cache.reclaimAll()
        sendJson(response, 200, { reclaimed, cache: controller.cache.stats() })
        return
      }
      sendJson(response, 404, { error: 'not-found' })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  ctx.effect(() => controller.mount())
  const mountWebServer = (webServer: WebServerLike): (() => void) => {
    if (typeof webServer.register === 'function') {
      return webServer.register({ path: ROUTE_PREFIX, kind: 'prefix', handler: handleRequest }) ?? (() => {})
    }
    const routes: Array<[string, string]> = [
      ['GET', `${ROUTE_PREFIX}/state`],
      ['GET', `${ROUTE_PREFIX}/settings`],
      ['POST', `${ROUTE_PREFIX}/settings`],
      ['POST', `${ROUTE_PREFIX}/cache/reclaim`],
    ]
    const stops = routes.map(([method, path]) => webServer.route?.(method, path, handleRequest)).filter((d): d is () => void => typeof d === 'function')
    return () => { for (const stop of stops) stop() }
  }

  const existingWebServer = getHostService<WebServerLike>(ctx, 'webServer')
  if (existingWebServer) {
    ctx.effect(() => mountWebServer(existingWebServer))
  } else if (typeof (ctx as unknown as { inject?: unknown }).inject === 'function') {
    (ctx as unknown as {
      inject: (deps: string[], cb: (scoped: { webServer?: WebServerLike }) => (() => void) | void) => void
    }).inject(['webServer'], (scoped) => {
      const ws = scoped?.webServer ?? getHostService<WebServerLike>(ctx, 'webServer')
      if (!ws) return
      return mountWebServer(ws)
    })
  }
}
