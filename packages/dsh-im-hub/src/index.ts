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
  CHANNEL_IDS,
  ROUTE_PREFIX,
  defaultSettings,
  type ChannelId,
  type ImHubSettings,
} from './core/settings.ts'
import { ImHubManager } from './host/hub.ts'
import type { TurnRunner } from './host/core/harness-bridge.ts'
import type { FetchLike, WebSocketFactory } from './host/core/types.ts'
import { readSettings, resolveDshHome, writeSettingsAtomic } from './host/settings-store.ts'

export {
  CHANNEL_IDS,
  PACKAGE_ID,
  ROUTE_PREFIX,
  SECRET_MASK,
  SETTINGS_FILE,
  defaultAccessPolicy,
  defaultSettings,
  normalizeSettings,
  redactSettingsForClient,
} from './core/settings.ts'
export type {
  AccessMode,
  BusyMode,
  ChannelAccessPolicy,
  ChannelId,
  ChannelRuntimeState,
  ChannelStatusSnapshot,
  DiagnosticEvent,
  DingTalkChannelConfig,
  FeishuChannelConfig,
  ImHubSettings,
  WebhookChannelConfig,
  WeComChannelConfig,
} from './core/settings.ts'
export { readSettings, resolveDshHome, writeSettingsAtomic } from './host/settings-store.ts'
export { evaluateAccess, isApprovalAuthorized } from './host/core/access-policy.ts'
export { ConversationQueue } from './host/core/conversation-queue.ts'
export { formatHelpMessage, parseControlCommand, splitMessageChunks } from './host/core/commands.ts'
export { ApprovalBridge, summarizeToolRequest } from './host/core/approval-bridge.ts'
export { HarnessBridge, buildConversationKey } from './host/core/harness-bridge.ts'
export { FeishuAdapter, extractFeishuTextContent, resolveFeishuBaseUrl } from './host/channels/feishu.ts'
export { DingTalkAdapter } from './host/channels/dingtalk.ts'
export {
  WeComAdapter,
  computeWeComSignature,
  decryptWeComPayload,
  encryptWeComPayload,
  extractXmlTag,
  verifyWeComSignature,
} from './host/channels/wecom.ts'
export {
  GenericWebhookAdapter,
  signWebhookPayload,
  verifyWebhookSignature,
} from './host/channels/webhook.ts'
export { ImHubManager } from './host/hub.ts'
export type { ImHubStateSnapshot } from './host/hub.ts'

export interface ApplyImHubOptions {
  home?: string
  fetchImpl?: FetchLike
  webSocketFactory?: WebSocketFactory
  turnRunner?: TurnRunner
  nowMs?: () => number
  initialSettings?: ImHubSettings
}

function sendJson(response: WebRouteResponseLike, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

async function readTextBody(request: WebRouteRequestLike, maxBytes = 256 * 1024): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === 'function') {
    for await (const chunk of request as AsyncIterable<Uint8Array | string>) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)
      total += buf.byteLength
      if (total > maxBytes) throw new Error('request body too large')
      chunks.push(buf)
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

