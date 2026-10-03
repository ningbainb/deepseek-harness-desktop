import type { ISessions, SessionBinding, SessionEventSource } from '@deepseek-ai/dsh-api-session-controller/client'
import { RELAY_PROVIDER_ID } from '../relay-protocol.ts'
import { RELAY_SIGN_IN_REQUIRED_EVENT } from './relay-send-guard.ts'

export function watchRelayAuthFailures(source: SessionEventSource, doc: Document): () => void {
  let watermark = -1
  let provider: string | undefined
  const read = (notify: boolean) => {
    for (const entry of source.getSnapshot().entries) {
      if (entry.type !== 'event' || entry.event.seq <= watermark) continue
      const event = entry.event
      watermark = event.seq
      if (event.type === 'request/context') provider = event.data.provider
      if (event.type === 'request/header') provider = event.data.header.config.provider
      if (notify && provider === RELAY_PROVIDER_ID && event.type === 'turn/end' && event.data.reason.kind === 'error'
        && (event.data.reason.error.code === 'AUTH' || event.data.reason.error.status === 401)) {
        doc.dispatchEvent(new CustomEvent(RELAY_SIGN_IN_REQUIRED_EVENT, { detail: { reason: 'relay-auth' } }))
      }
    }
  }
  read(false)
  return source.subscribe(() => read(true))
}

export function installRelayAuthFailures(sessions: ISessions, doc: Document): () => void {
  const watching = new Map<string, { binding: SessionBinding; dispose(): void }>()
  const reconcile = () => {
    const state = sessions.list.getSnapshot()
    for (const [id, watch] of watching) {
      if (!state.byId[id as SessionBinding['sessionId']] || sessions.binding(watch.binding.sessionId) !== watch.binding) {
        watch.dispose()
        watching.delete(id)
      }
    }
    for (const summary of Object.values(state.byId)) {
      const binding = sessions.binding(summary.id)
      if (binding && !watching.has(String(summary.id))) {
        watching.set(String(summary.id), { binding, dispose: watchRelayAuthFailures(binding.eventSource, doc) })
      }
    }
  }
  reconcile()
  const unsubscribe = sessions.list.subscribe(reconcile)
  return () => { unsubscribe(); for (const watch of watching.values()) watch.dispose(); watching.clear() }
}
