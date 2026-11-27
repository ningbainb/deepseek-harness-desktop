import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { CHECKPOINT_API, CHECKPOINT_HEADER } from '../core/protocol.ts'
import { CheckpointAccessError, type CheckpointHost } from './service.ts'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const MAX_REQUEST = 96 * 1024
const MAX_RENDERER = 16 * 1024 * 1024

const accessStatus = {
  'approval-required': 403, 'approval-unavailable': 503, 'busy': 409, 'forbidden': 403,
  'not-found': 404, 'stale-preview': 409, 'unavailable': 503,
} as const

function authorized(request: IncomingMessage, context: Parameters<WebRoute['handler']>[2], renderer: boolean): boolean {
  if (context?.principal.kind !== 'owner' || !LOOPBACK.has(request.socket.remoteAddress ?? '')
    || request.headers['sec-fetch-site'] === 'cross-site') return false
  const destination = request.headers['sec-fetch-dest']
  if (renderer ? destination !== undefined && destination !== 'script' : request.headers[CHECKPOINT_HEADER] !== '1') return false
  if (request.headers.origin === undefined) return true
  try { return new URL(request.headers.origin).host === request.headers.host } catch { return false }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new TypeError('JSON input required')
  const parts: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const part = Buffer.from(chunk as Uint8Array)
    bytes += part.length
    if (bytes > MAX_REQUEST) throw new TypeError('Request too large')
    parts.push(part)
  }
  const value: unknown = JSON.parse(Buffer.concat(parts, bytes).toString('utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('JSON object required')
  return value as Record<string, unknown>
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value || value.length > limit || value.includes('\0')) throw new TypeError('Invalid text field')
  return value
}

function paths(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > 128) throw new TypeError('Invalid file selection')
  return value.map(path => text(path, 2048))
}

let renderer: Promise<Buffer> | undefined

export function checkpointRoute(host: CheckpointHost | undefined): WebRoute {
  return {
    kind: 'prefix', path: CHECKPOINT_API, auth: 'required',
    async handler(request, response, context) {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const path = url.pathname.slice(CHECKPOINT_API.length)
      const isRenderer = request.method === 'GET' && path === '/renderer.js'
      if (!authorized(request, context, isRenderer)) { send(response, 403, { error: { code: 'forbidden' } }); return }
      if (isRenderer) {
        try {
          const source = await (renderer ??= readFile(new URL('./checkpoint-renderer.js', import.meta.url)))
          if (source.length > MAX_RENDERER) throw new Error('Renderer exceeds size limit')
          response.writeHead(200, {
            'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'private, max-age=300',
            'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin',
          }).end(source)
        } catch {
          renderer = undefined
          send(response, 503, { error: { code: 'unavailable' } })
        }
        return
      }
      if (!host) {
        if (path === '/list' && request.method === 'GET') send(response, 200, { result: [] })
        else send(response, 503, { error: { code: 'unavailable' } })
        return
      }
      const controller = new AbortController()
      const onClose = () => controller.abort()
      response.once('close', onClose)
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
      try {
        const approval = /^\/approval\/([0-9a-f-]{36})$/u.exec(path)
        if (path === '/list' && request.method === 'GET') {
          send(response, 200, { result: await host.list(text(url.searchParams.get('sessionId'), 160), signal) })
          return
        }
        if (approval && request.method === 'GET') {
          send(response, 200, { result: await host.describeApproval(approval[1]!) })
          return
        }
        if (request.method !== 'POST' || !['/diff', '/prepare', '/restore'].includes(path)) {
          send(response, 404, { error: { code: 'not-found' } })
          return
        }
        const args = await readBody(request)
        const sessionId = text(args.sessionId, 160)
        if (path === '/restore') {
          const result = await host.restore(sessionId, text(args.challengeId, 36), args.approvalProof, signal)
          send(response, 200, { result })
          return
        }
        const checkpointId = text(args.checkpointId, 128)
        if (path === '/prepare') {
          send(response, 200, { result: await host.prepare(sessionId, checkpointId, paths(args.paths), signal) })
        } else {
          const file = args.path === undefined ? undefined : text(args.path, 2048)
          const against = args.against
          if (against !== undefined && against !== 'working' && against !== 'parent') throw new TypeError('Invalid diff mode')
          const result = await host.diff(sessionId, checkpointId, { path: file, against }, signal)
          const patch = !file || Buffer.byteLength(result.patch) > 1024 * 1024 ? '' : result.patch
          send(response, 200, { result: { ...result, patch } })
        }
      } catch (error) {
        if (error instanceof CheckpointAccessError) send(response, accessStatus[error.code], { error: { code: error.code } })
        else if (error instanceof TypeError || error instanceof SyntaxError) send(response, 400, { error: { code: 'invalid-input' } })
        else if (error instanceof Error && /(?:stale|workspace.changed)/iu.test(error.message)) {
          send(response, 409, { error: { code: 'stale-preview' } })
        } else send(response, 422, { error: { code: 'unavailable' } })
      } finally { response.off('close', onClose) }
    },
  }
}
