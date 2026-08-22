import { useCallback, useEffect, useState } from 'react'
import {
  dismissDockNudge,
  getDockEntryState,
  openDesktopSurface,
  type DockDismissReason,
} from '@linxin666/dsh-desktop-client'
import type { WebUIPluginsKey } from './locales.ts'
import css from './web-ui-settings.module.css'

export type DesktopExtensionDockEntryProps = {
  wide: boolean
  t: (key: WebUIPluginsKey, params?: Record<string, unknown>) => string
}

/** Desktop-only one-click Extension Dock entry beside the Settings control. */
export function DesktopExtensionDockEntry({ wide, t }: DesktopExtensionDockEntryProps) {
  const [available, setAvailable] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void getDockEntryState().then((state) => {
      if (!active || state.available !== true) return
      setAvailable(true)
      setShowNudge(state.showNudge)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const dismiss = useCallback((reason: DockDismissReason) => {
    setShowNudge(false)
    void dismissDockNudge(reason).catch(() => {})
  }, [])

  useEffect(() => {
    if (!showNudge) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss('escape')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismiss, showNudge])

  const openDock = useCallback(async () => {
    if (opening) return
    setShowNudge(false)
    setFailed(false)
    setOpening(true)
    void dismissDockNudge('clicked').catch(() => {})
    try {
      setFailed(!await openDesktopSurface('extensions'))
    } catch {
      setFailed(true)
    } finally {
      setOpening(false)
    }
  }, [opening])

  if (!available) return null
  const label = t('dockLabel' satisfies WebUIPluginsKey)

  return (
    <div className={css.dockEntry} data-wide={wide ? 'wide' : 'rail'}>
      <button
        type="button"
        className={css.dockTrigger}
        aria-label={label}
        title={label}
        aria-describedby={showNudge ? 'dsh-extension-dock-nudge' : undefined}
        disabled={opening}
        onClick={() => { void openDock() }}
      >
        <DockIcon />
      </button>
      {showNudge && (
        <div id="dsh-extension-dock-nudge" className={css.dockNudge} role="status">
          <span>{t('dockNudge' satisfies WebUIPluginsKey)}</span>
          <button
            type="button"
            className={css.dockNudgeClose}
            aria-label={t('dockDismiss' satisfies WebUIPluginsKey)}
            onClick={() => dismiss('close')}
          >
            ×
          </button>
        </div>
      )}
      {failed && (
        <span className={css.dockError} role="alert">
          {t('dockOpenFailed' satisfies WebUIPluginsKey)}
        </span>
      )}
    </div>
  )
}

function DockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <path d="M17 13.5v7M13.5 17h7" />
    </svg>
  )
}
