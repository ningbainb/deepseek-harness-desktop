import { useEffect, useState } from 'react'
import { fetchWinControlState, setSessionWinControlGrant, type WinControlStateResponse } from './api.ts'
import type { WinControlLocaleKey } from './locales.ts'
import css from './WinControl.module.css'

export interface WinControlPillProps {
  sessionId?: string
  t: (key: WinControlLocaleKey) => string
}

export function WinControlPill({ sessionId, t }: WinControlPillProps) {
  const [state, setState] = useState<WinControlStateResponse | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void fetchWinControlState(sessionId)
      .then((res) => { if (active) setState(res) })
      .catch(() => {})
    return () => { active = false }
  }, [sessionId])

  if (!state || state.bridgedToolCount === 0) {
    return null
  }

  const granted = state.sessionGranted
  const disabled = busy || !sessionId
  const stateLabel = granted ? t('pillOn') : t('pillOff')

  async function toggle() {
    if (disabled || !sessionId) return
    setBusy(true)
    try {
      await setSessionWinControlGrant(sessionId, !granted)
      setState(prev => (prev ? { ...prev, sessionGranted: !granted } : prev))
    } catch {
      // Non-fatal: pill preserves previous state.
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={css.pill}
      data-active={granted ? 'true' : 'false'}
      aria-pressed={granted}
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
