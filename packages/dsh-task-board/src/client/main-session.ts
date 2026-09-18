import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    taskBoard: unknown
  }
}

/** Main-view selection is owned by uiWorkspace, not the 0.1.6 Session catalog. */
export function mainSessionId(list: Pick<SessionListState, 'byId'>): SessionId | undefined {
  return Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
}