function isAuthorizedAdminRequest(
  ctx: Context,
  request: WebRouteRequestLike,
  peer?: WebRoutePeerLike,
): boolean {
  const addr = request.socket?.remoteAddress
  if (addr !== undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return false
  if (request.headers['x-dsh-im-hub'] !== '1') return false
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

function isChannelId(value: unknown): value is ChannelId {
  return typeof value === 'string' && (CHANNEL_IDS as readonly string[]).includes(value)
}

export function apply(ctx: Context, options: ApplyImHubOptions = {}): ImHubManager {
  const home = options.home ?? resolveDshHome()
  const hub = new ImHubManager({
    ctx,
    initialSettings: options.initialSettings ?? defaultSettings(),
    fetchImpl: options.fetchImpl,
    webSocketFactory: options.webSocketFactory,
    turnRunner: options.turnRunner,
    nowMs: options.nowMs,
  })

  if (!options.initialSettings) {
    void readSettings(home)
      .then((loaded) => hub.applySettings(loaded))
      .catch(() => {})
  } else {
    void hub.applySettings(options.initialSettings).catch(() => {})
  }

  const handleRequest = async (
    request: WebRouteRequestLike,
    response: WebRouteResponseLike,
    peer?: WebRoutePeerLike,
  ): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const method = (request.method ?? 'GET').toUpperCase()

    // External inbound IM webhook routes use their own cryptographic signature verification.
    if (url.pathname === `${ROUTE_PREFIX}/webhook/wecom`) {
      try {
        const rawBody = method === 'GET' ? '' : await readTextBody(request)
        const out = await hub.handleWebhook('wecom', {
          method,
          url: request.url ?? url.pathname,
          headers: request.headers,
          rawBody,
        })
        response.writeHead(out.status, {
          'cache-control': 'no-store',
          ...(out.headers ?? { 'content-type': 'text/plain; charset=utf-8' }),
        })
        response.end(out.body)
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    if (url.pathname === `${ROUTE_PREFIX}/webhook/generic`) {
      try {
        const rawBody = await readTextBody(request)
        const out = await hub.handleWebhook('webhook', {
          method,
          url: request.url ?? url.pathname,
          headers: request.headers,
          rawBody,
        })
        response.writeHead(out.status, {
          'cache-control': 'no-store',
          ...(out.headers ?? { 'content-type': 'application/json; charset=utf-8' }),
        })
        response.end(out.body)
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    if (!isAuthorizedAdminRequest(ctx, request, peer)) {
      sendJson(response, 403, { error: 'forbidden' })
      return
    }

    try {
      if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/state`) {
        sendJson(response, 200, hub.getStateSnapshot())
        return
      }
      if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/settings`) {
        const loaded = await readSettings(home)
        await hub.applySettings(loaded)
        sendJson(response, 200, { settings: hub.getStateSnapshot().settings })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/settings`) {
        const rawText = await readTextBody(request)
        const body = rawText.trim() === '' ? {} : JSON.parse(rawText)
        const saved = await writeSettingsAtomic(body, home)
        await hub.applySettings(saved.settings)
        sendJson(response, 200, {
          settings: hub.getStateSnapshot().settings,
          problems: saved.problems,
        })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/channel/test`) {
        const rawText = await readTextBody(request)
        const body = (rawText.trim() === '' ? {} : JSON.parse(rawText)) as { channel?: unknown }
        if (!isChannelId(body.channel)) {
          sendJson(response, 400, { error: 'invalid channel' })
          return
        }
        const result = await hub.testChannel(body.channel)
        sendJson(response, 200, result)
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/channel/restart`) {
        const rawText = await readTextBody(request)
        const body = (rawText.trim() === '' ? {} : JSON.parse(rawText)) as { channel?: unknown }
        if (!isChannelId(body.channel)) {
          sendJson(response, 400, { error: 'invalid channel' })
          return
        }
        const status = await hub.restartChannel(body.channel)
        sendJson(response, 200, { status })
        return
      }
      if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/approvals/decision`) {
        const rawText = await readTextBody(request)
        const body = (rawText.trim() === '' ? {} : JSON.parse(rawText)) as {
          id?: unknown
          decision?: unknown
        }
        if (
          typeof body.id !== 'string'
          || (body.decision !== 'allowed-once' && body.decision !== 'rejected')
        ) {
          sendJson(response, 400, { error: 'invalid decision' })
          return
        }
        const accepted = hub.approvalBridge.resolveById(body.id, body.decision)
        sendJson(response, accepted ? 200 : 409, { accepted })
        return
      }
      sendJson(response, 404, { error: 'not-found' })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  ctx.effect(() => hub.install(ctx))
  ctx.effect(() => {
    const webServer = getHostService<WebServerLike>(ctx, 'webServer')
    if (!webServer) return () => {}
    if (typeof webServer.register === 'function') {
      return webServer.register({ path: ROUTE_PREFIX, kind: 'prefix', handler: handleRequest }) ?? (() => {})
    }
    const routes: Array<[string, string]> = [
      ['GET', `${ROUTE_PREFIX}/state`],
      ['GET', `${ROUTE_PREFIX}/settings`],
      ['POST', `${ROUTE_PREFIX}/settings`],
      ['POST', `${ROUTE_PREFIX}/channel/test`],
      ['POST', `${ROUTE_PREFIX}/channel/restart`],
      ['POST', `${ROUTE_PREFIX}/approvals/decision`],
      ['GET', `${ROUTE_PREFIX}/webhook/wecom`],
      ['POST', `${ROUTE_PREFIX}/webhook/wecom`],
      ['POST', `${ROUTE_PREFIX}/webhook/generic`],
    ]
    const stops = routes
      .map(([method, path]) => webServer.route?.(method, path, handleRequest))
      .filter((d): d is () => void => typeof d === 'function')
    return () => {
      for (const stop of stops) stop()
    }
  })

  return hub
}
