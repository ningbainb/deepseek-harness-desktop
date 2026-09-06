import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModePreset } from './mode-controller.ts'
import css from './ModeSwitcher.module.css'

export interface ModeSwitcherProps {
  sessionId: string
  useSessions: <T>(selector: (state: { byId: Record<string, { agentPreset?: string }> }) => T) => T
  loadModes: () => Promise<ModePreset[]>
  switchMode: (sessionId: string, preset: string) => Promise<string>
}

export function ModeSwitcher({ sessionId, useSessions, loadModes, switchMode }: ModeSwitcherProps): JSX.Element | null {
  const current = useSessions((state) => state.byId[sessionId]?.agentPreset)
  const [modes, setModes] = useState<ModePreset[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const containerRef = useRef<HTMLDivElement>(null)
  const loadModesRef = useRef(loadModes)
  const switchModeRef = useRef(switchMode)

  useEffect(() => {
    loadModesRef.current = loadModes
    switchModeRef.current = switchMode
  }, [loadModes, switchMode])

  useEffect(() => {
    let active = true
    setError(undefined)
    void loadModesRef.current().then((items) => {
      if (active) setModes(items)
    }, (reason) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [sessionId])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleSelect = useCallback((presetId: string) => {
    if (presetId === current || busy) {
      setOpen(false)
      return
    }
    setBusy(true)
    setError(undefined)
    setOpen(false)
    void switchModeRef.current(sessionId, presetId).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => {
      setBusy(false)
    })
  }, [current, busy, sessionId])

  if (current === undefined || modes.length < 2) return null
  const currentMode = modes.find((mode) => mode.id === current)
  const currentLabel = currentMode?.label ?? current

  return (
    <div
      ref={containerRef}
      className={css.container}
      data-dsh-mode-switcher="true"
      title={error ?? `${currentLabel}；已有对话时会在同一工作区创建新会话`}
    >
      <button
        type="button"
        className={`${css.trigger} ${open ? css.triggerOpen : ''}`}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`当前模式：${currentLabel}，点击切换模式`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={css.modeIcon} aria-hidden="true">
          <ModeSparkleIcon />
        </span>
        <span className={css.label}>{currentLabel}</span>
        {busy ? (
          <span className={css.spinner} aria-hidden="true" />
        ) : (
          <span className={`${css.chevron} ${open ? css.chevronOpen : ''}`} aria-hidden="true">
            <ChevronDownIcon />
          </span>
        )}
      </button>

      {open && (
        <div className={css.menu} role="listbox" aria-label="选择会话模式">
          <div className={css.menuHeader}>会话模式</div>
          <div className={css.menuList}>
            {modes.map((mode) => {
              const isSelected = mode.id === current
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`${css.menuItem} ${isSelected ? css.menuItemSelected : ''}`}
                  onClick={() => handleSelect(mode.id)}
                >
                  <div className={css.menuItemContent}>
                    <div className={css.menuItemTitle}>{mode.label}</div>
                    {mode.description && (
                      <div className={css.menuItemDesc}>{mode.description}</div>
                    )}
                  </div>
                  {isSelected && (
                    <span className={css.checkIcon} aria-hidden="true">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ModeSparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M7.5 1.75a.75.75 0 0 1 1 0l.9 1.78a2.5 2.5 0 0 0 1.07 1.07l1.78.9a.75.75 0 0 1 0 1l-1.78.9a2.5 2.5 0 0 0-1.07 1.07l-.9 1.78a.75.75 0 0 1-1 0l-.9-1.78a2.5 2.5 0 0 0-1.07-1.07l-1.78-.9a.75.75 0 0 1 0-1l1.78-.9A2.5 2.5 0 0 0 6.6 3.53l.9-1.78ZM12.75 10.5a.5.5 0 0 1 .68 0l.4.8a1.25 1.25 0 0 0 .54.54l.8.4a.5.5 0 0 1 0 .68l-.8.4a1.25 1.25 0 0 0-.54.54l-.4.8a.5.5 0 0 1-.68 0l-.4-.8a1.25 1.25 0 0 0-.54-.54l-.8-.4a.5.5 0 0 1 0-.68l.8-.4a1.25 1.25 0 0 0 .54-.54l.4-.8Z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2.5 6.5 2.5 2.5 5-5" />
    </svg>
  )
}
