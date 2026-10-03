import type {
  AuthorizationEntry,
  AuthorizationInteraction,
  AuthorizationOutcome,
  AuthorizationPrompt,
} from '@deepseek-ai/dsh-authorization'
import { credentialKey, type CredentialKey, type CredentialRecordInfo } from '@deepseek-ai/dsh-credentials'
import type {
  ChatGptAuthNoticeView,
  ChatGptAuthPhase,
  ChatGptAuthPromptView,
  ChatGptAuthState,
  ChatGptLoginMode,
} from './chatgpt-auth-protocol.ts'

/** Official DSH 0.1.6 record written by the built-in pi-ai OpenAI Codex flow. */
export const CHATGPT_CREDENTIAL_KEY = credentialKey('llm-pi-ai', 'openai-codex')

const MAX_LABEL_CHARS = 256
const MAX_MESSAGE_CHARS = 2_048
const MAX_URL_CHARS = 4_096
const MAX_CODE_CHARS = 256
const MAX_ANSWER_CHARS = 8_192

/** Narrow official authorization face used by the controller. */
export interface ChatGptAuthorizationFace {
  describe(key: CredentialKey): AuthorizationEntry | undefined
  begin(request: {
    key: CredentialKey
    method?: string
    interaction: AuthorizationInteraction
    signal?: AbortSignal
  }): Promise<AuthorizationOutcome>
  cancel(key: CredentialKey): void
}

/** Value-free credential operations used by this surface. */
export interface ChatGptCredentialFace {
  describeRecord(key: CredentialKey): Promise<CredentialRecordInfo>
  deleteRecord(key: CredentialKey): Promise<void>
}

/** Dependencies supplied by the injected Runtime services. */
export interface ChatGptAuthorizationDeps {
  authorization: ChatGptAuthorizationFace
  credentials: ChatGptCredentialFace
  onError?: (error: unknown) => void
}

interface PendingPrompt {
  view: ChatGptAuthPromptView
  resolve: (answer: string) => void
  reject: (error: Error) => void
  dispose: () => void
}

function boundedText(value: unknown, maximum: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  return value.slice(0, maximum)
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_CHARS) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return undefined
    return url.href
  } catch {
    return undefined
  }
}

function noticeView(notice: { message: string; url?: string; code?: string }): ChatGptAuthNoticeView {
  const url = safeUrl(notice.url)
  const code = boundedText(notice.code, MAX_CODE_CHARS)
  return {
    message: boundedText(notice.message, MAX_MESSAGE_CHARS, 'Continue signing in.'),
    ...url === undefined ? {} : { url },
    ...code === '' ? {} : { code },
  }
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  let current = error
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth += 1) {
    chain.push(current)
    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : undefined
  }
  return chain
}

/** Reduce provider errors to a fixed, value-free troubleshooting vocabulary. */
export function chatGptAuthErrorCode(error: unknown): string {
  for (const candidate of errorChain(error)) {
    const code = typeof candidate === 'object' && candidate !== null && 'code' in candidate
      ? (candidate as { code?: unknown }).code
      : undefined
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_-]{0,63}$/u.test(code)) return code
  }
  const message = errorChain(error)
    .map(candidate => candidate instanceof Error ? candidate.message : '')
    .join(' ')
    .toLowerCase()
  if (/token (?:exchange|endpoint)|oauth\/token/u.test(message)) return 'TOKEN_EXCHANGE_FAILED'
  if (/failed to extract accountid|account id/u.test(message)) return 'ACCOUNT_NOT_AVAILABLE'
  if (/state mismatch/u.test(message)) return 'AUTH_STATE_MISMATCH'
  if (/missing authorization code/u.test(message)) return 'AUTH_CODE_MISSING'
  if (/no credential store|not committed|read.?only|eacces|eperm/u.test(message)) return 'CREDENTIAL_STORE_FAILED'
  if (/fetch failed|network|econn|enotfound|timed? ?out|socket/u.test(message)) return 'AUTH_NETWORK_FAILED'
  return 'AUTHORIZATION_FAILED'
}

