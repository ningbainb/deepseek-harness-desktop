import { useEffect, useRef, useState } from 'react'
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
  const [error, setError] = useState<string>()
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

  if (current === undefined || modes.length < 2) return null
  const currentMode = modes.find((mode) => mode.id === current)
  return <select
    className={css.select}
    value={currentMode === undefined ? '' : current}
    disabled={busy}
    aria-label="切换会话模式"
    data-dsh-mode-switcher="true"
    title={error ?? `${currentMode?.label ?? current}；已有对话时会在同一工作区创建新会话`}
    onChange={(event) => {
      const preset = event.currentTarget.value
      setBusy(true)
      setError(undefined)
      void switchModeRef.current(sessionId, preset).catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      }).finally(() => { setBusy(false) })
    }}
  >
    {modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
  </select>
}
