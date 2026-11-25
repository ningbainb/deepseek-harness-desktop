import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { AcpAgentManager } from './acp-agent-manager.ts'
import { ACP_API_PREFIX, type AcpAuthMode } from './types.ts'

const MAX_BODY_BYTES = 128 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks, total).toString('utf8').trim()
  if (!text) return {}
  const parsed: unknown = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function isAuthorizedRequest(request: IncomingMessage, peer?: { principal?: { kind?: string } }): boolean {
  const address = request.socket?.remoteAddress
  if (address !== undefined && !LOOPBACK_HOSTS.has(address)) return false
  if (peer?.principal?.kind !== 'owner') return false
  if (request.headers['x-dsh-acp'] !== '1') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  return true
}

export function registerAcpRoutes(ctx: Context, manager: AcpAgentManager): () => void {
  const webServer = (ctx as { get?: (key: string) => unknown }).get?.('webServer') as {
    register?(route: WebRoute): () => void
  } | undefined
  if (!webServer?.register) return () => {}

  const handler: WebRoute['handler'] = async (request, response, peer) => {
    if (!isAuthorizedRequest(request, peer as { principal?: { kind?: string } } | undefined)) {
      response.writeHead(403).end()
      return
    }
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const action = pathname.slice(ACP_API_PREFIX.length)
    try {
      if (action === '/agents' && request.method === 'GET') {
        sendJson(response, 200, {
          agents: await manager.listAgents(),
          activeSessions: manager.listActiveSessions(),
        })
        return
      }
      if (action === '/agents/custom' && request.method === 'POST') {
        const body = await readJsonBody(request)
        const saved = await manager.upsertCustomAgent({
          id: String(body.id ?? ''),
          name: String(body.name ?? ''),
          command: String(body.command ?? ''),
          args: Array.isArray(body.args) ? body.args.map(String) : [],
          authMode: (typeof body.authMode === 'string' ? body.authMode : 'custom') as AcpAuthMode,
        })
        sendJson(response, 200, { agent: saved })
        return
      }
      if (action === '/agents/custom' && request.method === 'DELETE') {
        const body = await readJsonBody(request)
        const removed = await manager.removeCustomAgent(String(body.id ?? ''))
        sendJson(response, 200, { removed })
        return
      }
      if (request.method !== 'POST') {
        response.writeHead(405).end()
        return
      }
      const body = await readJsonBody(request)
      if (action === '/probe') {
        const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : 'antigravity'
        const result = await manager.probeAgent(agentId, {
          cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
          commandOverride: typeof body.commandOverride === 'string' ? body.commandOverride : undefined,
        })
        sendJson(response, 200, result)
        return
      }
      if (action === '/session/cancel') {
        const cancelled = manager.cancelSession(String(body.sessionId ?? ''))
        sendJson(response, 200, { cancelled })
        return
      }
      if (action === '/session/close') {
        const closed = await manager.closeSession(String(body.sessionId ?? ''))
        sendJson(response, 200, { closed })
        return
      }
      response.writeHead(404).end()
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  return webServer.register({ kind: 'prefix', path: ACP_API_PREFIX, handler })
}