function canAutoAnswerLoginMode(prompt: AuthorizationPrompt, mode: ChatGptLoginMode | undefined): boolean {
  if (mode === undefined || prompt.kind !== 'select') return false
  const ids = new Set(prompt.options.map(option => option.id))
  return ids.has('browser') && ids.has('device_code') && ids.has(mode)
}

/**
 * Own one local authorization attempt while projecting only value-free state.
 * OAuth grants stay inside the official credential service and pi-ai store.
 */
export class ChatGptAuthorizationController {
  private phase: ChatGptAuthPhase = 'idle'
  private notice: ChatGptAuthNoticeView | undefined
  private pending: PendingPrompt | undefined
  private failureCode: string | undefined
  private operation: Promise<void> | undefined
  private attemptAbort: AbortController | undefined
  private promptSequence = 0

  constructor(private readonly deps: ChatGptAuthorizationDeps) {}

  /** Read the live flow and record facts without reading the credential value. */
  async state(): Promise<ChatGptAuthState> {
    const entry = this.deps.authorization.describe(CHATGPT_CREDENTIAL_KEY)
    let record: CredentialRecordInfo
    try {
      record = await this.deps.credentials.describeRecord(CHATGPT_CREDENTIAL_KEY)
    } catch (error) {
      this.deps.onError?.(error)
      record = { configured: false, writable: false }
    }
    return {
      available: entry !== undefined,
      configured: record.configured,
      writable: record.writable,
      inFlight: entry?.inFlight === true || this.operation !== undefined,
      ...entry === undefined ? {} : {
        label: boundedText(entry.label, MAX_LABEL_CHARS, 'ChatGPT (Codex)'),
      },
      methods: (entry?.methods ?? []).map(method => ({
        id: boundedText(method.id, MAX_LABEL_CHARS),
        label: boundedText(method.label, MAX_LABEL_CHARS),
      })),
      phase: this.phase,
      ...this.notice === undefined ? {} : { notice: this.notice },
      ...this.pending === undefined ? {} : { prompt: this.pending.view },
      ...this.failureCode === undefined ? {} : { errorCode: this.failureCode },
    }
  }

  /** Start the official OAuth flow and return immediately for polling clients. */
  async begin(method?: string, loginMode?: ChatGptLoginMode): Promise<ChatGptAuthState> {
    const entry = this.deps.authorization.describe(CHATGPT_CREDENTIAL_KEY)
    if (entry === undefined) throw new ChatGptAuthError('authorization-unavailable')
    if (this.operation !== undefined || entry.inFlight) throw new ChatGptAuthError('authorization-in-flight')
    const selectedMethod = method ?? entry.methods[0]?.id
    if (selectedMethod === undefined || !entry.methods.some(candidate => candidate.id === selectedMethod)) {
      throw new ChatGptAuthError('authorization-method-unavailable')
    }

    this.clearPending(new Error('authorization prompt replaced'))
    this.notice = undefined
    this.failureCode = undefined
    this.phase = 'starting'
    const attemptAbort = new AbortController()
    this.attemptAbort = attemptAbort
    const interaction: AuthorizationInteraction = {
      notify: notice => {
        if (this.attemptAbort !== attemptAbort) return
        const next = noticeView(notice)
        // A progress-only notice must not erase the URL or device code the
        // user still needs to finish the same attempt.
        this.notice = {
          ...next,
          ...next.url === undefined && this.notice?.url !== undefined ? { url: this.notice.url } : {},
          ...next.code === undefined && this.notice?.code !== undefined ? { code: this.notice.code } : {},
        }
        this.phase = 'awaiting-user'
      },
      prompt: prompt => canAutoAnswerLoginMode(prompt, loginMode)
        ? Promise.resolve(loginMode as ChatGptLoginMode)
        : this.prompt(prompt, attemptAbort),
    }
    const operation = Promise.resolve()
      .then(() => this.deps.authorization.begin({
        key: CHATGPT_CREDENTIAL_KEY,
        method: selectedMethod,
        interaction,
        signal: attemptAbort.signal,
      }))
      .then((outcome) => {
        if (this.attemptAbort !== attemptAbort) return
        this.phase = outcome.status === 'authorized' ? 'authorized' : 'cancelled'
        this.notice = undefined
        this.clearPending(new Error('authorization settled'))
      })
      .catch((error: unknown) => {
        if (this.attemptAbort !== attemptAbort || this.phase === 'cancelled') return
        this.failureCode = chatGptAuthErrorCode(error)
        this.phase = 'failed'
        this.clearPending(new Error('authorization failed'))
        this.deps.onError?.(error)
      })
      .finally(() => {
        if (this.attemptAbort !== attemptAbort) return
        this.operation = undefined
        this.attemptAbort = undefined
      })
    this.operation = operation
    return this.state()
  }

