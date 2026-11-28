import { useEffect, useState } from 'react'
import { fetchWinControlState, setSessionWinControlGrant, type WinControlStateResponse } from './api.ts'
import type { WinControlLocaleKey } from './locales.ts'
import css from './WinControl.module.css'

export interface WinControlPillProps {
  sessionId?: string
  t: (key: WinControlLocaleKey) => string
}

export interface WinControlMenuOptionProps {
  sessionId?: string
  locked?: boolean
  t: (key: WinControlLocaleKey) => string
}

const GRANT_CHANGED_EVENT = 'dsh:win-control-grant-changed'

export function shouldShowWinControlPill(state: Pick<WinControlStateResponse, 'bridgedToolCount' | 'sessionGranted'> | null): boolean {
  return Boolean(state && state.bridgedToolCount > 0 && state.sessionGranted === true)
}

export function shouldShowWinControlMenuOption(state: Pick<WinControlStateResponse, 'bridgedToolCount'> | null): boolean {
  return Boolean(state && state.bridgedToolCount > 0)
}

function useWinControlGrant(sessionId?: string) {
  const [state, setState] = useState<WinControlStateResponse | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const load = () => {
      void fetchWinControlState(sessionId)
        .then((res) => { if (active) setState(res) })
        .catch(() => {})
    }
    load()
    const onChanged = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as { sessionId?: string; sessionGranted?: boolean } | undefined
      if (!sessionId || detail?.sessionId !== sessionId || typeof detail.sessionGranted !== 'boolean') return
      const granted = detail.sessionGranted
      setState(prev => (prev ? { ...prev, sessionGranted: granted } : prev))
    }
    window.addEventListener(GRANT_CHANGED_EVENT, onChanged)
    return () => {
      active = false
      window.removeEventListener(GRANT_CHANGED_EVENT, onChanged)
    }
  }, [sessionId])

  const granted = Boolean(state?.sessionGranted)
  const disabled = busy || !sessionId

  async function toggle() {
    if (disabled || !sessionId || !state) return
    const next = !granted
    setBusy(true)
    try {
      await setSessionWinControlGrant(sessionId, next)
      setState(prev => (prev ? { ...prev, sessionGranted: next } : prev))
      window.dispatchEvent(new CustomEvent(GRANT_CHANGED_EVENT, { detail: { sessionId, sessionGranted: next } }))
    } catch {
      // Non-fatal: pill preserves previous state.
    } finally {
      setBusy(false)
    }
  }

  return { state, granted, disabled, toggle }
}

export function WinControlPill({ sessionId, t }: WinControlPillProps) {
  const { state, granted, disabled, toggle } = useWinControlGrant(sessionId)

  // Keep the composer bar uncluttered when desktop control is not armed for this session.
  if (!state || !shouldShowWinControlPill(state)) {
    return null
  }

  const stateLabel = t('pillOn')

  return (
    <button
      type="button"
      className={css.pill}
      data-active="true"
      aria-pressed="true"
      aria-label={stateLabel}
      disabled={disabled}
      title={`${stateLabel} — ${t('pillTooltip')}`}
      onClick={() => void toggle()}
    >
      <span className={css.dot} aria-hidden="true" />
      <span>{t('pillLabel')}</span>
      <span className={css.countBadge}>{state.bridgedToolCount}</span>
    </button>
  )
}

export function WinControlMenuOption({ sessionId, locked, t }: WinControlMenuOptionProps) {
  const { state, granted, disabled, toggle } = useWinControlGrant(sessionId)

  if (!state || !shouldShowWinControlMenuOption(state)) {
    return null
  }

  return (
    <button
      type="button"
      role="switch"
      className={css.menuSwitch}
      aria-checked={granted}
      disabled={disabled || Boolean(locked)}
      data-dsh-win-control-option="true"
      onClick={() => void toggle()}
    >
      <span className={css.menuSwitchLabel}>
        <span>{t('menuToggle')}</span>
        <span className={css.menuSwitchCount}>{state.bridgedToolCount} {t('menuToggleHint')}</span>
      </span>
      <span className={css.menuSwitchTrack} data-checked={granted ? 'true' : 'false'} aria-hidden="true" />
    </button>
  )
}
