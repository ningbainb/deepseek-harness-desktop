import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { ChatGptAuthState } from '../chatgpt-auth-protocol.ts'
import { chatGptAuthClient, ChatGptAuthClientError } from './chatgpt-auth-client.ts'
import type { ChatGptAuthKey } from './locales.ts'
import css from './chatgpt-auth.module.css'

export interface ChatGptAuthSectionProps {
  close: () => void
  t: (key: ChatGptAuthKey, params?: Record<string, unknown>) => string
}

type SurfaceError = 'transport' | 'authorization'

function errorKind(error: unknown): SurfaceError {
  if (error instanceof ChatGptAuthClientError && [
    'transport-unavailable',
    'transport-rejected',
    'response-invalid',
  ].includes(error.code)) return 'transport'
  return 'authorization'
}

/** First-level settings surface for the official RC.1 OpenAI Codex flow. */
export function ChatGptAuthSection({ t }: ChatGptAuthSectionProps): ReactNode {
  const [state, setState] = useState<ChatGptAuthState>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<SurfaceError>()
  const [answer, setAnswer] = useState('')

  const refresh = useCallback(async () => {
    try {
      setState(await chatGptAuthClient.state())
      setError(undefined)
    } catch (cause) {
      setError(errorKind(cause))
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (state?.inFlight !== true && state?.phase !== 'starting' && state?.phase !== 'awaiting-user') return
    const timer = window.setTimeout(() => { void refresh() }, 900)
    return () => window.clearTimeout(timer)
  }, [refresh, state?.inFlight, state?.phase, state?.notice?.url, state?.prompt?.id])

  const run = useCallback(async (operation: () => Promise<ChatGptAuthState>) => {
    if (pending) return
    setPending(true)
    setError(undefined)
    try {
      setState(await operation())
    } catch (cause) {
      setError(errorKind(cause))
    } finally {
      setPending(false)
    }
  }, [pending])

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
        <div className={css.mark} aria-hidden="true">C</div>
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
              {pending || state?.phase === 'starting'
                ? t('working' satisfies ChatGptAuthKey)
                : t('login' satisfies ChatGptAuthKey)}
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
