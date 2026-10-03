import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  RELAY_CONNECT_PATH, RELAY_CONNECT_STATUS_PATH, RELAY_CONNECT_CANCEL_PATH,
  RELAY_STATUS_PATH, RELAY_REFRESH_PATH, RELAY_WALLET_URL,
  type RelayConnectResponse, type RelayConnection, type RelayStatusResponse,
} from '../relay-protocol.ts'
import type { RelayLocaleKey } from './locales.ts'
import { announceRelayModels, postRelay } from './relay-client.ts'
import { RELAY_SIGN_IN_REQUIRED_EVENT } from './relay-send-guard.ts'
import { openExternalUrl } from './open-external.ts'
import css from './relay-onboarding.module.css'

type Translate = (key: RelayLocaleKey) => string

export function RelayAccessDialog({ t: translate, onClose, autoConnect, forceAuth = false }: { t: Translate; onClose(): void; autoConnect: boolean; forceAuth?: boolean }) {
  const [status, setStatus] = useState<RelayStatusResponse | null>(null)
  const [connection, setConnection] = useState<RelayConnection>({ phase: 'idle' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [authRejected, setAuthRejected] = useState(forceAuth)
  const active = useRef(true)
  const started = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  const opening = useRef(false)
  const openedUrl = useRef('')

  const openBrowser = (href: string) => {
    if (!openExternalUrl(href, () => { if (active.current) setError(translate('errorOpenBrowser')) })) setError(translate('errorOpenBrowser'))
  }
  const connect = async () => {
    if (opening.current) return
    opening.current = true
    setBusy(true)
    setError('')
    try {
      const result = await postRelay<RelayConnectResponse>(RELAY_CONNECT_PATH)
      if (!active.current) return
      setConnection(result.connection)
      if (result.connection.url && openedUrl.current !== result.connection.url) {
        openedUrl.current = result.connection.url
        openBrowser(result.connection.url)
      }
    } catch { if (active.current) setError(translate('errorConnect')) }
    finally { opening.current = false; if (active.current) setBusy(false) }
  }

  useEffect(() => {
    active.current = true
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose() }
      if (event.key !== 'Tab') return
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    void postRelay<RelayStatusResponse>(RELAY_STATUS_PATH).then(next => {
      if (!active.current) return
      setStatus(next)
      if (autoConnect && next.writable && (forceAuth || !next.configured || next.sync?.error === 'relay-auth') && !started.current) {
        started.current = true
        void connect()
      }
    }).catch(() => { if (active.current) setError(translate('errorLoad')) })
    return () => { active.current = false; document.removeEventListener('keydown', onKey, true); if (previous?.isConnected) previous.focus() }
  }, [])

  useEffect(() => {
    if (!['starting', 'pending', 'connecting'].includes(connection.phase)) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await postRelay<RelayConnectResponse>(RELAY_CONNECT_STATUS_PATH)
        if (cancelled || !active.current) return
        setConnection(result.connection)
        if (result.connection.phase === 'connected') {
          setAuthRejected(false)
          announceRelayModels()
          const next = await postRelay<RelayStatusResponse>(RELAY_STATUS_PATH)
          if (!cancelled && active.current) setStatus(next)
          return
        }
        if (!['starting', 'pending', 'connecting'].includes(result.connection.phase)) return
      } catch { if (!cancelled && active.current) setError(translate('errorLoad')) }
      if (!cancelled) timer = setTimeout(() => { void poll() }, 1500)
    }
    timer = setTimeout(() => { void poll() }, 1000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [connection.phase])

  const refresh = async () => {
    setBusy(true)
    setError('')
    try {
      await postRelay(RELAY_REFRESH_PATH)
      announceRelayModels()
      const next = await postRelay<RelayStatusResponse>(RELAY_STATUS_PATH)
      if (active.current) setStatus(next)
    } catch { if (active.current) setError(translate('errorRelayUnavailable')) }
    finally { if (active.current) setBusy(false) }
  }
  const pending = ['starting', 'pending', 'connecting'].includes(connection.phase)
  const authenticated = !authRejected && status?.configured && status.sync?.error !== 'relay-auth'
  return <div className={css.accessBackdrop}>
    <div ref={dialog} className={`${css.card} ${css.accessDialog}`} role="dialog" aria-modal="true" aria-label={translate('accessTitle')}>
      <header className={css.header}><h3 className={css.title}>{translate('accessTitle')}</h3><button type="button" className={css.secondary} onClick={onClose}>{translate('closeAccess')}</button></header>
      <p role="status">{status === null ? translate('statusLoading') : connection.phase === 'connected' ? translate('connected') : pending ? translate('waitingBrowser') : authenticated ? translate('statusReady') : translate('notSignedIn')}</p>
      {pending && !authenticated && <p>{translate('notSignedIn')}</p>}
      <p className={css.notice}>{translate('notice')}</p>
      {status?.writable === false && <p role="status">{translate('readonly')}</p>}
      <p>{translate('autoRefreshNotice')}</p>
      <div className={css.actions}>
        <button type="button" className={css.primary} disabled={busy || pending || status?.writable !== true} onClick={() => { void connect() }}>{authenticated ? translate('reconnect') : translate('connect')}</button>
        <button type="button" className={css.secondary} onClick={() => openBrowser(RELAY_WALLET_URL)}>{translate('openWallet')}</button>
        {authenticated && <button type="button" className={css.secondary} disabled={busy || pending} onClick={() => { void refresh() }}>{translate('refreshModels')}</button>}
        {connection.url && <button type="button" className={css.secondary} onClick={() => openBrowser(connection.url!)}>{translate('continueBrowser')}</button>}
        {pending && <button type="button" className={css.secondary} onClick={() => { void postRelay<RelayConnectResponse>(RELAY_CONNECT_CANCEL_PATH).then(result => { if (active.current) setConnection(result.connection) }).catch(() => { if (active.current) setError(translate('errorConnect')) }) }}>{translate('cancelConnect')}</button>}
      </div>
      {connection.phase === 'expired' && <p role="status">{translate('expiredConnect')}</p>}
      {connection.phase === 'failed' && <p role="alert">{translate('errorConnect')}</p>}
      {error && <p role="alert" className={css.error}>{error}</p>}
    </div>
  </div>
}

export function installRelayModelEntrances(doc: Document, translate: Translate): () => void {
  if (!doc.body) return () => {}
  const container = doc.createElement('div')
  container.dataset.dshRelayAccessRoot = 'true'
  doc.body.append(container)
  doc.dispatchEvent(new Event('dsh-relay-access-changed'))
  const root = createRoot(container)
  let disposed = false
  let showing = false
  let checking = false
  const close = () => { showing = false; root.render(null) }
  const show = (autoConnect: boolean, forceAuth = false) => {
    if (disposed || showing) return
    showing = true
    root.render(<RelayAccessDialog t={translate} onClose={close} autoConnect={autoConnect} forceAuth={forceAuth} />)
  }
  const onClick = (event: MouseEvent) => {
    if (disposed || event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return
    const explicit = event.target.closest<HTMLButtonElement>('[data-dsh-relay-connect]')
    if (explicit && !explicit.disabled) {
      event.preventDefault()
      event.stopImmediatePropagation()
      show(true)
      return
    }
    const entry = event.target.closest<HTMLElement>('[data-dsh-relay-model-entry]')
    if (!entry || entry.getAttribute('aria-haspopup') === 'menu' || entry.dataset.dshRelayProvider !== 'project-relay' || checking || showing || entry.getAttribute('aria-disabled') === 'true' || entry.hasAttribute('disabled')) return
    checking = true
    void postRelay<RelayStatusResponse>(RELAY_STATUS_PATH).then(status => {
      if (!disposed && (!status.configured || status.sync?.error === 'relay-auth')
        && entry.dataset.dshRelayProvider === 'project-relay') show(true)
    }).catch(() => {}).finally(() => { checking = false })
  }
  const onSignInRequired = (event: Event) => show(true, event instanceof CustomEvent && event.detail?.reason === 'relay-auth')
  doc.addEventListener('click', onClick, true)
  doc.addEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, onSignInRequired)
  return () => { disposed = true; doc.removeEventListener('click', onClick, true); doc.removeEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, onSignInRequired); root.unmount(); container.remove(); doc.dispatchEvent(new Event('dsh-relay-access-changed')) }
}
