import type { RelayResponse } from '../relay-protocol.ts'

export class RelayClientError extends Error {
  constructor(readonly code: string) { super(code) }
}

export async function postRelay<T extends RelayResponse>(path: string, body: unknown = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      cache: 'no-store', redirect: 'error', body: JSON.stringify(body), signal: controller.signal,
    })
    let value: unknown
    try { value = await response.json() }
    catch {
      throw new RelayClientError(controller.signal.aborted ? 'unreachable' : 'malformed-response')
    }
    if (typeof value !== 'object' || value === null || !('ok' in value)) throw new RelayClientError('malformed-response')
    if (value.ok !== true || !response.ok) {
      throw new RelayClientError('code' in value && typeof value.code === 'string' ? value.code : response.status === 403 ? 'forbidden' : 'request-failed')
    }
    return value as T
  } catch (error) {
    if (error instanceof RelayClientError) throw error
    throw new RelayClientError('unreachable')
  } finally { clearTimeout(timer) }
}

export function announceRelayModels(): void {
  window.dispatchEvent(new Event('dsh-relay-models-updated'))
  if (typeof BroadcastChannel !== 'function') return
  try {
    const channel = new BroadcastChannel('dsh-model-selection-confirmed-v1')
    channel.postMessage({ provider: 'project-relay' })
    channel.close()
  } catch {}
}
