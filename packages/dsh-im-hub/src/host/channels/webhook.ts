import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ChannelStatusSnapshot, WebhookChannelConfig } from '../../core/settings.ts'
import type {
  ChannelAdapter,
  FetchLike,
  InboundMessage,
  OutboundReply,
  WebhookHttpInput,
  WebhookHttpOutput,
} from './../core/types.ts'

export interface GenericWebhookAdapterOptions {
  getConfig: () => WebhookChannelConfig
  onMessage: (message: InboundMessage) => Promise<void> | void
  onEvent?: (level: 'info' | 'warn' | 'error', message: string) => void
  fetchImpl?: FetchLike
  nowMs?: () => number
}

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  const mac = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')
  return `sha256=${mac}`
}

export function verifyWebhookSignature(options: {
  secret: string
  timestamp: string | undefined
  signature: string | undefined
  rawBody: string
  nowMs?: number
  replayWindowSec?: number
}): { ok: boolean; reason?: string } {
  const { secret, timestamp, signature, rawBody } = options
  if (!secret) return { ok: false, reason: 'signing secret not configured' }
  if (!timestamp || !signature) return { ok: false, reason: 'missing timestamp or signature header' }

  const tsNum = Number(timestamp)
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'invalid timestamp' }

  const nowSec = (options.nowMs ?? Date.now()) / 1000
  const tsSec = tsNum > 1e12 ? tsNum / 1000 : tsNum
  const windowSec = Math.max(30, options.replayWindowSec ?? 300)
  if (Math.abs(nowSec - tsSec) > windowSec) {
    return { ok: false, reason: 'timestamp outside replay window' }
  }

  const expected = signWebhookPayload(secret, timestamp, rawBody)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' }
  }
  return { ok: true }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const target = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== target) continue
    return Array.isArray(v) ? v[0] : v
  }
  return undefined
}

export class GenericWebhookAdapter implements ChannelAdapter {
  readonly id = 'webhook' as const

  private readonly getConfig: GenericWebhookAdapterOptions['getConfig']
  private readonly onMessage: GenericWebhookAdapterOptions['onMessage']
  private readonly onEvent?: GenericWebhookAdapterOptions['onEvent']
  private readonly fetchImpl: FetchLike
  private readonly nowMs: () => number
  private readonly dedupIds = new Set<string>()
  private status: ChannelStatusSnapshot = {
    id: 'webhook',
    enabled: false,
    state: 'disabled',
    messageCount: 0,
  }

  constructor(options: GenericWebhookAdapterOptions) {
    this.getConfig = options.getConfig
    this.onMessage = options.onMessage
    this.onEvent = options.onEvent
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
    this.nowMs = options.nowMs ?? (() => Date.now())
  }

  getStatus(): ChannelStatusSnapshot {
    return { ...this.status }
  }

