import { reportFeatureEvent } from '../feature-telemetry.ts'

interface UploadStore {
  getSnapshot(): Record<string, { readonly status: string }>
  subscribe(listener: () => void): () => void
}

/** Observe native outcomes without sending names, paths, ids or file content. */
export function observeNativeUploadEvents(store: UploadStore): () => void {
  let previous = new Map(Object.entries(store.getSnapshot()).map(([id, upload]) => [id, upload.status]))
  const off = store.subscribe(() => {
    const next = new Map(Object.entries(store.getSnapshot()).map(([id, upload]) => [id, upload.status]))
    for (const [id, state] of next) {
      if (previous.get(id) === state) continue
      const outcome = state === 'uploading' ? 'started' : state === 'ready' ? 'succeeded' : state === 'error' ? 'failed' : undefined
      if (outcome) reportFeatureEvent({ feature: 'attachment', outcome, detail: 'file' })
    }
    for (const [id, state] of previous) {
      if (state === 'uploading' && !next.has(id)) reportFeatureEvent({ feature: 'attachment', outcome: 'cancelled', detail: 'file' })
    }
    // Bound retained identities to the SDK's live drafts, not lifetime upload count.
    previous = next
  })
  return () => { off(); previous.clear() }
}
