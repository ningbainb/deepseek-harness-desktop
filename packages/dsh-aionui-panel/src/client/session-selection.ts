import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** The 0.1.6 Session catalog no longer owns navigation; mainView retention does. */
export function currentMainSessionId(list: Pick<SessionListState, 'byId'>): SessionId | undefined {
  return Object.values(list.byId ?? {}).find(session => Object.entries(session.retainedBy ?? {})
    .some(([source, count]) => source === 'mainView' && count > 0))?.id
}
