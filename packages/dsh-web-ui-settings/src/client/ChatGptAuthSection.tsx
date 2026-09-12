import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ChatGptAuthState } from '../chatgpt-auth-protocol.ts'
import { chatGptAuthClient, ChatGptAuthClientError } from './chatgpt-auth-client.ts'
import type { ChatGptAuthKey } from './locales.ts'
import css from './chatgpt-auth.module.css'

export interface ChatGptAuthSectionProps {
  close: () => void
  t: (key: ChatGptAuthKey, params?: Record<string, unknown>) => string
}

type SurfaceError = 'transport' | 'authorization'

const OPENAI_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1635a.0804.0804 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4019-.6863zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1635a.0804.0804 0 0 1-.038-.0568V6.06a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.445a.7948.7948 0 0 0-.3927.6813v6.7369zm1.1077-3.199l2.5835-1.4913 2.5835 1.4913v2.9827l-2.5835 1.4913-2.5835-1.4913z"/>
  </svg>
)

function errorKind(error: unknown): SurfaceError {
  if (error instanceof ChatGptAuthClientError && [
    'transport-unavailable',
    'transport-rejected',
    'response-invalid',
  ].includes(error.code)) return 'transport'
  return 'authorization'
}

function needsRefresh(state: ChatGptAuthState): boolean {
  return state.inFlight || state.phase === 'starting' || state.phase === 'awaiting-user'
}