  async start(): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg.enabled) {
      this.status = { id: 'webhook', enabled: false, state: 'disabled', messageCount: this.status.messageCount }
      return
    }
    if (!cfg.signingSecret) {
      this.status = {
        id: 'webhook',
        enabled: true,
        state: 'error',
        lastError: 'missing signingSecret',
        messageCount: this.status.messageCount,
      }
      return
    }
    this.status = {
      id: 'webhook',
      enabled: true,
      state: 'webhook-ready',
      detail: 'hmac-sha256 webhook ready',
      messageCount: this.status.messageCount,
    }
  }

  async stop(): Promise<void> {
    const cfg = this.getConfig()
    this.status = {
      id: 'webhook',
      enabled: cfg.enabled,
      state: cfg.enabled ? 'idle' : 'disabled',
      messageCount: this.status.messageCount,
    }
  }

  async send(conversationId: string, reply: OutboundReply): Promise<void> {
    const cfg = this.getConfig()
    const targetUrl = typeof reply.replyContext?.replyUrl === 'string' && reply.replyContext.replyUrl
      ? reply.replyContext.replyUrl
      : cfg.outboundUrl
    if (!targetUrl) return

    const timestamp = String(Math.floor(this.nowMs() / 1000))
    const payload = JSON.stringify({
      conversationId,
      title: reply.title ?? 'DeepSeek Harness',
      text: reply.text,
      timestamp,
    })
    const headers: Record<string, string> = {
      ...cfg.outboundHeaders,
      'content-type': 'application/json; charset=utf-8',
      'x-im-hub-timestamp': timestamp,
    }
    if (cfg.signingSecret) {
      headers['x-im-hub-signature'] = signWebhookPayload(cfg.signingSecret, timestamp, payload)
    }

    const response = await this.fetchImpl(targetUrl, {
      method: 'POST',
      headers,
      body: payload,
    })
    if (!response.ok) {
      throw new Error(`webhook outbound HTTP ${response.status}`)
    }
  }

  async handleWebhook(req: WebhookHttpInput): Promise<WebhookHttpOutput> {
    const cfg = this.getConfig()
    if (!cfg.enabled) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'webhook channel disabled' }),
      }
    }
    if (req.method.toUpperCase() !== 'POST') {
      return {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'method not allowed' }),
      }
    }

    const timestamp = headerValue(req.headers, 'x-im-hub-timestamp')
    const signature = headerValue(req.headers, 'x-im-hub-signature') ?? headerValue(req.headers, 'x-signature-256')
    const check = verifyWebhookSignature({
      secret: cfg.signingSecret,
      timestamp,
      signature,
      rawBody: req.rawBody,
      nowMs: this.nowMs(),
      replayWindowSec: cfg.replayWindowSec,
    })
    if (!check.ok) {
      return {
        status: 401,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: check.reason ?? 'unauthorized' }),
      }
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(req.rawBody) as Record<string, unknown>
    } catch {
      return {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'invalid JSON body' }),
      }
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
    const senderId = typeof body.senderId === 'string' ? body.senderId.trim() : ''
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!conversationId || !senderId || !text) {
      return {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'conversationId, senderId, and text are required' }),
      }
    }

    const messageId = typeof body.messageId === 'string' && body.messageId.trim()
      ? body.messageId.trim()
      : randomUUID()
    if (this.recordSeen(messageId)) {
      return {
        status: 202,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ accepted: true, duplicate: true, messageId }),
      }
    }

    const chatType = body.chatType === 'group' ? 'group' : 'direct'
    const replyUrl = typeof body.replyUrl === 'string' ? body.replyUrl.trim() : undefined

    this.status.lastEventAt = this.nowMs()
    this.status.messageCount += 1

    await this.onMessage({
      channel: 'webhook',
      messageId,
      conversationId,
      chatType,
      senderId,
      senderName: typeof body.senderName === 'string' ? body.senderName : undefined,
      text,
      mentioned: typeof body.mentioned === 'boolean' ? body.mentioned : chatType === 'direct',
      replyContext: replyUrl ? { replyUrl } : undefined,
      receivedAt: this.nowMs(),
    })

    return {
      status: 202,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ accepted: true, messageId }),
    }
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    const cfg = this.getConfig()
    if (!cfg.signingSecret) {
      return { ok: false, detail: '入站签名密钥 (signingSecret) 为空' }
    }
    if (!cfg.outboundUrl) {
      return { ok: true, detail: 'HMAC-SHA256 签名密钥已就绪（仅入站回调模式）' }
    }
    try {
      const timestamp = String(Math.floor(this.nowMs() / 1000))
      const payload = JSON.stringify({ type: 'ping', source: 'dsh-im-hub', timestamp })
      const response = await this.fetchImpl(cfg.outboundUrl, {
        method: 'POST',
        headers: {
          ...cfg.outboundHeaders,
          'content-type': 'application/json; charset=utf-8',
          'x-im-hub-timestamp': timestamp,
          'x-im-hub-signature': signWebhookPayload(cfg.signingSecret, timestamp, payload),
        },
        body: payload,
      })
      if (!response.ok) {
        return { ok: false, detail: `出站回调返回 HTTP ${response.status}` }
      }
      return { ok: true, detail: `出站回调探测成功 (HTTP ${response.status})` }
    } catch (error) {
      this.onEvent?.('warn', `webhook ping failed: ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, detail: error instanceof Error ? error.message : String(error) }
    }
  }

  private recordSeen(messageId: string): boolean {
    if (this.dedupIds.has(messageId)) return true
    this.dedupIds.add(messageId)
    if (this.dedupIds.size > 512) {
      const oldest = this.dedupIds.values().next().value
      if (oldest !== undefined) this.dedupIds.delete(oldest)
    }
    return false
  }
}
