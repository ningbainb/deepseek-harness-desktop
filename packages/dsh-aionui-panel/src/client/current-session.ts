import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Resolve the session retained by the main view in the current SDK. */
export function currentSessionId(snapshot: SessionListState): SessionId | undefined {
  const main = Object.values(snapshot.byId ?? {}).find(row => Object.entries(row.retainedBy ?? {})
    .some(([source, count]) => source === 'mainView' && count > 0))?.id
  return main ?? (snapshot as SessionListState & { current?: SessionId }).current
}
