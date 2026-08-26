import {
  CHATGPT_AUTH_BRIDGE_PREFIX,
  type ChatGptAuthResult,
  type ChatGptAuthState,
} from '../chatgpt-auth-protocol.ts'

function isState(value: unknown): value is ChatGptAuthState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Partial<ChatGptAuthState>
  return typeof candidate.available === 'boolean'
    && typeof candidate.configured === 'boolean'
    && typeof candidate.writable === 'boolean'
    && typeof candidate.inFlight === 'boolean'
    && Array.isArray(candidate.methods)
    && ['idle', 'starting', 'awaiting-user', 'authorized', 'cancelled', 'failed'].includes(String(candidate.phase))
}

async function invoke(path: string, body: Record<string, unknown> = {}): Promise<ChatGptAuthState> {
  let response: Response
  try {
    response = await fetch(CHATGPT_AUTH_BRIDGE_PREFIX + path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ChatGptAuthClientError('transport-unavailable')
  }
  if (!response.ok) throw new ChatGptAuthClientError('transport-rejected')
  let result: ChatGptAuthResult
  try {
    result = await response.json() as ChatGptAuthResult
  } catch {
    throw new ChatGptAuthClientError('response-invalid')
  }
  if (typeof result !== 'object' || result === null || typeof result.ok !== 'boolean') {
    throw new ChatGptAuthClientError('response-invalid')
  }
  if (!result.ok) throw new ChatGptAuthClientError(typeof result.code === 'string' ? result.code : 'authorization-failed')
  if (!isState(result.value)) throw new ChatGptAuthClientError('response-invalid')
  return result.value
}

export const chatGptAuthClient = {
  state: () => invoke('/state'),
  begin: (method?: string) => invoke('/begin', method === undefined ? {} : { method }),
  answer: (promptId: string, answer: string) => invoke('/answer', { promptId, answer }),
  cancel: () => invoke('/cancel'),
  logout: () => invoke('/logout'),
}

/** Stable client failure; provider messages and credential values never cross the bridge. */
export class ChatGptAuthClientError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ChatGptAuthClientError'
  }
}
