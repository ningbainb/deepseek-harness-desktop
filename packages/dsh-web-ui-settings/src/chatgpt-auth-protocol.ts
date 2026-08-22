/** Loopback-only bridge prefix for the Desktop ChatGPT authorization surface. */
export const CHATGPT_AUTH_BRIDGE_PREFIX = '/api/dsh-chatgpt-auth'

/** Stable authorization progress states rendered by the settings card. */
export type ChatGptAuthPhase = 'idle' | 'starting' | 'awaiting-user' | 'authorized' | 'cancelled' | 'failed'

/** One value-free authorization method exposed by the official provider flow. */
export interface ChatGptAuthMethodView {
  id: string
  label: string
}

/** One value-free flow notice. */
export interface ChatGptAuthNoticeView {
  message: string
  url?: string
  code?: string
}

/** One selectable answer to an authorization prompt. */
export interface ChatGptAuthPromptOptionView {
  id: string
  label: string
  description?: string
}

/** A prompt description. The answer itself is never projected back into state. */
export interface ChatGptAuthPromptView {
  id: string
  kind: 'text' | 'secret' | 'select'
  message: string
  placeholder?: string
  options?: ChatGptAuthPromptOptionView[]
}

/** Complete value-free state consumed by the settings card. */
export interface ChatGptAuthState {
  available: boolean
  configured: boolean
  writable: boolean
  inFlight: boolean
  label?: string
  methods: ChatGptAuthMethodView[]
  phase: ChatGptAuthPhase
  notice?: ChatGptAuthNoticeView
  prompt?: ChatGptAuthPromptView
  errorCode?: string
}

/** Success/failure envelope shared by every authorization bridge route. */
export type ChatGptAuthResult =
  | { ok: true; value: ChatGptAuthState }
  | { ok: false; code: string }

/** Answer body accepted by the prompt route. */
export interface ChatGptAuthAnswerRequest {
  promptId: string
  answer: string
}
