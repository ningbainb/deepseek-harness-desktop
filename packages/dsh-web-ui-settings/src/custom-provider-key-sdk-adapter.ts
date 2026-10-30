import type { IncomingMessage, ServerResponse } from 'node:http'
import { credentialRef, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { createBridgeRouteGuard, type BridgeAccess } from './bridge.ts'
import { CUSTOM_PROVIDER_KEY_PREFLIGHT_PATH } from './protocol.ts'

type Credentials = Pick<CredentialProvider, 'describe' | 'set'>
export type CustomProviderCredentialRef = Parameters<Credentials['set']>[0]
const QUEUES = Symbol.for('dsh-web-ui.custom-provider-key-preflight.queues.v1')
const MAX_BODY_BYTES = 64 * 1024

function queues(): Map<string, Promise<unknown>> {
  const registry = globalThis as typeof globalThis & { [key: symbol]: Map<string, Promise<unknown>> | undefined }
  return registry[QUEUES] ??= new Map<string, Promise<unknown>>()
}

async function exclusive<T>(ref: string, action: () => Promise<T>): Promise<T> {
  const registry = queues()
  const previous = registry.get(ref) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(action)
  registry.set(ref, current)
  try { return await current } finally { if (registry.get(ref) === current) registry.delete(ref) }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += bytes.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown } catch { return undefined }
}

function respond(res: ServerResponse, status: number, ok: boolean): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify({ ok }))
}

/** Serialize the SDK's live presence check and first write across Desktop windows/partitions. */
export function makeCustomProviderKeyPreflight(credentials: Credentials, access?: BridgeAccess): WebRoute & { dispose(): void } {
  const guard = createBridgeRouteGuard(access)
  let disposed = false
  const requireActive = (): void => { if (disposed) throw new Error('credential preflight disposed') }
  return {
    kind: 'exact',
    path: CUSTOM_PROVIDER_KEY_PREFLIGHT_PATH,
    dispose() { disposed = true },
    handler: async (req, res) => {
      if (!guard(req, res)) return
      const body = await readBody(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || !('ref' in body) || typeof body.ref !== 'string'
        || !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_API_KEY$/u.test(body.ref)
        || !('value' in body) || typeof body.value !== 'string' || !body.value.trim()) {
        respond(res, 400, false)
        return
      }
      const { ref, value } = body
      try {
        await exclusive(ref, async () => {
          requireActive()
          const name = credentialRef(ref)
          const before = await credentials.describe(name)
          requireActive()
          // Never replace an existing reference during preflight: it can be shared.
          if (before.configured) return
          if (!before.writable) throw new Error('credential preflight is read-only')
          await credentials.set(name, value)
          requireActive()
          const confirmed = await credentials.describe(name)
          requireActive()
          if (!confirmed.configured) throw new Error('credential save unconfirmed')
        })
        respond(res, 200, true)
      } catch { respond(res, 503, false) }
    },
  }
}
