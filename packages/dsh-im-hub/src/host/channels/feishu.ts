import type { ChannelStatusSnapshot, FeishuChannelConfig } from '../../core/settings.ts'
import type {
  ChannelAdapter,
  FetchLike,
  InboundMessage,
  OutboundReply,
  WebSocketFactory,
  WebSocketLike,
} from './../core/types.ts'

export interface FeishuAdapterOptions {
  getConfig: () => FeishuChannelConfig
  onMessage: (message: InboundMessage) => Promise<void> | void
  onEvent?: (level: 'info' | 'warn' | 'error', message: string) => void
  fetchImpl?: FetchLike
  webSocketFactory?: WebSocketFactory
}

function defaultWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

export function resolveFeishuBaseUrl(domain: FeishuChannelConfig['domain']): string {
  return domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
}

export function extractFeishuTextContent(rawContent: string | undefined): string {
  if (!rawContent) return ''
  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    if (typeof parsed.text === 'string') return parsed.text.trim()
  } catch {
    // Plain text fallback when content is not wrapped in JSON.
  }
  return rawContent.trim()
}

export class FeishuAdapter implements ChannelAdapter {
  readonly id = 'feishu' as const

  private readonly getConfig: FeishuAdapterOptions['getConfig']
  private readonly onMessage: FeishuAdapterOptions['onMessage']
  private readonly onEvent?: FeishuAdapterOptions['onEvent']
  private readonly fetchImpl: FetchLike
  private readonly webSocketFactory: WebSocketFactory

  private tokenCache: { token: string; expiresAt: number } | null = null
  private ws: WebSocketLike | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopping = false
  private reconnectAttempts = 0
  private readonly dedupIds = new Set<string>()
  private status: ChannelStatusSnapshot = {
    id: 'feishu',
    enabled: false,
    state: 'disabled',
    messageCount: 0,
  }

  constructor(options: FeishuAdapterOptions) {
    this.getConfig = options.getConfig
    this.onMessage = options.onMessage
    this.onEvent = options.onEvent
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory
  }

  getStatus(): ChannelStatusSnapshot {
    return { ...this.status }
  }

  async start(): Promise<void> {
    await this.stop()
    const cfg = this.getConfig()
    this.stopping = false
    if (!cfg.enabled) {
      this.status = { id: 'feishu', enabled: false, state: 'disabled', messageCount: this.status.messageCount }
      return
    }
    if (!cfg.appId || !cfg.appSecret) {
      this.status = {
        id: 'feishu',
        enabled: true,
        state: 'error',
        lastError: 'missing appId or appSecret',
        messageCount: this.status.messageCount,
      }
      return
    }

    this.status = {
      id: 'feishu',
      enabled: true,
      state: 'connecting',
      detail: 'requesting ws endpoint',
      messageCount: this.status.messageCount,
    }

    try {
      const wsUrl = await this.requestWsEndpoint(cfg)
      if (this.stopping) return
      this.openWebSocket(wsUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.status = {
        id: 'feishu',
        enabled: true,
        state: 'error',
        lastError: message,
        messageCount: this.status.messageCount,
      }
      this.onEvent?.('error', `feishu start failed: ${message}`)
      this.scheduleReconnect()
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      const active = this.ws
      this.ws = null
      active.onopen = null
      active.onmessage = null
      active.onerror = null
      active.onclose = null
      try {
        active.close(1000, 'stopped')
      } catch {
        // Ignore close errors on teardown.
      }
    }
    this.tokenCache = null
    const cfg = this.getConfig()
    this.status = {
      id: 'feishu',
      enabled: cfg.enabled,
      state: cfg.enabled ? 'idle' : 'disabled',
      messageCount: this.status.messageCount,
    }
  }

  async fetchTenantAccessToken(cfg: FeishuChannelConfig = this.getConfig()): Promise<string> {
    if (!cfg.appId || !cfg.appSecret) {
      throw new Error('feishu appId and appSecret are required')
    }
    const now = Date.now()
    if (this.tokenCache && now < this.tokenCache.expiresAt) {
      return this.tokenCache.token
    }
    const baseUrl = resolveFeishuBaseUrl(cfg.domain)
    const response = await this.fetchImpl(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    })
    if (!response.ok) {
      throw new Error(`feishu token HTTP ${response.status}`)
    }
    const json = await response.json() as {
      code?: number
      msg?: string
      tenant_access_token?: string
      expire?: number
    }
    if ((json.code !== undefined && json.code !== 0) || !json.tenant_access_token) {
      throw new Error(`feishu token error: ${json.msg ?? json.code ?? 'missing token'}`)
    }
    const ttlMs = Math.max(60, (json.expire ?? 7200) - 300) * 1000
    this.tokenCache = {
      token: json.tenant_access_token,
      expiresAt: now + ttlMs,
    }
    return json.tenant_access_token
  }

