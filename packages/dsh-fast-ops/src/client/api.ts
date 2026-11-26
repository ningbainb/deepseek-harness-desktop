import type { FastOpsSettings } from '../core/settings.ts'

export interface FastOpsStateResponse {
  settings: FastOpsSettings
  counters: {
    batchCalls: number
    filesReadInBatches: number
    cacheSpills: number
    toolsActivated: number
  }
  cache: {
    totalRefs: number
    totalBytes: number
    totalItems: number
  }
}

const HEADERS = {
  'content-type': 'application/json',
  'x-dsh-fast-ops': '1',
} as const

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/dsh-fast-ops${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...HEADERS,
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`fast-ops request failed (${response.status})`)
  return response.json() as Promise<T>
}

export function fetchFastOpsState(): Promise<FastOpsStateResponse> {
  return callApi<FastOpsStateResponse>('/state', { method: 'GET' })
}

export function saveFastOpsSettings(settings: FastOpsSettings): Promise<{ settings: FastOpsSettings; problems: string[] }> {
  return callApi('/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  })
}

export function reclaimFastOpsCache(): Promise<{ reclaimed: number; cache: FastOpsStateResponse['cache'] }> {
  return callApi('/cache/reclaim', { method: 'POST', body: '{}' })
}
