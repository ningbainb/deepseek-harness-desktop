import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  ROUTE_PREFIX,
  SECRET_MASK,
  apply,
  defaultSettings,
  signWebhookPayload,
} from '../src/index.ts'
import type { WebRouteRequestLike, WebRouteResponseLike, WebRouteSpec } from '../src/core/host-types.ts'

async function dispatchRoute(
  handler: WebRouteSpec['handler'],
  options: {
    method?: string
    url: string
    headers?: Record<string, string>
    remoteAddress?: string
    peerKind?: string
    body?: string
  },
): Promise<{ status: number; body: string; json: () => Record<string, unknown> }> {
  let status = 500
  let body = ''
  const req: WebRouteRequestLike = {
    method: options.method ?? 'GET',
    url: options.url,
    headers: options.headers ?? {},
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (options.body) yield options.body
    },
  }
  const res: WebRouteResponseLike = {
    writeHead: (code) => { status = code },
    end: (chunk = '') => { body = chunk },
  }
  await handler(req, res, { principal: { kind: options.peerKind ?? 'owner' } })
  return {
    status,
    body,
    json: () => JSON.parse(body) as Record<string, unknown>,
  }
}

describe('dsh-im-hub HTTP routes and end-to-end dispatch', () => {
  it('enforces desktop loopback owner auth on admin routes and allows signed external webhooks', async () => {
    const home = await mkdtemp(join(tmpdir(), 'im-hub-routes-'))
    const outboundCalls: Array<{ url: string; body: string }> = []
    let registeredRoute: WebRouteSpec | undefined
    let scopeSource = 'desktop'

    const fakeCtx = {
      effect: (cb: () => () => void) => { cb() },
      on: () => () => {},
      get: (name: string) => {
        if (name === 'webServer') {
          return {
            register: (spec: WebRouteSpec) => {
              registeredRoute = spec
              return () => {}
            },
          }
        }
        if (name === 'userScope') {
          return {
            desktopScope: () => ({ principalId: 'owner-1' }),
            currentScope: () => ({ source: scopeSource, principalId: 'owner-1' }),
          }
        }
        return undefined
      },
    } as unknown as Context

    const nowMs = 1_700_000_000_000
    const initial = defaultSettings()
    initial.enabled = true
    initial.channels.webhook.enabled = true
    initial.channels.webhook.signingSecret = 'secret-xyz'
    initial.channels.webhook.outboundUrl = 'https://callback.example/im'
    initial.channels.webhook.access.allowUsers = ['u-allow']

    try {
      const hub = apply(fakeCtx, {
        home,
        initialSettings: initial,
        nowMs: () => nowMs,
        turnRunner: async (msg) => `Echo: ${msg.text}`,
        fetchImpl: async (url, init) => {
          outboundCalls.push({ url: String(url), body: String(init?.body ?? '') })
          return new Response('ok', { status: 200 })
        },
      })

      expect(registeredRoute).toBeDefined()
      const handler = registeredRoute!.handler

      // Rejects missing custom header / cross-site / remote scope
      expect((await dispatchRoute(handler, { url: `${ROUTE_PREFIX}/state`, headers: {} })).status).toBe(403)
      expect((await dispatchRoute(handler, {
        url: `${ROUTE_PREFIX}/state`,
        headers: { 'x-dsh-im-hub': '1', 'sec-fetch-site': 'cross-site' },
      })).status).toBe(403)
      scopeSource = 'remote'
      expect((await dispatchRoute(handler, {
        url: `${ROUTE_PREFIX}/state`,
        headers: { 'x-dsh-im-hub': '1' },
      })).status).toBe(403)
      scopeSource = 'desktop'

      // Desktop owner reads redacted state
      const stateRes = await dispatchRoute(handler, {
        url: `${ROUTE_PREFIX}/state`,
        headers: { 'x-dsh-im-hub': '1' },
      })
      expect(stateRes.status).toBe(200)
      const stateJson = stateRes.json()
      expect((stateJson.settings as typeof initial).channels.webhook.signingSecret).toBe(SECRET_MASK)

      // Test channel via admin endpoint
      const testRes = await dispatchRoute(handler, {
        method: 'POST',
        url: `${ROUTE_PREFIX}/channel/test`,
        headers: { 'x-dsh-im-hub': '1' },
        body: JSON.stringify({ channel: 'webhook' }),
      })
      expect(testRes.status).toBe(200)
      expect(testRes.json().ok).toBe(true)

      // Signed external webhook from non-loopback IP drives turnRunner and sends reply!
      const ts = String(Math.floor(nowMs / 1000))
      const rawBody = JSON.stringify({
        messageId: 'm-100',
        conversationId: 'conv-ext',
        senderId: 'u-allow',
        text: 'hello hub',
      })
      const webhookRes = await dispatchRoute(handler, {
        method: 'POST',
        url: `${ROUTE_PREFIX}/webhook/generic`,
        remoteAddress: '203.0.113.50',
        headers: {
          'x-im-hub-timestamp': ts,
          'x-im-hub-signature': signWebhookPayload('secret-xyz', ts, rawBody),
        },
        body: rawBody,
      })
      expect(webhookRes.status).toBe(202)
      expect(outboundCalls.some((c) => c.body.includes('Echo: hello hub'))).toBe(true)

      await hub.dispose()
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
