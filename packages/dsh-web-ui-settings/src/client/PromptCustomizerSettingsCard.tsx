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
    } catch (reason) { setError(reason instanceof Error ? reason.message.slice(0, 240) : '高级提示词状态读取失败') }
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
      setError(reason instanceof Error ? reason.message.slice(0, 240) : '高级提示词配置未能保存，请检查当前状态后重试。')
      await reload(false)
    }
  }
  const stateText = phase === 'idle' ? status.available ? status.enabled ? '配置已开启' : '配置已关闭' : '当前配置不可用'
    : phase === 'loading' ? '正在读取状态' : phase === 'rolling-back' || phase === 'restored' ? '正在恢复原配置' : '正在保存并重启内核'
  return <section className={css.collaborationCard} data-prompt-customizer-card>
    <header className={css.collaborationCardHeader}>
      <div><h2>Agent 高级提示词</h2><p>默认关闭。显式开启后可定制 Agent 的提示词、技能与 MCP 配置；切换会重启内核。</p></div>
      <div className={css.collaborationControl}>
        <div role="status" aria-live="polite">{stateText}</div>
        <button type="button" className={css.switch} role="switch" aria-label="Agent 高级提示词" aria-checked={status.enabled}
          disabled={phase !== 'idle' || !status.available} onClick={() => { void toggle() }}><span /></button>
      </div>
    </header>
    <p>开启后，可在主界面的「能力 → 提示词」中使用原生编辑、预览、保存与恢复；与普通回复偏好、长期记忆相互独立，互不影响。</p>
    <details className={css.disclosure}>
      <summary>存储与备份说明</summary>
      <p>高级配置保存在数据目录的 prompt-customizer/prompt-customizer.db（SQLite）。关闭后会保留历史数据，每次切换启停前自动保存版本备份。</p>
    </details>
    {status.reason && <p role="note">{status.reason}</p>}
    {error && <div role="alert" className={css.collaborationError}>{error}<button type="button" onClick={() => { void reload() }}>重试</button></div>}
  </section>
}