  async send(conversationId: string, reply: OutboundReply): Promise<void> {
    const cfg = this.getConfig()
    const token = await this.fetchTenantAccessToken(cfg)
    const baseUrl = resolveFeishuBaseUrl(cfg.domain)

    const body = reply.title || reply.text.includes('\n')
      ? {
          receive_id: conversationId,
          msg_type: 'interactive',
          content: JSON.stringify({
            header: {
              title: { tag: 'plain_text', content: reply.title ?? 'DeepSeek Harness' },
            },
            elements: [
              { tag: 'markdown', content: reply.text },
            ],
          }),
        }
      : {
          receive_id: conversationId,
          msg_type: 'text',
          content: JSON.stringify({ text: reply.text }),
        }

    const response = await this.fetchImpl(
      `${baseUrl}/open-apis/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
      },
    )
    if (!response.ok) {
      throw new Error(`feishu send HTTP ${response.status}`)
    }
    const data = await response.json() as { code?: number; msg?: string }
    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`feishu send error: ${data.msg ?? data.code}`)
    }
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    const cfg = this.getConfig()
    if (!cfg.appId || !cfg.appSecret) {
      return { ok: false, detail: 'App ID 或 App Secret 为空' }
    }
    try {
      this.tokenCache = null
      await this.fetchTenantAccessToken(cfg)
      return { ok: true, detail: `已成功获取 Feishu (${cfg.domain}) tenant_access_token` }
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) }
    }
  }

  private async requestWsEndpoint(cfg: FeishuChannelConfig): Promise<string> {
    const baseUrl = resolveFeishuBaseUrl(cfg.domain)
    const response = await this.fetchImpl(`${baseUrl}/callback/ws/endpoint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        AppID: cfg.appId,
        AppSecret: cfg.appSecret,
      }),
    })
    if (!response.ok) {
      throw new Error(`feishu ws endpoint HTTP ${response.status}`)
    }
    const json = await response.json() as {
      code?: number
      msg?: string
      data?: { URL?: string; url?: string }
    }
    const url = json.data?.URL ?? json.data?.url
    if ((json.code !== undefined && json.code !== 0) || !url) {
      throw new Error(`feishu ws endpoint error: ${json.msg ?? json.code ?? 'missing URL'}`)
    }
    return url
  }

  private openWebSocket(url: string): void {
    const ws = this.webSocketFactory(url)
    this.ws = ws

    ws.onopen = () => {
      this.reconnectAttempts = 0
      this.status = {
        id: 'feishu',
        enabled: true,
        state: 'connected',
        detail: 'websocket connected',
        lastEventAt: Date.now(),
        messageCount: this.status.messageCount,
      }
      this.onEvent?.('info', 'feishu websocket connected')
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
        } catch {
          // Wait for close/reconnect handler.
        }
      }, 30_000)
    }

    ws.onmessage = (event) => {
      void this.handleWsFrame(ws, event.data)
    }

    ws.onerror = () => {
      this.status = {
        ...this.status,
        state: 'error',
        lastError: 'feishu websocket error',
      }
    }

    ws.onclose = () => {
      if (this.pingTimer) {
        clearInterval(this.pingTimer)
        this.pingTimer = null
      }
      if (!this.stopping) {
        this.status = {
          ...this.status,
          state: 'connecting',
          detail: 'reconnecting',
        }
        this.scheduleReconnect()
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return
    const delayMs = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempts))
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopping) {
        void this.start()
      }
    }, delayMs)
  }

  private async handleWsFrame(ws: WebSocketLike, rawData: unknown): Promise<void> {
    const text = decodeFrameText(rawData)
    if (!text) return

    let frame: Record<string, unknown>
    try {
      frame = JSON.parse(text) as Record<string, unknown>
    } catch {
      return
    }

    // Acknowledge event frame if it carries a message_id/seq/headers.
    const frameId = frame.message_id ?? frame.seq ?? (frame.headers as Record<string, unknown> | undefined)?.message_id
    if (frameId !== undefined && frame.type !== 'pong') {
      try {
        ws.send(JSON.stringify({ code: 200, message_id: frameId, data: '{}' }))
      } catch {
        // Ignore send errors.
      }
    }

    const header = frame.header as Record<string, unknown> | undefined
    const eventType = header?.event_type ?? frame.event_type
    if (eventType !== 'im.message.receive_v1') return

    const event = (frame.event ?? frame.data ?? frame) as Record<string, unknown>
    const msg = event.message as Record<string, unknown> | undefined
    const sender = event.sender as Record<string, unknown> | undefined
    const senderIds = sender?.sender_id as Record<string, unknown> | undefined
    if (!msg) return

    const messageId = String(msg.message_id ?? header?.event_id ?? '')
    const chatId = String(msg.chat_id ?? '')
    if (!messageId || !chatId) return
    if (this.recordSeen(messageId)) return

    const chatType = msg.chat_type === 'group' ? 'group' : 'direct'
    const senderId = String(senderIds?.open_id ?? senderIds?.user_id ?? senderIds?.union_id ?? 'unknown')
    const rawContent = typeof msg.content === 'string' ? msg.content : undefined
    const textContent = extractFeishuTextContent(rawContent)
    const mentions = Array.isArray(msg.mentions) ? msg.mentions : []

    this.status.lastEventAt = Date.now()
    this.status.messageCount += 1

    await this.onMessage({
      channel: 'feishu',
      messageId,
      conversationId: chatId,
      chatType,
      senderId,
      senderName: typeof sender?.sender_type === 'string' ? undefined : undefined,
      text: textContent,
      mentioned: mentions.length > 0,
      replyContext: { chatId, messageId },
      receivedAt: Date.now(),
    })
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

function decodeFrameText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
    const view = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw
    const decoded = new TextDecoder('utf-8').decode(view)
    const jsonStart = decoded.indexOf('{')
    if (jsonStart >= 0) return decoded.slice(jsonStart)
  }
  return null
}
