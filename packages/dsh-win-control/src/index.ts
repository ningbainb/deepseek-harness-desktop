import type { Context } from '@deepseek-ai/cordis'
import type {
  ToolsServiceLike,
  UserScopeServiceLike,
  WebRoutePeerLike,
  WebRouteRequestLike,
  WebRouteResponseLike,
  WebServerLike,
} from './core/host-types.ts'
import {
  PINNED_WINDOWS_MCP_VERSION,
  ROUTE_PREFIX,
  defaultSettings,
  normalizeSettings,
  type WinControlSettings,
} from './core/settings.ts'
import {
  readSettings,
  resolveDshHome,
  writeSettingsAtomic,
} from './host/settings-store.ts'
import { probeDesktop } from './host/desktop-probe.ts'
import { probeMirrors, type MirrorProbeResult } from './host/mirrors.ts'
import {
  createToolchainInstaller,
  listManagedVersions,
  managedToolchainRoot,
  resolveActiveProfileDirectory,
  writeBridgeOverrideFile,
} from './host/toolchain.ts'
import { WinControlGate, collectBridgedCatalog } from './host/tool-gate.ts'

export {
  BRIDGE_ROW_ID,
  EXCLUDABLE_TOOLS,
  MIRROR_IDS,
  PACKAGE_ID,
  PINNED_WINDOWS_MCP_VERSION,
  ROUTE_PREFIX,
  SCREENSHOT_BACKENDS,
  SCREENSHOT_SCALES,
  defaultSettings,
  normalizeSettings,
} from './core/settings.ts'
export {
  readSettings,
  resolveDshHome,
  writeSettingsAtomic,
} from './host/settings-store.ts'
export type { WinControlSettings } from './core/settings.ts'
export { MIRROR_CANDIDATES, parseSimpleIndex, pickWheelEntry, probeMirrors } from './host/mirrors.ts'
export { PROBE_TIMEOUT_MS, UPSTREAM_UIA_ISSUE, describeProbe, parseProbeOutput, probeDesktop } from './host/desktop-probe.ts'
export {
  PROFILE_BLOCK_BEGIN,
  PROFILE_BLOCK_END,
  buildBridgeOverrideBlock,
  createToolchainInstaller,
  executableIn,
  listManagedVersions,
  managedExecutable,
  managedToolchainRoot,
  parseProcessLines,
  processesUnder,
  upsertBridgeOverride,
} from './host/toolchain.ts'
export {
  BRIDGE_TOOL_PREFIX,
  DOCTOR_TOOL_NAME,
  REVEAL_TOOL_NAME,
  WinControlGate,
  collectBridgedCatalog,
  isBridgedToolName,
} from './host/tool-gate.ts'

function getService<T>(ctx: Context, name: string): T | undefined {
  const candidate = ctx as unknown as { get?: (key: string) => unknown } & Record<string, unknown>
  try {
    return (candidate.get?.(name) ?? candidate[name]) as T | undefined
  } catch {
    return undefined
  }
}

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
  const maxBytes = 64 * 1024
  if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === 'function') {
    for await (const chunk of request as AsyncIterable<Buffer | Uint8Array | string>) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)
      total += buf.byteLength
      if (total > maxBytes) throw new Error('request body too large')
      chunks.push(buf)
    }
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  return text === '' ? {} : JSON.parse(text)
}

function isAuthorizedRequest(ctx: Context, request: WebRouteRequestLike, peer?: WebRoutePeerLike): boolean {
  const addr = request.socket?.remoteAddress
  if (addr !== undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return false
  if (request.headers['x-dsh-win-control'] !== '1') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  if (peer?.principal?.kind !== undefined && peer.principal.kind !== 'owner') return false

  const userScope = getService<UserScopeServiceLike>(ctx, 'userScope')
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
  let cachedSettings: WinControlSettings = defaultSettings()
  let lastMirrors: MirrorProbeResult[] = []

  void readSettings(home).then((loaded) => {
    cachedSettings = loaded
    gate.reapply()
  }).catch(() => {})

  const installer = createToolchainInstaller({ home })
  const gate = new WinControlGate({
    ctx,
    getSettings: () => cachedSettings,
    home,
  })

  const buildStatePayload = (sessionId?: string | null) => {
    const tools = getService<ToolsServiceLike>(ctx, 'tools')
    const catalog = collectBridgedCatalog(tools)
    const installed = listManagedVersions(managedToolchainRoot(home))
    return {
      platform: process.platform,
      pinnedVersion: PINNED_WINDOWS_MCP_VERSION,
      installedVersions: installed,
      bridgedToolCount: catalog.length,
      bridgedTools: catalog.map(item => item.name),
      sessionGranted: sessionId ? gate.isGrantedForSessionId(sessionId) : cachedSettings.plugin.defaultGrant,
      settings: cachedSettings,
      installer: installer.getSnapshot(),
      mirrors: lastMirrors,
    }
  }

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
        sendJson(response, 200, buildStatePayload(url.searchParams.get('sessionId')))
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
        const installed = listManagedVersions(managedToolchainRoot(home))
        const profileDir = resolveActiveProfileDirectory(home)
        if (installed.length > 0 && profileDir) {
          writeBridgeOverrideFile(profileDir, installed[0].executable, cachedSettings, installed[0].version)
        }
        gate.reapply()
        sendJson(response, 200, saved)
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/grant`) {
        const body = (await readJsonBody(request)) as { sessionId?: unknown; enabled?: unknown }
        if (typeof body.sessionId !== 'string' || body.sessionId === '' || typeof body.enabled !== 'boolean') {
          sendJson(response, 400, { error: 'invalid-grant' })
          return
        }
        gate.setSessionGrant(body.sessionId, body.enabled)
        sendJson(response, 200, { sessionId: body.sessionId, enabled: body.enabled })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/mirrors/probe`) {
        lastMirrors = await probeMirrors({ version: PINNED_WINDOWS_MCP_VERSION })
        sendJson(response, 200, { mirrors: lastMirrors })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/install`) {
        void installer.start({ settings: cachedSettings })
        sendJson(response, 202, { installer: installer.getSnapshot() })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/install/cancel`) {
        sendJson(response, 200, { installer: installer.cancel() })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/doctor`) {
        const result = await gate.buildDoctorReport()
        sendJson(response, 200, result)
        return
      }
      sendJson(response, 404, { error: 'not-found' })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  ctx.effect(() => gate.mount())
  ctx.effect(() => {
    const webServer = getService<WebServerLike>(ctx, 'webServer')
    if (!webServer) return () => {}
    if (typeof webServer.register === 'function') {
      return webServer.register({ path: ROUTE_PREFIX, kind: 'prefix', handler: handleRequest }) ?? (() => {})
    }
    const routes: Array<[string, string]> = [
      ['GET', `${ROUTE_PREFIX}/state`],
      ['GET', `${ROUTE_PREFIX}/settings`],
      ['POST', `${ROUTE_PREFIX}/settings`],
      ['POST', `${ROUTE_PREFIX}/grant`],
      ['POST', `${ROUTE_PREFIX}/mirrors/probe`],
      ['POST', `${ROUTE_PREFIX}/install`],
      ['POST', `${ROUTE_PREFIX}/install/cancel`],
      ['POST', `${ROUTE_PREFIX}/doctor`],
    ]
    const stops = routes.map(([method, path]) => webServer.route?.(method, path, handleRequest)).filter((d): d is () => void => typeof d === 'function')
    return () => { for (const stop of stops) stop() }
  })
}
