import type { MemoryMatchReason } from '../core/activity.ts'

export interface IndexStatus {
  status: {
    counts: { memory: number; sessions: number; knowledge: number }
    engine: 'fts5' | 'typescript'
    vectorCount: number
  }
  workspaces: Array<{ id: string; title: string }>
  sources: Array<{ path: string; kind: 'path' | 'document' }>
  indexing: boolean
}

export interface SessionMatch {
  sessionId: string
  seq: number
  turn: number
  title: string
  excerpt: string
  timestamp: number
  reasons: readonly MemoryMatchReason[]
}

export const LOCAL_SEARCH_UPDATED_EVENT = 'dsh:local-search-updated'

export async function postLocalSearch<T>(operation: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/dsh-local-search/' + operation, {
    method: 'POST',
    cache: 'no-store',
    signal,
    headers: { 'content-type': 'application/json', 'x-dsh-local-search': '1' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('Local search is unavailable')
  return await response.json() as T
}

export function notifyLocalSearchUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCAL_SEARCH_UPDATED_EVENT))
  }
}
