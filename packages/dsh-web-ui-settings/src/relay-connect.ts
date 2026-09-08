import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { RELAY_HOME_URL, type RelayConnection } from './relay-protocol.ts'

/** Short-lived, single-use browser handoff. Secrets travel only in the POST body. */
export class RelayConnectionController {
  private server?: Server
  private timer?: ReturnType<typeof setTimeout>
  private state = ''
  private current: RelayConnection = { phase: 'idle' }
  constructor(private readonly configure: (key: unknown) => Promise<unknown>, private readonly lifetimeMs = 300_000) {}

  status(): RelayConnection { return { ...this.current } }

  async start(): Promise<RelayConnection> {
    if (['starting', 'pending', 'connecting'].includes(this.current.phase)) return this.status()
    this.dispose()
    this.state = randomBytes(32).toString('hex')
    this.current = { phase: 'starting' }
    const server = createServer((request, response) => { void this.complete(request, response).catch(() => {
      if (!response.writableEnded) this.respond(response, 500, '连接未完成，请返回软件重试。 / Connection failed. Return to Desktop and retry.')
    }) })
    server.requestTimeout = 15_000
    server.headersTimeout = 10_000
    this.server = server
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('listener-unavailable')
      const url = new URL('/dsh-desktop-connect.html', RELAY_HOME_URL)
      url.hash = new URLSearchParams({ port: String(address.port), state: this.state }).toString()
      this.current = { phase: 'pending', url: url.href, expiresAt: Date.now() + this.lifetimeMs }
      this.timer = setTimeout(() => {
        if (this.current.phase !== 'pending') return
        this.current = { phase: 'expired' }
        this.close()
      }, this.lifetimeMs)
      this.timer.unref()
      server.unref()
      return this.status()
    } catch {
      this.current = { phase: 'failed' }
      this.close()
      return this.status()
    }
  }

  cancel(): RelayConnection {
    // Once an authorized write has started it must settle before another action.
    if (this.current.phase === 'connecting' || this.current.phase === 'starting') return this.status()
    this.current = { phase: 'cancelled' }
    this.close()
    return this.status()
  }

  private close(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.state = ''
    this.server?.close()
    this.server?.closeIdleConnections()
    this.server = undefined
  }
  dispose(): void { this.close(); this.current = { phase: 'idle' } }

  private respond(response: ServerResponse, status: number, text: string): void {
    response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', connection: 'close' })
    response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DeepSeek Harness Desktop</title><h1>' + text + '</h1>' + (status === 200 ? '<p><a href="dsh://extensions">返回桌面软件 / Return to Desktop</a></p>' : ''))
  }

  private async complete(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const address = this.server?.address()
    const host = address && typeof address !== 'string' ? '127.0.0.1:' + address.port : ''
    if (request.method !== 'POST' || request.url !== '/complete' || request.headers.host !== host || request.headers.origin !== new URL(RELAY_HOME_URL).origin || request.socket.remoteAddress !== '127.0.0.1' || request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
      this.respond(response, 403, '无效的连接请求 / Invalid connection request'); return
    }
    const chunks: Buffer[] = []
    let size = 0
    for await (const part of request) {
      const chunk = Buffer.from(part)
      size += chunk.length
      if (size > 16_384) { this.respond(response, 413, '请求过大 / Request too large'); return }
      chunks.push(chunk)
    }
    const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
    const state = body.get('state') ?? ''
    if (this.current.phase !== 'pending' || Date.now() >= (this.current.expiresAt ?? 0) || body.getAll('state').length !== 1 || body.getAll('apiKey').length !== 1 || !/^[a-f0-9]{64}$/.test(state) || !this.state || !timingSafeEqual(Buffer.from(state), Buffer.from(this.state))) {
      this.respond(response, 403, '连接已失效，请从软件重新发起 / Connection expired. Start again in Desktop.'); return
    }
    this.current = { phase: 'connecting' }
    this.state = ''
    clearTimeout(this.timer)
    try {
      await this.configure(body.get('apiKey'))
      this.current = { phase: 'connected' }
      this.respond(response, 200, '已连接，请返回桌面软件选择模型。 / Connected. Return to Desktop to choose a model.')
    } catch {
      this.current = { phase: 'failed' }
      this.respond(response, 400, '连接未完成，请返回软件重试或手动接入。 / Connection failed. Retry in Desktop or use an API Key.')
    } finally { this.close() }
  }
}
