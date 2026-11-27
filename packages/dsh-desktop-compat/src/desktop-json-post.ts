import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER, isDesktopWorkspaceFileOpenToken } from './workspace-file-open-policy.ts'

function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

export function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

/**
 * Compare an opaque launch capability without leaking a matching prefix. A
 * missing, malformed, or wrong-length header is padded before comparison too,
 * so every request with a configured secret reaches `timingSafeEqual`.
 */
function capabilityTokenMatches(expected: string | undefined, supplied: string | string[] | undefined): boolean {
  if (!isDesktopWorkspaceFileOpenToken(expected)) return false
  const expectedBytes = Buffer.from(expected, 'utf8')
  const suppliedBytes = typeof supplied === 'string' ? Buffer.from(supplied, 'utf8') : Buffer.alloc(0)
  const paddedSupplied = Buffer.alloc(expectedBytes.length)
  suppliedBytes.copy(paddedSupplied, 0, 0, expectedBytes.length)
  const equal = timingSafeEqual(expectedBytes, paddedSupplied)
  return suppliedBytes.length === expectedBytes.length && equal
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > maxBytes) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return undefined
  }
}

/** Enforce the Desktop main-process capability before reading a request or consulting Host state. */
export function desktopJsonPost(
  capabilityToken: string | undefined,
  maxBodyBytes: number,
  handleBody: (body: unknown, response: ServerResponse) => Promise<void>,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    function reject(status: number, code: string, message: string): void {
      writeJson(response, status, { ok: false, error: { code, message } })
    }
    if (!isLoopbackRequest(request)) return reject(403, 'forbidden', 'loopback-only')
    if (!capabilityTokenMatches(capabilityToken, request.headers[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER])) {
      return reject(403, 'forbidden', 'desktop capability required')
    }
    if (request.method !== 'POST') return reject(405, 'method-not-allowed', 'POST is required')
    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return reject(415, 'invalid-content-type', 'application/json is required')
    }
    await handleBody(await readJsonBody(request, maxBodyBytes), response)
  }
}