/** First-level settings surface for the official DSH 0.1.5 OpenAI Codex flow. */
export function ChatGptAuthSection({ t }: ChatGptAuthSectionProps): ReactNode {
  const [state, setState] = useState<ChatGptAuthState>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<SurfaceError>()
  const [answer, setAnswer] = useState('')
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const mounted = useRef(false)
  const generation = useRef(0)
  const operationPending = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; generation.current++ }
  }, [])

  const refresh = useCallback(async () => {
    const requestGeneration = generation.current
    try {
      const next = await chatGptAuthClient.state()
      if (!mounted.current || requestGeneration !== generation.current) return
      setState(next)
      setError(undefined)
      return next
    } catch (cause) {
      if (mounted.current && requestGeneration === generation.current) setError(errorKind(cause))
    }
  }, [])

  const pollingRequired = state === undefined || needsRefresh(state)
  useEffect(() => {
    if (!pollingRequired || pending) return
    let disposed = false
    let timer: number | undefined
    const poll = async () => {
      if (disposed || operationPending.current) return
      const requestGeneration = generation.current
      const next = await refresh()
      if (disposed || operationPending.current || requestGeneration !== generation.current) return
      if (next !== undefined && !needsRefresh(next)) return
      // Re-arm after unchanged waiting states and retry transient failures.
      // Schedule only after settlement so state requests never overlap.
      timer = window.setTimeout(() => { void poll() }, next === undefined ? 2000 : 900)
    }
    void poll()
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [refresh, pollingRequired, pending, refreshEpoch])

  const run = useCallback(async (operation: () => Promise<ChatGptAuthState>) => {
    if (operationPending.current) return
    operationPending.current = true
    // Reads started before a user operation cannot overwrite its result.
    const requestGeneration = ++generation.current
    setPending(true)
    setError(undefined)
    try {
      const next = await operation()
      if (mounted.current && requestGeneration === generation.current) setState(next)
    } catch (cause) {
      if (mounted.current && requestGeneration === generation.current) setError(errorKind(cause))
    } finally {
      if (mounted.current && requestGeneration === generation.current) {
        operationPending.current = false
        setPending(false)
        // Fast operations can batch pending=true/false into one render. Still
        // replace the invalidated poll loop after answering the current prompt.
        setRefreshEpoch(epoch => epoch + 1)
      }
    }
  }, [])

  const openBrowser = useCallback(() => {
    const href = state?.notice?.url
    if (href === undefined) return
    try {
      const url = new URL(href)
      if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return
      const authWindow = window.open('about:blank', '_blank')
      if (authWindow !== null) authWindow.location.href = url.href
    } catch {
      setError('authorization')
    }
  }, [state?.notice?.url])

  const submitAnswer = useCallback((value: string) => {
    const prompt = state?.prompt
    if (prompt === undefined || value === '') return
    setAnswer('')
    void run(() => chatGptAuthClient.answer(prompt.id, value))
  }, [run, state?.prompt])

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submitAnswer(answer)
  }

  const statusText = state === undefined
    ? t('loading' satisfies ChatGptAuthKey)
    : state.configured
      ? t('signedIn' satisfies ChatGptAuthKey)
      : t('signedOut' satisfies ChatGptAuthKey)

  return (
    <section className={css.section} aria-labelledby="chatgpt-auth-heading">
      <header className={css.header}>
        <div className={css.mark} aria-hidden="true">{OPENAI_ICON}</div>
        <div>
          <h2 id="chatgpt-auth-heading" className={css.heading}>{t('title' satisfies ChatGptAuthKey)}</h2>
          <p className={css.description}>{t('description' satisfies ChatGptAuthKey)}</p>
        </div>
      </header>

      <div className={css.card} aria-live="polite">
        <div className={css.statusRow}>
          <span className={css.statusDot} data-active={state?.configured === true ? 'true' : 'false'} aria-hidden="true" />
          <span className={css.status}>{statusText}</span>
        </div>

        {state?.available === false && <p className={css.message}>{t('unavailable' satisfies ChatGptAuthKey)}</p>}
        {state?.writable === false && state.available && <p className={css.message}>{t('readOnly' satisfies ChatGptAuthKey)}</p>}
        {error !== undefined && (
          <p className={css.error} role="alert">
            {t((error === 'transport' ? 'transportFailed' : 'failed') satisfies ChatGptAuthKey)}
          </p>
        )}
        {state?.phase === 'failed' && error === undefined && (
          <p className={css.error} role="alert">{t('failed' satisfies ChatGptAuthKey)}</p>
        )}

        {state?.notice !== undefined && (
          <div className={css.notice}>
            <p>{state.notice.message}</p>
            {state.notice.code !== undefined && (
              <div className={css.codeRow}>
                <span>{t('codeLabel' satisfies ChatGptAuthKey)}</span>
                <code>{state.notice.code}</code>
              </div>
            )}
            {state.notice.url !== undefined && (
              <button type="button" className={css.secondaryButton} onClick={openBrowser}>
                {t('openBrowser' satisfies ChatGptAuthKey)}
              </button>
            )}
          </div>
        )}

        {state?.prompt?.kind === 'select' && (
          <fieldset className={css.prompt} disabled={pending}>
            <legend>{state.prompt.message}</legend>
            <div className={css.promptOptions}>
              {(state.prompt.options ?? []).map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={css.secondaryButton}
                  title={option.description}
                  onClick={() => submitAnswer(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {(state?.prompt?.kind === 'text' || state?.prompt?.kind === 'secret') && (
          <form className={css.prompt} onSubmit={onSubmit}>
            <label htmlFor="chatgpt-auth-answer">{state.prompt.message}</label>
            <div className={css.answerRow}>
              <input
                id="chatgpt-auth-answer"
                type={state.prompt.kind === 'secret' ? 'password' : 'text'}
                value={answer}
                placeholder={state.prompt.placeholder}
                autoComplete="off"
                disabled={pending}
                onChange={event => setAnswer(event.currentTarget.value)}
              />
              <button type="submit" className={css.secondaryButton} disabled={pending || answer === ''}>
                {t('answer' satisfies ChatGptAuthKey)}
              </button>
            </div>
          </form>
        )}

        <div className={css.actions}>
          {state?.configured === true ? (
            <button
              type="button"
              className={css.secondaryButton}
              disabled={pending || !state.writable}
              onClick={() => { void run(() => chatGptAuthClient.logout()) }}
            >
              {t('logout' satisfies ChatGptAuthKey)}
            </button>
          ) : (
            <button
              type="button"
              className={css.primaryButton}
              disabled={pending || state?.available !== true || !state.writable || state.inFlight}
              onClick={() => { void run(() => chatGptAuthClient.begin()) }}
            >
              {pending || state?.phase === 'starting' ? (
                <>
                  <span className={css.spinner} aria-hidden="true" />
                  <span>{t('working' satisfies ChatGptAuthKey)}</span>
                </>
              ) : (
                <>
                  <span className={css.buttonIcon} aria-hidden="true">{OPENAI_ICON}</span>
                  <span>{t('login' satisfies ChatGptAuthKey)}</span>
                </>
              )}
            </button>
          )}
          {state?.inFlight === true && (
            <button
              type="button"
              className={css.quietButton}
              disabled={pending}
              onClick={() => { void run(() => chatGptAuthClient.cancel()) }}
            >
              {t('cancel' satisfies ChatGptAuthKey)}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
