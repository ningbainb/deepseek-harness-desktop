import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SearchDocument } from '../core/search.ts'
import { digest } from './index-store.ts'

function searchableText(event: SessionEvent): string {
  const content = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.data.content
    : event.type === 'assistant/message' ? event.data.message.content : undefined
  return content?.flatMap(item => item.type === 'text' ? [item.text] : []).join('\n').trim() ?? ''
}

export function sessionDocuments(
  sessionId: string, title: string, workspaceId: string | undefined, events: readonly SessionEvent[],
): SearchDocument[] {
  const docs: SearchDocument[] = []
  let turn = 0
  for (const event of events) {
    if (event.type === 'turn/start') turn = event.data.turn
    const text = searchableText(event)
    if (!text) continue
    const seq = Number(event.seq)
    for (let offset = 0; offset < text.length; offset += 8000) {
      const excerpt = text.slice(offset, offset + 8500)
      docs.push({
        id: digest(sessionId + '\0' + seq + '\0' + offset),
        scope: 'session', sessionId, workspaceId, seq,
        turn: event.type === 'assistant/message' ? event.data.turn : turn,
        text: excerpt, title, updatedAt: event.time,
      })
    }
  }
  return docs
}
