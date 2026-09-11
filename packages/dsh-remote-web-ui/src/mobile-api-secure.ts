/**
 * Owner-aware mobile data channel. Authentication is the paired cookie;
 * authorization is performed by dsh-user-scope before every resource access.
 * The underlying ApiProxy is never exposed directly to a remote principal.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { MobileApiProxy } from './mobile-contract.ts'
import type { PairingService } from './pairing.ts'
import {
  canAccessSession,
  canAccessWorkspace,
  hasIdentityOverride,
  isAuthorizedMuxFrame,
  isRecord,
  resolveMobileScope,
  sessionIdFromPayload,
  type MobileScopeAuthority,
  workspaceIdFromPayload,
} from './mobile-authorization.ts'

/** Methods the phone surface may call. */
const MOBILE_ALLOWLIST = new Set([
  'workspace.list',
  'session.create',
  'session.list',
  'session.history',
  'session.search',
  'session.prompt',
  'session.models',
  'session.selectModel',
  'session.rename',
])

/** Locally answered display-preference method. */
const MOBILE_PREFERENCES_METHOD = 'mobile.preferences'
const SESSION_PAGE_SIZE = 20
const DEFAULT_EVENTS_HEARTBEAT_MS = 15_000
const MOBILE_API_PREFIX = '/m/api'
const MOBILE_API_METHOD_PREFIX = `${MOBILE_API_PREFIX}/`

/** Mobile API route paths. */
export const MOBILE_API_PATHS = {
  events: '/m/api/events.mux',
} as const

/** Route dependencies; user-scope is mandatory for the production surface. */
export interface MobileApiDeps {
  service: PairingService
  apiProxy: MobileApiProxy
  userScope: MobileScopeAuthority
  mobileEnterToSend: () => boolean
  /** Host-side search already restricted to the supplied authorized session IDs. */
  sessionSearch?: MobileScopedSearch
  eventsHeartbeatMs?: number
}

export interface MobileScopedSearchResult {
  sessionId: string
  snippet: string
}

export type MobileScopedSearch = (
  query: string,
  sessionIds: readonly string[],
  signal: AbortSignal,
) => Promise<{
  items: readonly MobileScopedSearchResult[]
  hasMore: boolean
}>

type MobileResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

interface MobileResponse {
  type: 'server-response'
  rpcId: string
  result: MobileResult
}

function response(rpcId: string, result: MobileResult): MobileResponse {
  return { type: 'server-response', rpcId, result }
}

function denied(rpcId: string, code = 'not-found'): MobileResponse {
  return response(rpcId, { ok: false, error: { code, message: 'resource is unavailable' } })
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

function writeRpc(res: ServerResponse, rpcId: string, result: MobileResult): void {
  writeJson(res, 200, response(rpcId, result))
}

function parseRpcId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.rpcId === 'string' && value.rpcId.length > 0 && value.rpcId.length <= 256
    ? value.rpcId
    : undefined
}

function safeProxyResponse(rpcId: string, value: unknown): MobileResponse {
  if (!isRecord(value) || !isRecord(value.result)) return denied(rpcId, 'internal')
  if (value.result.ok === true) return response(rpcId, { ok: true, value: value.result.value })
  // Never forward ApiProxy error messages/details: they may reveal resource
  // existence, paths, provider state, or other Host-only information.
  return denied(rpcId, 'internal')
}

/**
 * Re-check the live process pairing before and after every awaited Host call.
 * The persistent user-scope revoke is intentionally asynchronous at the
 * pairing boundary; the in-memory pairing table is the synchronous kill
 * switch that closes the small window for an already-started unary request.
 */
function isCurrentMobileScope(
  service: PairingService,
  userScope: MobileScopeAuthority,
  deviceId: string,
  scope: import('@ningbainb/dsh-user-scope').AccessScope,
): boolean {
  try {
    if (!service.hasDevice(deviceId)) return false
    const pairedPrincipal = service.principalForDevice(deviceId)
    if (pairedPrincipal !== scope.principalId) return false
    return userScope.canAccess(scope, { kind: 'principal', principalId: scope.principalId }).allowed
  } catch {
    return false
  }
}

function sessionListCursor(value: number, sessionId: string): string {
  return `${value}:${sessionId}`
}

function parseSessionListCursor(value: unknown): { updatedAt: number; sessionId: string } | undefined {
  if (typeof value !== 'string') return undefined
  const separator = value.indexOf(':')
  if (separator < 0) return undefined
  const updatedAt = Number(value.slice(0, separator))
  const sessionId = value.slice(separator + 1)
  const parsedSessionId = sessionIdFromPayload({ sessionId })
  return Number.isFinite(updatedAt) && parsedSessionId !== undefined
    ? { updatedAt, sessionId: parsedSessionId }
    : undefined
}

