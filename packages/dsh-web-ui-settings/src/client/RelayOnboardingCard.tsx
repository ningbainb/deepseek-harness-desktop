import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  RELAY_CONFIGURE_PATH,
  RELAY_CONNECT_PATH, RELAY_CONNECT_STATUS_PATH, RELAY_CONNECT_CANCEL_PATH,
  type RelayConnection, type RelayConnectResponse,
  RELAY_KEYS_URL,
  RELAY_REMOVE_PATH,
  RELAY_SIGN_UP_URL,
  RELAY_STATUS_PATH,
  RELAY_WALLET_URL,
  type RelayResponse,
  type RelayStatusResponse,
} from '../relay-protocol.ts'
import type { RelayLocaleKey } from './locales.ts'
import { reportFeatureEvent } from './feature-telemetry.ts'
import { openExternalUrl } from './open-external.ts'
import css from './relay-onboarding.module.css'

export type RelayOnboardingCardProps = PropsLocale<'relay-onboarding'>

type BaiAcquisitionOutcome = 'viewed' | 'started' | 'succeeded' | 'failed' | 'continued'
type BaiAcquisitionDetail = 'entry' | 'browser' | 'manual' | 'model-picker'

function reportBaiAcquisition(outcome: BaiAcquisitionOutcome, detail: BaiAcquisitionDetail): void {
  try {
    const dock = (globalThis as unknown as {
      dshDockSettings?: { recordBaiAcquisitionEvent?: (outcome: BaiAcquisitionOutcome, detail: BaiAcquisitionDetail) => unknown }
    }).dshDockSettings
    if (typeof dock?.recordBaiAcquisitionEvent === 'function') {
      void Promise.resolve(dock.recordBaiAcquisitionEvent(outcome, detail)).catch(() => {})
      return
    }
    reportFeatureEvent({ feature: 'bai-connect', outcome, detail })
  } catch { /* Acquisition telemetry is best effort and carries no user data. */ }
}

class RelayClientError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function postJson<T extends RelayResponse>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    })
  } catch {
    throw new RelayClientError('unreachable')
  }
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new RelayClientError('malformed-response')
  }
  if (!isRecord(value) || value.ok !== true || !response.ok) {
    const code = isRecord(value) && typeof value.code === 'string' ? value.code : response.status === 403 ? 'forbidden' : 'request-failed'
    throw new RelayClientError(code)
  }
  return value as T
}

function countText(template: string, count: number): string {
  return template.replace('{count}', String(count))
}

function errorText(code: string, t: (key: RelayLocaleKey) => string): string {
  switch (code) {
    case 'invalid-key': return t('errorInvalidKey')
    case 'relay-auth': return t('errorRelayAuth')
    case 'relay-rate-limit': return t('errorRelayRateLimit')
    case 'relay-unreachable':
    case 'relay-server':
    case 'relay-http':
    case 'relay-malformed-response':
    case 'relay-response-too-large':
    case 'unreachable': return t('errorRelayUnavailable')
    case 'no-models': return t('errorNoModels')
    case 'credential-save-failed':
    case 'credential-delete-failed': return t('errorCredential')
    case 'settings-save-failed': return t('errorSettings')
    case 'busy': return t('errorBusy')
    case 'forbidden': return t('errorForbidden')
    default: return t('errorGeneric')
  }
}

function statusText(status: RelayStatusResponse | null, loading: boolean, t: (key: RelayLocaleKey) => string): string {
  if (loading) return t('statusLoading')
  if (status === null) return t('statusRemote')
  if (status.configured) return t('statusReady')
  if (status.profileConfigured) return t('statusProfileOnly')
  if (status.credentialConfigured) return t('statusCredentialOnly')
  return t('statusEmpty')
}

