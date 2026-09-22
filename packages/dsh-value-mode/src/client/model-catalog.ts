import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ValueModeModelCatalog } from './ModelPicker.tsx'
import type { ValueModeLocaleKey } from './locales.ts'

export const MODEL_CATALOG_TIMEOUT_MS = 10_000
const MAX_CATALOG_REVISION_RETRIES = 2

/** A bounded advisory read, not a replacement for the native selection directory. */
export function createModelCatalogLoader(ctx: Context, translate: (key: ValueModeLocaleKey) => string) {
  let revision = 0
  let disposed = false
  let cached: { value: ValueModeModelCatalog; expires: number } | undefined
  let pending: Promise<ValueModeModelCatalog> | undefined
  let cancel: (() => void) | undefined
  const invalidate = () => { revision++; cached = undefined; pending = undefined; cancel?.(); cancel = undefined }
  const removers = [
    ctx.on('connection/reset', invalidate),
    ctx.remote.$on('llm/adapters-updated', invalidate),
    ctx.remote.$on('settings/document-updated', invalidate),
    ctx.remote.$on('credentials/reference-updated', invalidate),
    (ctx.get('connection') as ConnectionHandle).generation.subscribe(invalidate),
  ]
  ctx.effect(() => () => { disposed = true; invalidate(); removers.forEach(remove => remove()) }, 'value-mode: model catalog lifetime')

  return function fetchModels(retriesLeft = MAX_CATALOG_REVISION_RETRIES): Promise<ValueModeModelCatalog> {
    if (disposed) return Promise.reject(new Error(translate('catalogUnavailable')))
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value)
    if (pending) return pending
    const started = revision
    let timer: ReturnType<typeof setTimeout>
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error(translate('catalogChanged')))
      timer = setTimeout(() => reject(new Error(translate('catalogTimeout'))), MODEL_CATALOG_TIMEOUT_MS)
    })
    const operation = Promise.race([
      Promise.resolve().then(async () => {
        const response = await ctx.remote.session.modelCatalog()
        if (!response.ok) throw new Error(response.error.message || translate('catalogLoadFailed'))
        return { groups: response.value.groups ?? [], failures: response.value.failures ?? [] }
      }),
      interrupted,
    ]).then(value => {
      if (disposed || started !== revision) throw new Error(translate('catalogChanged'))
      // Short-lived UI reuse only. The Host remains the source of models and permissions.
      cached = { value, expires: Date.now() + 30_000 }
      return value
    }).catch(error => {
      // Packaged startup can publish a newer settings document or Runtime
      // generation while this advisory read is in flight. Read the new catalog
      // instead of making the user retry a stale request by hand.
      if (!disposed && started !== revision && retriesLeft > 0) return fetchModels(retriesLeft - 1)
      throw error
    }).finally(() => {
      clearTimeout(timer)
      if (pending === operation) { pending = undefined; cancel = undefined }
    })
    pending = operation
    return operation
  }
}
