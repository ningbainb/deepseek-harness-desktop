import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ModelDirectoryResolver } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { BalanceController } from './balance-controller.ts'

/** Observe the same per-session selection as the native model picker, without polling the catalog. */
export function followBalanceSelection(controller: BalanceController, sessions: Pick<ISessions, 'list'>, models: ModelDirectoryResolver): () => void {
  let current: string | undefined | null = null
  let unsubscribeModel: (() => void) | undefined
  let disposed = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let attempts = 0
  const sync = () => {
    if (disposed) return
    const id = sessions.list.getSnapshot().current
    if (id === current && (!id || unsubscribeModel)) return
    if (id !== current) { attempts = 0; clearTimeout(retry) }
    current = id
    unsubscribeModel?.()
    unsubscribeModel = undefined
    controller.setSelection(id ? null : undefined)
    if (!id) return
    try {
      const directory = models.directoryFor(id)
      const update = () => {
        if (disposed || current !== id) return
        const selection = directory.store.getSnapshot().current
        controller.setSelection(selection ? { provider: selection.provider, model: selection.model } : null)
      }
      unsubscribeModel = directory.store.subscribe(update)
      update()
      void directory.load().then(update).catch(() => {})
    } catch {
      controller.setSelection(null)
      // Session selection can publish before its scope binding is attached.
      // Retry that local seam only; never poll the network or query a different account.
      if (++attempts < 10) retry = setTimeout(sync, 100)
    }
  }
  const unsubscribeSessions = sessions.list.subscribe(sync)
  sync()
  return () => { disposed = true; clearTimeout(retry); unsubscribeSessions(); unsubscribeModel?.() }
}