function afterCursor(row: { updatedAt: number; sessionId: string }, cursor: { updatedAt: number; sessionId: string }): boolean {
  return row.updatedAt < cursor.updatedAt
    || (row.updatedAt === cursor.updatedAt && row.sessionId > cursor.sessionId)
}

/**
 * Build the owner-aware mobile routes. The only resource-bearing calls that
 * reach ApiProxy have already passed a current scope check.
 */
export function makeMobileApiRoutes(deps: MobileApiDeps): WebRoute[] {
  const { service, apiProxy, userScope, mobileEnterToSend, sessionSearch } = deps
  const eventsHeartbeatMs = deps.eventsHeartbeatMs ?? DEFAULT_EVENTS_HEARTBEAT_MS

  const handleMethod = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const resolved = resolveMobileScope(req, service, userScope)
    if (resolved === undefined) {
      writeJson(res, 403, { ok: false, error: { code: 'unpaired', message: 'mobile session is not paired' } })
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    if (!pathname.startsWith(MOBILE_API_METHOD_PREFIX)) {
      writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown mobile api path' } })
      return
    }
    const method = pathname.slice(MOBILE_API_METHOD_PREFIX.length)
    if (!MOBILE_ALLOWLIST.has(method) && method !== MOBILE_PREFERENCES_METHOD) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'method is not exposed to the mobile surface' } })
      return
    }
    let envelope: unknown
    try {
      envelope = await readJsonBody(req)
    } catch {
      writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'invalid json body' } })
      return
    }
    const rpcId = parseRpcId(envelope)
    if (rpcId === undefined) {
      writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'missing rpcId' } })
      return
    }
    const payload = isRecord(envelope) ? envelope.payload : undefined
    if (hasIdentityOverride(payload)) {
      writeRpc(res, rpcId, { ok: false, error: { code: 'forbidden', message: 'identity is host-owned' } })
      return
    }
    const isLive = (): boolean => isCurrentMobileScope(service, userScope, resolved.deviceId, resolved.scope)
    if (!isLive()) {
      writeRpc(res, rpcId, denied(rpcId).result)
      return
    }
    if (method === MOBILE_PREFERENCES_METHOD) {
      writeRpc(res, rpcId, { ok: true, value: { mobileEnterToSend: mobileEnterToSend() } })
      return
    }
    try {
      const result = await userScope.run(resolved.scope, () => dispatch({ apiProxy, userScope, scope: resolved.scope, method, payload, rpcId, sessionSearch, isLive }))
      writeJson(res, 200, isLive() ? result : denied(rpcId))
    } catch {
      writeRpc(res, rpcId, { ok: false, error: { code: 'internal', message: 'request failed' } })
    }
  }

  const handleEvents = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end()
      return
    }
    const resolved = resolveMobileScope(req, service, userScope)
    if (resolved === undefined) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    const rawSessionId = new URL(req.url ?? '/', 'http://x').searchParams.get('sessionId')
    const requestedSessionId = rawSessionId === null ? undefined : sessionIdFromPayload({ sessionId: rawSessionId })
    if ((rawSessionId !== null && requestedSessionId === undefined)
      || (requestedSessionId !== undefined && !canAccessSession(userScope, resolved.scope, requestedSessionId))) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const controller = new AbortController()
    let closed = false
    const heartbeat = setInterval(() => {
      if (closed) return
      try { res.write(': ping\n\n') } catch { /* close event performs cleanup */ }
    }, eventsHeartbeatMs)
    const onClose = (): void => {
      if (closed) return
      closed = true
      controller.abort()
      clearInterval(heartbeat)
    }
    const revokeDisposer = service.onDeviceRevoked(deviceId => {
      if (deviceId !== resolved.deviceId) return
      onClose()
      if (!res.writableEnded) res.end()
    })
    res.on('close', onClose)
    req.on('close', onClose)
    try {
      const frames = userScope.run(resolved.scope, () => apiProxy.events.mux({
        rpcId: `mobile-mux-${Date.now().toString(36)}`,
        payload: requestedSessionId === undefined ? {} : { sessionId: requestedSessionId },
      }, controller.signal))
      for await (const frame of frames) {
        if (closed) break
        if (!isAuthorizedMuxFrame(frame, userScope, resolved.scope)) continue
        res.write(`data: ${JSON.stringify({
          type: 'server-request',
          rpcId: frame.rpcId,
          method: 'events.mux',
          payload: frame.payload,
        })}\n\n`)
      }
    } catch {
      // The stream ending is a transport event; no Host error is forwarded.
    } finally {
      revokeDisposer()
      controller.abort()
      clearInterval(heartbeat)
    }
    if (!closed) res.end()
  }

  return [
    { kind: 'prefix', path: MOBILE_API_PREFIX, handler: handleMethod },
    { kind: 'exact', path: MOBILE_API_PATHS.events, handler: handleEvents },
  ]
}