export function RelayOnboardingCard(props: RelayOnboardingCardProps) {
  const { t } = props
  const [expanded, setExpanded] = useState(true)
  const [status, setStatus] = useState<RelayStatusResponse | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const [connection, setConnection] = useState<RelayConnection>({ phase: 'idle' })
  const initialStatus = useRef(true)
  const connecting = ['starting', 'pending', 'connecting'].includes(connection.phase)

  const loadStatus = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const next = await postJson<RelayStatusResponse>(RELAY_STATUS_PATH, {})
      setStatus(next)
      if (initialStatus.current && next.configured) setExpanded(false)
      initialStatus.current = false
      setError(undefined)
    } catch (reason) {
      initialStatus.current = false
      setStatus(null)
      setError(errorText(reason instanceof RelayClientError ? reason.code : 'request-failed', t))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    let disposed = false
    reportBaiAcquisition('viewed', 'entry')
    void loadStatus()
    void postJson<RelayConnectResponse>(RELAY_CONNECT_STATUS_PATH, {}).then(result => { if (!disposed) setConnection(result.connection) }).catch(() => {})
    return () => { disposed = true }
  }, [loadStatus])

  useEffect(() => {
    if (!connecting) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await postJson<RelayConnectResponse>(RELAY_CONNECT_STATUS_PATH, {})
        if (disposed) return
        setConnection(result.connection)
        if (result.connection.phase === 'connected') {
          reportBaiAcquisition('succeeded', 'browser')
          setApiKey(''); setNotice(t('connected')); await loadStatus()
        }
        if (['pending', 'connecting', 'starting'].includes(result.connection.phase)) timer = setTimeout(() => { void poll() }, 1000)
      } catch { if (!disposed) timer = setTimeout(() => { void poll() }, 2000) }
    }
    timer = setTimeout(() => { void poll() }, 1000)
    return () => { disposed = true; clearTimeout(timer) }
  }, [connecting, loadStatus, t])

  const connect = async () => {
    reportBaiAcquisition('started', 'browser')
    setConnection({ phase: 'starting' }); setError(undefined); setNotice(undefined)
    try {
      const result = await postJson<RelayConnectResponse>(RELAY_CONNECT_PATH, {})
      setConnection(result.connection)
      if (result.connection.url) openExternalUrl(result.connection.url)
    } catch { reportBaiAcquisition('failed', 'browser'); setConnection({ phase: 'failed' }); setError(t('errorConnect')) }
  }
  const cancel = async () => {
    try { const result = await postJson<RelayConnectResponse>(RELAY_CONNECT_CANCEL_PATH, {}); setConnection(result.connection) }
    catch { setError(t('errorConnect')) }
  }

  const configure = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (saving || clearing || connecting) return
    if (apiKey.trim() === '') {
      setError(t('errorInvalidKey'))
      return
    }
    setSaving(true)
    reportBaiAcquisition('started', 'manual')
    setError(undefined)
    setNotice(undefined)
    void postJson<RelayResponse>(RELAY_CONFIGURE_PATH, { apiKey }).then(async result => {
      if (!('modelCount' in result)) throw new RelayClientError('malformed-response')
      setApiKey('')
      reportBaiAcquisition('succeeded', 'manual')
      setNotice(t('saved'))
      await loadStatus()
    }).catch(reason => {
      reportBaiAcquisition('failed', 'manual')
      setError(errorText(reason instanceof RelayClientError ? reason.code : 'request-failed', t))
    }).finally(() => setSaving(false))
  }

  const clear = (): void => {
    if (saving || clearing || connecting || typeof window === 'undefined' || !window.confirm(t('confirmClear'))) return
    setClearing(true)
    setError(undefined)
    setNotice(undefined)
    void postJson<RelayResponse>(RELAY_REMOVE_PATH, {}).then(async () => {
      setNotice(t('statusEmpty'))
      await loadStatus()
    }).catch(reason => {
      setError(errorText(reason instanceof RelayClientError ? reason.code : 'request-failed', t))
    }).finally(() => setClearing(false))
  }

  const canWrite = status?.writable === true && !loading
  const configured = status?.configured === true
  const showClear = status?.profileConfigured === true || status?.credentialConfigured === true

  const continueToModels = (): void => {
    reportBaiAcquisition('continued', 'model-picker')
    const target = document.querySelector<HTMLElement>('[data-dsh-provider-id="project-relay"]')
      ?? document.querySelector<HTMLElement>('[data-model-preferences-card="true"]')
    target?.scrollIntoView({ block: 'start' })
    target?.focus({ preventScroll: true })
  }

  return (
    <section className={css.card} data-relay-onboarding-card="true" data-dock-dirty={apiKey.trim() !== '' ? 'true' : undefined}>
      <header className={css.header}>
        <button type="button" className={css.collapse} aria-expanded={expanded} aria-controls="dsh-relay-content" aria-label={t(expanded ? 'collapseRelay' : 'expandRelay')} title={t(expanded ? 'collapseRelay' : 'expandRelay')} onClick={() => setExpanded(value => !value)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div>
          <h3 className={css.title}>{t('title')}</h3>
          <p className={css.description}>{t('description')}</p>
        </div>
        <span className={status?.configured ? css.badgeReady : css.badge}>{statusText(status, loading, t)}</span>
      </header>
      <div id="dsh-relay-content" className={css.body} hidden={!expanded}>
      {!configured && <div className={css.benefits} aria-label={t('benefitsLabel')}>
        <span>{t('benefitSync')}</span>
        <span>{t('benefitLocal')}</span>
        <span>{t('benefitRevoke')}</span>
      </div>}
      <p className={css.notice}>{t('notice')}</p>

      <div className={css.actions}>
        {configured
          ? <>
              <button type="button" className={css.primary} onClick={continueToModels}>{t('chooseModel')}</button>
              <button type="button" className={css.secondary} disabled={!canWrite || connecting || saving || clearing} onClick={() => { void connect() }}>{t('reconnect')}</button>
            </>
          : <button type="button" className={css.primaryWide} disabled={!canWrite || connecting || saving || clearing} onClick={() => { void connect() }}>{t('connect')}</button>}
        {connection.phase === 'pending' && <>
          <button type="button" className={css.secondary} onClick={() => { if (connection.url) openExternalUrl(connection.url) }}>{t('continueBrowser')}</button>
          <button type="button" className={css.secondary} onClick={() => { void cancel() }}>{t('cancelConnect')}</button>
        </>}
      </div>
      {connecting && <p role="status" className={css.muted}>{connection.phase === 'connecting' ? t('syncingModels') : t('waitingBrowser')}</p>}
      {connection.phase === 'expired' && <p role="status" className={css.muted}>{t('expiredConnect')}</p>}
      {connection.phase === 'failed' && <p role="alert" className={css.error}>{t('errorConnect')}</p>}

      {!configured && <section className={css.section}>
        <strong>{t('stepsTitle')}</strong>
        <ol className={css.steps}>
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
        </ol>
      </section>}

      <details className={css.accountTools}>
        <summary>{t('accountTools')}</summary>
        <div className={css.links}>
          <a
            href={RELAY_SIGN_UP_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault()
              openExternalUrl(RELAY_SIGN_UP_URL)
            }}
          >
            {t('openRegister')}
          </a>
          <a
            href={RELAY_WALLET_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault()
              openExternalUrl(RELAY_WALLET_URL)
            }}
          >
            {t('openWallet')}
          </a>
          <a
            href={RELAY_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault()
              openExternalUrl(RELAY_KEYS_URL)
            }}
          >
            {t('openKeys')}
          </a>
        </div>
      </details>

      <details className={css.manual}>
      <summary>{t('manualConnect')}</summary>
      <form className={css.form} onSubmit={configure}>
        <label className={css.label} htmlFor="dsh-relay-api-key">{t('keyLabel')}</label>
        <input
          id="dsh-relay-api-key"
          className={css.input}
          type="password"
          value={apiKey}
          maxLength={4096}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('keyPlaceholder')}
          disabled={!canWrite || saving || clearing || connecting}
          onChange={event => setApiKey(event.target.value)}
        />
        <div className={css.actions}>
          <button type="submit" data-dock-save="true" className={css.primary} disabled={!canWrite || saving || clearing || connecting}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </form>
      </details>
      {showClear && <div className={css.actions}><button type="button" className={css.secondary} disabled={!canWrite || saving || clearing || connecting} onClick={clear}>{clearing ? t('clearing') : t('clear')}</button></div>}

      {status !== null && status.modelCount > 0 && (
        <p className={css.models}>
          {countText(t('modelCount'), status.modelCount)} · {t('models')}: {status.models.slice(0, 8).map(model => model.name).join(', ')}{status.modelCount > 8 ? '…' : ''}
        </p>
      )}
      {status?.writable === false && <p className={css.muted}>{t('readonly')}</p>}
      {notice !== undefined && <p className={css.success} role="status">{notice}</p>}
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      </div>
    </section>
  )
}
