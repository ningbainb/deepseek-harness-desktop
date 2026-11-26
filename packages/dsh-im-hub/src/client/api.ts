import type {
  ChannelId,
  ChannelStatusSnapshot,
  DiagnosticEvent,
  ImHubSettings,
} from '../core/settings.ts'

export interface ImHubStateResponse {
  settings: ImHubSettings
  channels: Record<ChannelId, ChannelStatusSnapshot>
  events: DiagnosticEvent[]
  pendingApprovals: number
  webhookEndpoints: {
    wecom: string
    webhook: string
  }
}

const HEADERS = {
  'content-type': 'application/json',
  'x-dsh-im-hub': '1',
} as const

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/dsh-im-hub${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...HEADERS,
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`im-hub request failed (${response.status})`)
  return response.json() as Promise<T>
}

export function fetchImHubState(): Promise<ImHubStateResponse> {
  return callApi<ImHubStateResponse>('/state', { method: 'GET' })
}

export function saveImHubSettings(
  settings: ImHubSettings,
): Promise<{ settings: ImHubSettings; problems: string[] }> {
  return callApi('/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  })
}

export function testImHubChannel(
  channel: ChannelId,
): Promise<{ ok: boolean; detail: string }> {
  return callApi('/channel/test', {
    method: 'POST',
    body: JSON.stringify({ channel }),
  })
}

export function restartImHubChannel(
  channel: ChannelId,
): Promise<{ status: ChannelStatusSnapshot }> {
  return callApi('/channel/restart', {
    method: 'POST',
    body: JSON.stringify({ channel }),
  })
}