  /** Resolve only the currently displayed prompt. */
  async answer(promptId: string, answer: string): Promise<ChatGptAuthState> {
    const pending = this.pending
    if (pending === undefined || promptId !== pending.view.id) throw new ChatGptAuthError('authorization-prompt-stale')
    if (typeof answer !== 'string' || answer.length === 0 || answer.length > MAX_ANSWER_CHARS) {
      throw new ChatGptAuthError('authorization-answer-invalid')
    }
    this.pending = undefined
    pending.dispose()
    this.phase = 'starting'
    pending.resolve(answer)
    return this.state()
  }

  /** Withdraw the current official attempt without changing stored credentials. */
  async cancel(): Promise<ChatGptAuthState> {
    if (this.operation !== undefined) {
      this.phase = 'cancelled'
      this.notice = undefined
      this.clearPending(new Error('authorization cancelled'))
      this.attemptAbort?.abort()
      this.deps.authorization.cancel(CHATGPT_CREDENTIAL_KEY)
    }
    return this.state()
  }

  /** Delete only the DSH-owned pi-ai OpenAI Codex credential record. */
  async logout(): Promise<ChatGptAuthState> {
    if (this.operation !== undefined) await this.cancel()
    await this.deps.credentials.deleteRecord(CHATGPT_CREDENTIAL_KEY)
    this.phase = 'idle'
    this.notice = undefined
    this.failureCode = undefined
    return this.state()
  }

  /** Cancel transient work when the owning Cordis effect disposes. */
  dispose(): void {
    if (this.operation === undefined) return
    this.phase = 'cancelled'
    this.clearPending(new Error('authorization surface disposed'))
    this.attemptAbort?.abort()
    this.deps.authorization.cancel(CHATGPT_CREDENTIAL_KEY)
  }

  private prompt(prompt: AuthorizationPrompt, attemptAbort: AbortController): Promise<string> {
    if (this.attemptAbort !== attemptAbort || attemptAbort.signal.aborted) {
      return Promise.reject(new Error('authorization attempt is no longer active'))
    }
    this.clearPending(new Error('authorization prompt replaced'))
    const id = String(++this.promptSequence)
    const view: ChatGptAuthPromptView = {
      id,
      kind: prompt.kind,
      message: boundedText(prompt.message, MAX_MESSAGE_CHARS, 'Continue signing in.'),
      ...prompt.kind === 'select'
        ? {
            options: prompt.options.slice(0, 32).map(option => ({
              id: boundedText(option.id, MAX_LABEL_CHARS),
              label: boundedText(option.label, MAX_LABEL_CHARS),
              ...option.description === undefined
                ? {}
                : { description: boundedText(option.description, MAX_MESSAGE_CHARS) },
            })),
          }
        : prompt.placeholder === undefined
          ? {}
          : { placeholder: boundedText(prompt.placeholder, MAX_LABEL_CHARS) },
    }
    this.phase = 'awaiting-user'
    return new Promise<string>((resolve, reject) => {
      const signal = prompt.signal
      const onAbort = (): void => {
        if (this.pending?.view.id === id) this.pending = undefined
        reject(new Error('authorization prompt withdrawn'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending = {
        view,
        resolve,
        reject,
        dispose: () => signal?.removeEventListener('abort', onAbort),
      }
    })
  }

  private clearPending(error: Error): void {
    const pending = this.pending
    if (pending === undefined) return
    this.pending = undefined
    pending.dispose()
    pending.reject(error)
  }
}

/** Stable local error codes mapped by the bridge without exposing provider text. */
export class ChatGptAuthError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ChatGptAuthError'
  }
}
