import type { WinControlSettings } from '../core/settings.ts'

export interface MirrorStatus {
  id: string
  label: string
  indexUrl: string
  official: boolean
  ok: boolean
  indexMs?: number
  downloadMs?: number
  bytes?: number
  speedBps?: number
  version?: string
  error?: string
}

export interface InstallerState {
  state: 'idle' | 'probing' | 'installing' | 'succeeded' | 'failed' | 'cancelled'
  version: string
  currentMirror?: string
  message?: string
  error?: string
  executable?: string
  logs: string[]
  mirrors: MirrorStatus[]
}

export interface WinControlStateResponse {
  platform: string
  pinnedVersion: string
  installedVersions: Array<{ version: string; executable: string; installedAt: string | null; mirror: string | null }>
  bridgedToolCount: number
  bridgedTools: string[]
  sessionGranted: boolean
  settings: WinControlSettings
  installer: InstallerState
  mirrors: MirrorStatus[]
}

const HEADERS = {
  'content-type': 'application/json',
  'x-dsh-win-control': '1',
} as const

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/dsh-win-control${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...HEADERS,
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`win-control request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function fetchWinControlState(sessionId?: string | null): Promise<WinControlStateResponse> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
  return callApi<WinControlStateResponse>(`/state${query}`, { method: 'GET' })
}

export function setSessionWinControlGrant(sessionId: string, enabled: boolean): Promise<{ sessionId: string; enabled: boolean }> {
  return callApi('/grant', {
    method: 'POST',
    body: JSON.stringify({ sessionId, enabled }),
  })
}

export function saveWinControlSettings(settings: WinControlSettings): Promise<{ settings: WinControlSettings; problems: string[] }> {
  return callApi('/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  })
}

export function probeWinControlMirrors(): Promise<{ mirrors: MirrorStatus[] }> {
  return callApi('/mirrors/probe', { method: 'POST', body: '{}' })
}

export function startWinControlInstall(): Promise<{ installer: InstallerState }> {
  return callApi('/install', { method: 'POST', body: '{}' })
}

export function cancelWinControlInstall(): Promise<{ installer: InstallerState }> {
  return callApi('/install/cancel', { method: 'POST', body: '{}' })
}

export function runWinControlDoctor(): Promise<{ report: string; bridgedCount: number }> {
  return callApi('/doctor', { method: 'POST', body: '{}' })
}
