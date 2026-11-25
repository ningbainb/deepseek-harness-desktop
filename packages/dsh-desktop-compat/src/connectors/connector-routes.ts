import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ConnectorRegistryService } from './connector-registry-service.ts'
import { CONNECTOR_API_PREFIX } from './types.ts'

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
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
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
  if (request.headers['x-dsh-connectors'] !== '1') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  return true
}

export function registerConnectorRoutes(ctx: Context, service: ConnectorRegistryService): () => void {
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
    const action = pathname.slice(CONNECTOR_API_PREFIX.length)
    try {
      if (action === '/state' && request.method === 'GET') {
        sendJson(response, 200, await service.snapshot())
        return
      }
      if (action === '/login-status' && request.method === 'GET') {
        const reqUrl = new URL(request.url ?? '/', 'http://localhost')
        const connectorId = reqUrl.searchParams.get('connectorId')?.trim() ?? ''
        if (!connectorId) {
          sendJson(response, 400, { error: 'connectorId is required' })
          return
        }
        sendJson(response, 200, {
          login: await service.getLoginStatus(connectorId),
          snapshot: await service.snapshot(),
        })
        return
      }
      if (request.method !== 'POST') {
        response.writeHead(405).end()
        return
      }
      const body = await readJsonBody(request)
      const connectorId = typeof body.connectorId === 'string' ? body.connectorId.trim() : ''
      if (!connectorId) {
        sendJson(response, 400, { error: 'connectorId is required' })
        return
      }
      if (action === '/detect') {
        sendJson(response, 200, await service.detectEnvironment(connectorId))
        return
      }
      if (action === '/install') {
        const result = await service.installConnector(connectorId)
        sendJson(response, 200, { result, snapshot: await service.snapshot() })
        return
      }
      if (action === '/login') {
        const login = await service.startLogin(connectorId)
        sendJson(response, 200, { login, snapshot: await service.snapshot() })
        return
      }
      if (action === '/configure') {
        const snapshot = await service.configure(connectorId, {
          enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
          selectedDriverId: typeof body.selectedDriverId === 'string' ? body.selectedDriverId : undefined,
          customBinaryPath: typeof body.customBinaryPath === 'string' ? body.customBinaryPath : undefined,
          activeProfileId: typeof body.activeProfileId === 'string' ? body.activeProfileId : undefined,
          nonSecretFields: body.nonSecretFields && typeof body.nonSecretFields === 'object' && !Array.isArray(body.nonSecretFields)
            ? body.nonSecretFields as Record<string, string>
            : undefined,
          secretFields: body.secretFields && typeof body.secretFields === 'object' && !Array.isArray(body.secretFields)
            ? body.secretFields as Record<string, string>
            : undefined,
          accountLabel: typeof body.accountLabel === 'string' ? body.accountLabel : undefined,
          consentAccepted: typeof body.consentAccepted === 'boolean' ? body.consentAccepted : undefined,
        })
        sendJson(response, 200, snapshot)
        return
      }
      if (action === '/verify') {
        const diagnostic = await service.verifyConnection(connectorId)
        const snapshot = await service.snapshot()
        sendJson(response, 200, { diagnostic, snapshot })
        return
      }
      if (action === '/disconnect') {
        sendJson(response, 200, await service.disconnect(connectorId))
        return
      }
      response.writeHead(404).end()
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  return webServer.register({ kind: 'prefix', path: CONNECTOR_API_PREFIX, handler })
}
