import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLoopbackRequest } from './loopback-request.ts'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { LocalSearchService, SearchAccessError, type SessionSearchRequest } from './service.ts'

export const SEARCH_API_PREFIX = '/api/dsh-local-search'

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function parseBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new TypeError('JSON required')
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const part = Buffer.from(chunk as Uint8Array)
    size += part.length
    if (size > 16 * 1024) throw new TypeError('Request too large')
    parts.push(part)
  }
  const value = JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Invalid JSON object')
  return value as Record<string, unknown>
}

function text(value: unknown, limit: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new TypeError('Invalid text')
  return value
}

function integer(value: unknown, limit = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > limit) throw new TypeError('Invalid integer')
  return value
}

export function searchRoutes(service: LocalSearchService): WebRoute[] {
  return [{
    kind: 'prefix', path: SEARCH_API_PREFIX,
    async handler(request, response, context) {
      if (!isLoopbackRequest(request) || request.headers['x-dsh-local-search'] !== '1' || context?.principal?.kind !== 'owner') {
        send(response, 403, { ok: false, code: 'forbidden' }); return
      }
      if (request.method !== 'POST') { send(response, 405, { ok: false, code: 'method-not-allowed' }); return }
      const scope = service.desktopRequestScope()
      if (!scope) { send(response, 403, { ok: false, code: 'forbidden' }); return }
      try {
        const args = await parseBody(request)
        const action = new URL(request.url ?? '', 'http://localhost').pathname.slice(SEARCH_API_PREFIX.length)
        const workspaceId = text(args.workspaceId, 160)
        if (action === '/sessions') {
          const query = text(args.query, 1200)
          if (!query) throw new TypeError('Query required')
          const filters: SessionSearchRequest = {
            query, workspaceId, after: integer(args.after), before: integer(args.before),
            limit: Math.max(1, integer(args.limit, 50) ?? 20),
          }
          if (filters.after !== undefined && filters.before !== undefined && filters.after > filters.before) throw new TypeError('Invalid dates')
          send(response, 200, { ok: true, ...await service.searchSessions(scope, filters) })
        } else if (action === '/status') {
          send(response, 200, { ok: true, ...await service.status(scope, workspaceId) })
        } else if (action === '/rebuild') {
          service.rebuild(scope)
          send(response, 202, { ok: true })
        } else if (action === '/sources') {
          const path = text(args.path, 4096)
          if (!workspaceId || !path || (args.operation !== 'add' && args.operation !== 'remove')) throw new TypeError('Invalid source')
          send(response, 200, { ok: true, ...await service.changePath(scope, workspaceId, path, args.operation) })
        } else send(response, 404, { ok: false, code: 'not-found' })
      } catch (error) {
        if (error instanceof SearchAccessError) send(response, 403, { ok: false, code: 'forbidden' })
        else if (error instanceof TypeError || error instanceof SyntaxError) send(response, 400, { ok: false, code: 'invalid-input' })
        else send(response, 422, { ok: false, code: 'search-unavailable' })
      }
    },
  }]
}
