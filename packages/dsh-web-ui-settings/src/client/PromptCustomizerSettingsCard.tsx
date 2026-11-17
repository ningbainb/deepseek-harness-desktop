import { useEffect, useState } from 'react'
import css from './dock-settings.module.css'

type Status = { available: boolean; enabled: boolean; version?: string; reason?: string }
type Bridge = {
  getPromptCustomizerStatus(): Promise<Status>
  setPromptCustomizerEnabled(enabled: boolean): Promise<Status>
  onPromptCustomizerProgress(listener: (progress: { phase?: string }) => void): () => void
}

export function PromptCustomizerSettingsCard() {
  const bridge = (window as unknown as { dshDockSettings?: Bridge }).dshDockSettings
  const [status, setStatus] = useState<Status>({ available: false, enabled: false })
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState<string>()
  const reload = async (clearError = true) => {
    try {
      if (bridge) setStatus(await bridge.getPromptCustomizerStatus())
      if (clearError) setError(undefined)
    } catch (reason) { setError(reason instanceof Error ? reason.message.slice(0, 240) : 'P2 状态读取失败') }
    finally { setPhase('idle') }
  }
  useEffect(() => {
    void reload()
    return bridge?.onPromptCustomizerProgress(progress => setPhase(progress.phase ?? 'saving'))
  }, [bridge])
  const toggle = async () => {
    if (!bridge || phase !== 'idle' || !status.available) return
    setPhase('saving'); setError(undefined)
    try { setStatus(await bridge.setPromptCustomizerEnabled(!status.enabled)); setPhase('idle') }
    catch (reason) {
      setError(reason instanceof Error ? reason.message.slice(0, 240) : 'P2 配置未能保存，请检查当前状态后重试。')
      await reload(false)
    }
  }
  const stateText = phase === 'idle' ? status.available ? status.enabled ? '配置已开启' : '配置已关闭' : '当前配置不可用'
    : phase === 'loading' ? '正在读取状态' : phase === 'rolling-back' || phase === 'restored' ? '正在恢复原配置' : '正在保存并重启内核'
  return <section className={css.collaborationCard} data-prompt-customizer-card>
    <header className={css.collaborationCardHeader}>
      <div><h2>Agent 高级提示词 (P2)</h2><p>默认关闭。显式开启后可定制 Agent 的提示词、技能与 MCP 配置；切换会重启内核。</p></div>
      <div className={css.collaborationControl}>
        <div role="status" aria-live="polite">{stateText}</div>
        <button type="button" className={css.switch} role="switch" aria-label="Agent 高级提示词 (P2)" aria-checked={status.enabled}
          disabled={phase !== 'idle' || !status.available} onClick={() => { void toggle() }}><span /></button>
      </div>
    </header>
    <p>高级配置保存在数据目录的 prompt-customizer/prompt-customizer.db (SQLite)。关闭后保留数据库；启停前保存版本化配置备份。</p>
    <p>不替代普通回复偏好 (P1)，不会修改 P1 内容。项目经验记忆 (M2) 的隔离验收阻断仍独立保留。</p>
    <p>开启后回到主界面的「能力 → 提示词」使用原生编辑、预览、保存与恢复；这里仅管理启停，不创建第二份编辑器。</p>
    {status.reason && <p role="note">{status.reason}</p>}
    {error && <div role="alert" className={css.collaborationError}>{error}<button type="button" onClick={() => { void reload() }}>重试</button></div>}
  </section>
}
