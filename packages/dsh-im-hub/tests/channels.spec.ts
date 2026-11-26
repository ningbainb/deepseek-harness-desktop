import { describe, expect, it, vi } from 'vitest'
import {
  DingTalkAdapter,
  FeishuAdapter,
  GenericWebhookAdapter,
  WeComAdapter,
  computeWeComSignature,
  decryptWeComPayload,
  defaultSettings,
  encryptWeComPayload,
  signWebhookPayload,
  type InboundMessage,
} from '../src/index.ts'
import type { WebSocketLike } from '../src/host/core/types.ts'

class MockSocket implements WebSocketLike {
  readyState = 1
  sent: string[] = []
  closed = false
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null

  send(data: string | Uint8Array): void {
    this.sent.push(typeof data === 'string' ? data : new TextDecoder().decode(data))
  }

  close(): void {
    this.closed = true
  }
}

describe('dsh-im-hub lightweight domestic channel adapters', () => {
  it('FeishuAdapter caches tenant_access_token, handles WS receive event with dedup, and sends card', async () => {
    const cfg = defaultSettings().channels.feishu
    cfg.enabled = true
    cfg.appId = 'cli_feishu'
    cfg.appSecret = 'sec_feishu'

    const received: InboundMessage[] = []
    let socket!: MockSocket
    const fetchCalls: Array<{ url: string; body?: string }> = []

    const adapter = new FeishuAdapter({
      getConfig: () => cfg,
      onMessage: (msg) => { received.push(msg) },
      webSocketFactory: () => {
        socket = new MockSocket()
        return socket
      },
      fetchImpl: async (input, init) => {
        const url = String(input)
        fetchCalls.push({ url, body: init?.body as string | undefined })
        if (url.endsWith('/callback/ws/endpoint')) {
          return new Response(JSON.stringify({ code: 0, data: { URL: 'wss://feishu.example/ws' } }))
        }
        if (url.endsWith('/tenant_access_token/internal')) {
          return new Response(JSON.stringify({ code: 0, tenant_access_token: 't-token', expire: 7200 }))
        }
        if (url.includes('/im/v1/messages')) {
          return new Response(JSON.stringify({ code: 0 }))
        }
        return new Response('{}', { status: 404 })
      },
    })

    await adapter.start()
    socket.onopen?.({})
    expect(adapter.getStatus().state).toBe('connected')

    const eventPayload = JSON.stringify({
      message_id: 'frame-1',
      header: { event_type: 'im.message.receive_v1', event_id: 'ev-1' },
      event: {
        sender: { sender_id: { open_id: 'ou_alice' } },
        message: {
          message_id: 'om_1',
          chat_id: 'oc_group1',
          chat_type: 'group',
          mentions: [{ key: '@_user_1' }],
          content: JSON.stringify({ text: 'hello feishu' }),
        },
      },
    })

    // Deliver twice -> deduplicated
    await socket.onmessage?.({ data: eventPayload })
    await socket.onmessage?.({ data: eventPayload })
    await new Promise((r) => setTimeout(r, 10))

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      channel: 'feishu',
      conversationId: 'oc_group1',
      chatType: 'group',
      senderId: 'ou_alice',
      mentioned: true,
      text: 'hello feishu',
    })
    expect(socket.sent.some((s) => s.includes('"frame-1"'))).toBe(true)

    await adapter.send('oc_group1', { text: 'line1\nline2', title: 'Reply' })
    const sendCall = fetchCalls.find((c) => c.url.includes('/im/v1/messages'))
    expect(sendCall?.body).toContain('interactive')

    const conn = await adapter.testConnection()
    expect(conn.ok).toBe(true)
    await adapter.stop()
  })

  it('DingTalkAdapter handles Stream open, SYSTEM ping, CALLBACK ACK, and sessionWebhook reply', async () => {
    const cfg = defaultSettings().channels.dingtalk
    cfg.enabled = true
    cfg.clientId = 'ding-id'
    cfg.clientSecret = 'ding-sec'

    const received: InboundMessage[] = []
    let socket!: MockSocket
    const webhookPosts: string[] = []

    const adapter = new DingTalkAdapter({
      getConfig: () => cfg,
      onMessage: (msg) => { received.push(msg) },
      webSocketFactory: () => {
        socket = new MockSocket()
        return socket
      },
      fetchImpl: async (input, init) => {
        const url = String(input)
        if (url.endsWith('/gateway/connections/open')) {
          return new Response(JSON.stringify({ endpoint: 'wss://ding.example/ws', ticket: 'tk-1' }))
        }
        if (url.endsWith('/oauth2/accessToken')) {
          return new Response(JSON.stringify({ accessToken: 'dt-token', expireIn: 7200 }))
        }
        if (url.startsWith('https://oapi.dingtalk.com/robot/sendBySession')) {
          webhookPosts.push(String(init?.body ?? ''))
          return new Response(JSON.stringify({ errcode: 0 }))
        }
        return new Response('{}', { status: 404 })
      },
    })

    await adapter.start()
    socket.onopen?.({})

    socket.onmessage?.({
      data: JSON.stringify({ type: 'SYSTEM', headers: { messageId: 'sys-1', topic: 'ping' }, data: 'hb' }),
    })
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'CALLBACK',
        headers: { messageId: 'cb-1', topic: '/v1.0/im/bot/messages/get' },
        data: JSON.stringify({
          msgId: 'dm-1',
          conversationId: 'cid-1',
          conversationType: '1',
          senderStaffId: 'staff-1',
          senderNick: 'Bob',
          text: { content: 'hi ding' },
          sessionWebhook: 'https://oapi.dingtalk.com/robot/sendBySession?session=abc',
        }),
      }),
    })
    await new Promise((r) => setTimeout(r, 10))

    expect(socket.sent.some((s) => s.includes('"sys-1"'))).toBe(true)
    expect(socket.sent.some((s) => s.includes('"cb-1"'))).toBe(true)
    expect(received).toHaveLength(1)
    expect(received[0]?.text).toBe('hi ding')

    await adapter.send('cid-1', {
      text: 'pong',
      replyContext: { sessionWebhook: 'https://oapi.dingtalk.com/robot/sendBySession?session=abc' },
    })
    expect(webhookPosts[0]).toContain('markdown')
    expect((await adapter.testConnection()).ok).toBe(true)
    await adapter.stop()
  })

  it('WeComAdapter verifies signatures, encrypts/decrypts AES-256-CBC payloads, and dispatches XML messages', async () => {
    const aesKey = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    const cfg = defaultSettings().channels.wecom
    cfg.enabled = true
    cfg.mode = 'app'
    cfg.corpId = 'ww-corp'
    cfg.corpSecret = 'ww-secret'
    cfg.agentId = '10001'
    cfg.token = 'ww-token'
    cfg.encodingAesKey = aesKey

    const plainEcho = 'echo-challenge-123'
    const cipherEcho = encryptWeComPayload(aesKey, plainEcho, cfg.corpId)
    expect(decryptWeComPayload(aesKey, cipherEcho)).toEqual({
      message: plainEcho,
      receiveId: cfg.corpId,
    })

    const received: InboundMessage[] = []
    const adapter = new WeComAdapter({
      getConfig: () => cfg,
      onMessage: (msg) => { received.push(msg) },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ errcode: 0, access_token: 'wc-tk' }))),
    })

    const ts = '1700000000'
    const nonce = 'n123'
    const echoSig = computeWeComSignature(cfg.token, ts, nonce, cipherEcho)
    const verifyRes = await adapter.handleWebhook({
      method: 'GET',
      url: `/api/dsh-im-hub/webhook/wecom?msg_signature=${echoSig}&timestamp=${ts}&nonce=${nonce}&echostr=${encodeURIComponent(cipherEcho)}`,
      headers: {},
      rawBody: '',
    })
    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body).toBe(plainEcho)

    const xml = '<xml><FromUserName><![CDATA[zhangsan]]></FromUserName><MsgId>9001</MsgId><Content><![CDATA[hello wecom]]></Content></xml>'
    const cipherXml = encryptWeComPayload(aesKey, xml, cfg.corpId)
    const postSig = computeWeComSignature(cfg.token, ts, nonce, cipherXml)
    const postRes = await adapter.handleWebhook({
      method: 'POST',
      url: `/api/dsh-im-hub/webhook/wecom?msg_signature=${postSig}&timestamp=${ts}&nonce=${nonce}`,
      headers: {},
      rawBody: `<xml><Encrypt><![CDATA[${cipherXml}]]></Encrypt></xml>`,
    })
    expect(postRes.status).toBe(200)
    expect(received[0]).toMatchObject({
      channel: 'wecom',
      senderId: 'zhangsan',
      text: 'hello wecom',
    })
  })

  it('GenericWebhookAdapter verifies HMAC-SHA256 signatures and rejects expired replays', async () => {
    const cfg = defaultSettings().channels.webhook
    cfg.enabled = true
    cfg.signingSecret = 'wh-secret-key'
    cfg.outboundUrl = 'https://receiver.example/reply'

    const now = 1_700_000_000_000
    const ts = String(Math.floor(now / 1000))
    const rawBody = JSON.stringify({
      messageId: 'wh-1',
      conversationId: 'conv-1',
      senderId: 'ext-user',
      text: 'run check',
    })
    const sig = signWebhookPayload(cfg.signingSecret, ts, rawBody)

    const received: InboundMessage[] = []
    const outboundBodies: string[] = []
    const adapter = new GenericWebhookAdapter({
      getConfig: () => cfg,
      onMessage: (m) => { received.push(m) },
      nowMs: () => now,
      fetchImpl: async (_url, init) => {
        outboundBodies.push(String(init?.body ?? ''))
        return new Response('ok')
      },
    })

    const expired = await adapter.handleWebhook({
      method: 'POST',
      url: '/api/dsh-im-hub/webhook/generic',
      headers: {
        'x-im-hub-timestamp': String(Number(ts) - 1000),
        'x-im-hub-signature': signWebhookPayload(cfg.signingSecret, String(Number(ts) - 1000), rawBody),
      },
      rawBody,
    })
    expect(expired.status).toBe(401)

    const ok = await adapter.handleWebhook({
      method: 'POST',
      url: '/api/dsh-im-hub/webhook/generic',
      headers: { 'x-im-hub-timestamp': ts, 'x-im-hub-signature': sig },
      rawBody,
    })
    expect(ok.status).toBe(202)
    expect(received).toHaveLength(1)

    await adapter.send('conv-1', { text: 'done' })
    expect(outboundBodies[0]).toContain('"done"')
  })
})
