import { useEffect, useState } from 'react'
import css from './dock-settings.module.css'

type AgentTeamStatus = Readonly<{ available: boolean; enabled: boolean; version?: string }>
type AgentTeamProgress = Readonly<{ phase?: 'saving' | 'restarting' | 'rolling-back' | 'restored' }>
type AgentTeamBridge = Readonly<{
  getAgentTeamStatus: () => Promise<AgentTeamStatus>
  setAgentTeamEnabled: (enabled: boolean) => Promise<AgentTeamStatus>
  onAgentTeamProgress: (listener: (progress: AgentTeamProgress) => void) => () => void
}>

declare global { interface Window { dshDockSettings?: AgentTeamBridge } }

function safeError(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message.trim().slice(0, 240)
  return '配置未能保存，原状态已恢复。请稍后重试。'
}

export function AgentTeamSettingsCard({ detailsLabel, cautionLabel }: { detailsLabel: string; cautionLabel: string }) {
  const bridge = window.dshDockSettings
  const [status, setStatus] = useState<AgentTeamStatus>({ available: false, enabled: false })
  const [phase, setPhase] = useState<'loading' | 'idle' | 'saving' | 'restarting' | 'rolling-back'>('loading')
  const [error, setError] = useState<string>()

  const reload = async (clearError = true) => {
    if (!bridge) { setPhase('idle'); return }
    try {
      setStatus(await bridge.getAgentTeamStatus())
      if (clearError) setError(undefined)
    } catch (reason) {
      setError(safeError(reason))
    } finally {
      setPhase('idle')
    }
  }

  useEffect(() => {
    void reload()
    return bridge?.onAgentTeamProgress(progress => {
      if (progress.phase === 'saving' || progress.phase === 'restarting' || progress.phase === 'rolling-back') setPhase(progress.phase)
    })
  }, [bridge])

  const toggle = async () => {
    if (!bridge || phase !== 'idle' || !status.available) return
    const target = !status.enabled
    setPhase('saving')
    setError(undefined)
    try {
      setStatus(await bridge.setAgentTeamEnabled(target))
      setPhase('idle')
    } catch (reason) {
      setError(safeError(reason))
      await reload(false)
    }
  }

  const busy = phase !== 'idle'
  const stateText = phase === 'loading' ? '正在读取状态'
    : phase === 'saving' ? '正在保存配置'
      : phase === 'restarting' ? '正在重启 DeepSeek Harness'
        : phase === 'rolling-back' ? '正在恢复原配置'
          : status.available ? (status.enabled ? '已开启' : '已关闭') : '当前版本不可用'

  return <section className={css.collaborationCard} data-agent-team-card>
    <header className={css.collaborationCardHeader}>
      <div>
        <div className={css.collaborationTitleRow}><h2>Agent Team</h2><span>实验功能</span>{status.version && <span>{status.version}</span>}</div>
        <p>{cautionLabel}</p>
      </div>
      <div className={css.collaborationControl}>
        <div className={css.collaborationStatus} role="status" aria-live="polite">{stateText}</div>
        <button type="button" className={css.switch} role="switch" aria-checked={status.enabled} aria-label="Agent Team" disabled={busy || !status.available} onClick={() => { void toggle() }}><span /></button>
      </div>
    </header>
    <details className={css.disclosure} data-dock-agent-team-details>
      <summary>{detailsLabel}</summary>
      <p>共享任务板并按职责协作；并行修改同一文件可能冲突。切换会短暂重启，会话、草稿和项目文件不会被删除。</p>
    </details>
    {error && <div className={css.collaborationError} role="alert">{error}<button type="button" onClick={() => { void reload() }}>重试</button></div>}
  </section>
}