interface DispatchDeps {
  apiProxy: MobileApiProxy
  userScope: MobileScopeAuthority
  scope: import('@ningbainb/dsh-user-scope').AccessScope
  method: string
  payload: unknown
  rpcId: string
  sessionSearch?: MobileScopedSearch
  isLive: () => boolean
}

async function dispatch(deps: DispatchDeps): Promise<MobileResponse> {
  const { apiProxy, userScope, scope, method, payload, rpcId, sessionSearch, isLive } = deps
  if (!isLive()) return denied(rpcId)
  if (method === 'workspace.list') {
    const raw = await apiProxy.workspace.list({ rpcId, payload: {} })
    if (!isLive()) return denied(rpcId)
    if (!raw.result.ok) return safeProxyResponse(rpcId, raw)
    const value = raw.result.value
    const items = value.items.filter(workspace => {
      const workspaceId = workspaceIdFromPayload(workspace)
      return workspaceId !== undefined && canAccessWorkspace(userScope, scope, workspaceId)
    }).map(workspace => ({
      ...workspace,
      sessionIds: workspace.sessionIds.filter(sessionId => {
        const parsed = sessionIdFromPayload({ sessionId })
        return parsed !== undefined && canAccessSession(userScope, scope, parsed)
      }),
    }))
    const archivedSessionIds = value.archivedSessionIds.filter(sessionId => {
      const parsed = sessionIdFromPayload({ sessionId })
      return parsed !== undefined && canAccessSession(userScope, scope, parsed)
    })
    return response(rpcId, { ok: true, value: { items, archivedSessionIds } })
  }

  if (method === 'session.create') {
    const workspaceId = workspaceIdFromPayload(payload)
    const canUseWorkspace = (): boolean => isLive() && workspaceId !== undefined && canAccessWorkspace(userScope, scope, workspaceId)
    if (!canUseWorkspace()) return denied(rpcId)
    const record = isRecord(payload) ? payload : {}
    // Mobile creation is deliberately workspace-only. A phone must not be
    // able to name an arbitrary local working directory, even if the Host
    // create contract accepts an optional cwd for trusted local callers.
    if (Object.prototype.hasOwnProperty.call(record, 'cwd')) return denied(rpcId, 'forbidden')
    const raw = await apiProxy.sessions.create({ rpcId, payload: { workspaceId } })
    if (!canUseWorkspace()) return denied(rpcId)
    if (!raw.result.ok) return safeProxyResponse(rpcId, raw)
    const created = raw.result.value
    const sessionId = sessionIdFromPayload(created)
    if (sessionId === undefined) return denied(rpcId, 'internal')
    try {
      await userScope.registerSession({ sessionId, workspaceId, createdByPrincipalId: scope.principalId })
    } catch {
      // The Host session may exist, but it is never returned to the remote
      // principal unless ownership registration committed successfully.
      return denied(rpcId, 'scope-unavailable')
    }
    if (!canUseWorkspace()) return denied(rpcId)
    return response(rpcId, {
      ok: true,
      value: {
        sessionId,
        ...(isRecord(created) && typeof created.agentPreset === 'string' ? { agentPreset: created.agentPreset } : {}),
      },
    })
  }

  if (method === 'session.list') {
    const record = isRecord(payload) ? payload : {}
    const cursorValue = record.cursor
    if (cursorValue !== undefined && typeof cursorValue !== 'string') return denied(rpcId, 'bad-request')
    const cursor = cursorValue === undefined ? undefined : parseSessionListCursor(cursorValue)
    if (cursorValue !== undefined && cursor === undefined) return denied(rpcId, 'bad-request')
    // The official v1 sessions.list cursor is reserved/unimplemented. The
    // cursor here belongs to this filtered mobile projection, so never send
    // it to the Host. Fetch, authorize, sort, and page locally; otherwise a
    // future Host pagination implementation could page before our filter and
    // leak ordering information or skip an authorized row behind a hidden one.
    const raw = await apiProxy.sessions.list({ rpcId, payload: {} })
    if (!isLive()) return denied(rpcId)
    if (!raw.result.ok) return safeProxyResponse(rpcId, raw)
    const visible = new Set(userScope.visibleSessions(scope).map(item => item.sessionId))
    const items = raw.result.value.items.filter(item => {
      const parsed = sessionIdFromPayload(item)
      return parsed !== undefined && visible.has(parsed)
    }).map(item => ({ ...item, sessionId: sessionIdFromPayload(item)! }))
    items.sort((a, b) => b.updatedAt - a.updatedAt || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0))
    const start = cursor === undefined ? 0 : items.findIndex(item => afterCursor({ updatedAt: item.updatedAt, sessionId: item.sessionId }, cursor))
    const offset = start < 0 ? items.length : start
    const page = items.slice(offset, offset + SESSION_PAGE_SIZE)
    const last = page.at(-1)
    const nextCursor = last !== undefined && offset + page.length < items.length
      ? sessionListCursor(last.updatedAt, last.sessionId)
      : undefined
    return response(rpcId, { ok: true, value: { items: page, hasMore: nextCursor !== undefined, ...(nextCursor === undefined ? {} : { nextCursor }) } })
  }

  if (method === 'session.search') {
    const record = isRecord(payload) ? payload : {}
    const query = record.query
    if (typeof query !== 'string' || query.trim() === '' || query.length > 2_000) return denied(rpcId, 'bad-request')
    if (sessionSearch === undefined) return denied(rpcId, 'forbidden')
    const sessionIds = [...new Set(userScope.visibleSessions(scope).map(item => item.sessionId))]
    // Search is optional. A missing or unhealthy index must be indistinguish-
    // able from a disabled capability to the remote principal; returning an
    // internal engine error would invite callers to probe deployment state.
    let scoped: { items: readonly MobileScopedSearchResult[]; hasMore: boolean }
    try {
      scoped = await sessionSearch(query, sessionIds, new AbortController().signal)
    } catch {
      return denied(rpcId, 'forbidden')
    }
    if (!isLive()) return denied(rpcId)
    const seen = new Set<string>()
    const items: MobileScopedSearchResult[] = []
    for (const item of scoped.items) {
      const sessionId = sessionIdFromPayload(item)
      if (sessionId === undefined || seen.has(sessionId) || !canAccessSession(userScope, scope, sessionId)) continue
      if (typeof item.snippet !== 'string') continue
      seen.add(sessionId)
      items.push({ sessionId, snippet: Array.from(item.snippet).slice(0, 240).join('') })
      if (items.length === 20) break
    }
    return response(rpcId, { ok: true, value: { items, hasMore: items.length > 0 && scoped.hasMore === true } })
  }

  const sessionId = sessionIdFromPayload(payload)
  const canUseSession = (): boolean => isLive() && sessionId !== undefined && canAccessSession(userScope, scope, sessionId)
  if (!canUseSession()) return denied(rpcId)
  const record = isRecord(payload) ? { ...payload, sessionId } : { sessionId }
  const request = { rpcId, payload: record }
  if (method === 'session.history') {
    if (!canUseSession()) return denied(rpcId)
    const raw = await apiProxy.sessions.history(request as never)
    return canUseSession() ? safeProxyResponse(rpcId, raw) : denied(rpcId)
  }
  if (method === 'session.prompt') {
    if (!canUseSession()) return denied(rpcId)
    const raw = await apiProxy.sessions.prompt(request as never)
    return canUseSession() ? safeProxyResponse(rpcId, raw) : denied(rpcId)
  }
  if (method === 'session.models') {
    if (!canUseSession()) return denied(rpcId)
    const raw = await apiProxy.sessions.models(request as never)
    return canUseSession() ? safeProxyResponse(rpcId, raw) : denied(rpcId)
  }
  if (method === 'session.selectModel') {
    if (!canUseSession()) return denied(rpcId)
    const raw = await apiProxy.sessions.selectModel(request as never)
    return canUseSession() ? safeProxyResponse(rpcId, raw) : denied(rpcId)
  }
  if (method === 'session.rename') {
    if (!canUseSession()) return denied(rpcId)
    const raw = await apiProxy.sessions.rename(request as never)
    return canUseSession() ? safeProxyResponse(rpcId, raw) : denied(rpcId)
  }
  return denied(rpcId, 'forbidden')
}

/** Read a bounded request body. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > 64 * 1024) throw new Error('body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
