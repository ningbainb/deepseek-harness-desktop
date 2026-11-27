import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asObject, McpAppError, MCP_APP_API, MCP_APP_TIMEOUT, type JsonRecord } from '../core/mcp-apps.ts'
import { McpAppApprovalRequired, type McpAppsBridge } from './mcp-app-bridge.ts'

const local = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const MAX_REQUEST_BYTES = 128 * 1024

function authorized(req: IncomingMessage, peer: Parameters<WebRoute['handler']>[2]): boolean {
  if (peer?.principal.kind !== 'owner' || !local.has(req.socket.remoteAddress ?? '')
    || req.headers['x-dsh-mcp-apps'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') return false
  if (req.headers.origin === undefined) return true
  try { return new URL(req.headers.origin).host === req.headers.host } catch { return false }
}

function respond(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

async function readBody(req: IncomingMessage): Promise<JsonRecord> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new McpAppError(-32602, 'Expected a JSON body')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.from(chunk)
    bytes += part.length
    if (bytes > MAX_REQUEST_BYTES) throw new McpAppError(-32602, 'Request is too large')
    chunks.push(part)
  }
  try {
    const body = asObject(JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')))
    if (body) return body
  } catch {}
  throw new McpAppError(-32602, 'Expected a JSON object')
}

export function registerMcpAppRoutes(ctx: Context, bridge: McpAppsBridge): () => void {
  return ctx.webServer.register({
    kind: 'prefix', path: MCP_APP_API, auth: 'required',
    async handler(req, res, peer) {
      if (!authorized(req, peer)) { respond(res, 403, { error: { code: -32003, message: 'Access denied' } }); return }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const path = url.pathname.slice(MCP_APP_API.length)
      const controller = new AbortController()
      const close = () => controller.abort()
      req.once('aborted', close)
      res.once('close', close)
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MCP_APP_TIMEOUT)])
      try {
        const resource = /^\/resource\/([0-9a-f]{32})$/u.exec(path)
        const approval = /^\/approval\/([0-9a-f-]{36})$/u.exec(path)
        if (resource && req.method === 'GET') {
          const result = await bridge.resource(resource[1], url.searchParams.get('sessionId'), signal)
          respond(res, 200, { result })
        } else if (approval && req.method === 'GET') {
          respond(res, 200, bridge.describeApproval(approval[1]!))
        } else if (path === '/call-tool' && req.method === 'POST') {
          const result = await bridge.call(await readBody(req), signal)
          respond(res, 200, { result })
        } else if (path === '/read-resource' && req.method === 'POST') {
          const result = await bridge.readResource(await readBody(req), signal)
          respond(res, 200, { result })
        } else if (path === '/context' && req.method === 'POST') {
          bridge.updateContext(await readBody(req))
          respond(res, 200, { result: {} })
        } else {
          respond(res, 404, { error: { code: -32601, message: 'Unknown MCP App request' } })
        }
      } catch (error) {
        if (error instanceof McpAppApprovalRequired) {
          respond(res, 409, { error: { code: error.code, message: error.message }, challengeId: error.challengeId })
          return
        }
        const code = error instanceof McpAppError ? error.code : -32000
        const message = error instanceof McpAppError ? error.message : 'MCP App request failed'
        const status = code === -32004 ? 404 : code === -32001 ? 403 : code === -32029 ? 429 : code === -32602 ? 400 : 500
        respond(res, status, { error: { code, message } })
      } finally {
        req.off('aborted', close)
        res.off('close', close)
      }
    },
  })
}
