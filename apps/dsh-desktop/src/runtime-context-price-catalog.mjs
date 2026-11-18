import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'

export const CONTEXT_PRICE_CATALOG_URL = 'https://models.dev/api.json'
const archive = new URL('../runtime-support/context-model-prices.json.gz', import.meta.url)
const decompress = promisify(gunzip)

async function readSnapshot() {
  return decompress(await readFile(archive))
}

// dsh-context's wire projection can start pricing on an ordinary session
// before its Context panel is opened. Reuse the Desktop release's snapshot
// for the exact catalog URL and leave other fetch calls on their own path.
export function installDesktopContextPriceCatalogFetch(target = globalThis, load = readSnapshot) {
  const original = target.fetch
  let pending
  async function fetchContextCatalog(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    const method = init?.method ?? input?.method ?? 'GET'
    if (url !== CONTEXT_PRICE_CATALOG_URL || !/^GET$/iu.test(method)) return original.call(target, input, init)
    const signal = init?.signal ?? input?.signal
    signal?.throwIfAborted()
    pending ??= Promise.resolve().then(load).finally(() => { pending = undefined })
    const bytes = await pending.catch(() => undefined)
    signal?.throwIfAborted()
    if (bytes === undefined) return new Response(null, { status: 503 })
    return new Response(bytes, { headers: { 'content-type': 'application/json' } })
  }
  target.fetch = fetchContextCatalog
  return () => { if (target.fetch === fetchContextCatalog) target.fetch = original }
}
