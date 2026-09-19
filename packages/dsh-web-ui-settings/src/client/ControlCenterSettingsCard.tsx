import { useEffect, useState } from 'react'
import css from './dock-settings.module.css'

type ControlState = 'disabled' | 'checking' | 'ready' | 'permission-required' | 'unavailable' | 'failed'
type FeatureState = Readonly<{ enabled: boolean; provider: string; state: ControlState; message?: string }>
type ControlCenterState = Readonly<{
  browser: FeatureState & { browsers?: readonly Readonly<{ id: string; label: string }>[] }
  computer: FeatureState & { platform?: string }
}>
type ControlBridge = Readonly<{
  getControlCenterState: () => Promise<ControlCenterState>
  setBrowserUseEnabled: (enabled: boolean, provider: string) => Promise<ControlCenterState>
  setComputerUseEnabled: (enabled: boolean, provider: string) => Promise<ControlCenterState>
  testControlProvider: (kind: 'browser' | 'computer') => Promise<{ state: ControlState; message?: string }>
  openControlPermissionSettings: (kind: 'browser' | 'computer') => Promise<boolean>
}>

const EMPTY: ControlCenterState = {
  browser: { enabled: false, provider: 'playwright', state: 'checking', browsers: [] },
  computer: { enabled: false, provider: 'cua-native', state: 'checking' },
}

function bridge(): ControlBridge | undefined {
  return (window as unknown as { dshDockSettings?: Partial<ControlBridge> }).dshDockSettings as ControlBridge | undefined
}

function safeError(reason: unknown): string {
  return reason instanceof Error && reason.message.trim()
    ? reason.message.trim().slice(0, 240)
    : '操作未完成，原配置已恢复。'
}

function stateText(state: ControlState): string {
  return {
    disabled: '已关闭', checking: '正在检查', ready: '已就绪',
    'permission-required': '需要系统权限', unavailable: '当前不可用', failed: '启动失败',
  }[state]
}

export function ControlCenterSettingsCard() {
  const api = bridge()
  const [status, setStatus] = useState<ControlCenterState>(EMPTY)
  const [busy, setBusy] = useState<'browser' | 'computer'>()
  const [message, setMessage] = useState<string>()

  const reload = async () => {
    if (!api?.getControlCenterState) return
    try { setStatus(await api.getControlCenterState()); setMessage(undefined) } catch (error) { setMessage(safeError(error)) }
  }
  useEffect(() => { void reload() }, [])

  const update = async (kind: 'browser' | 'computer', enabled: boolean, provider: string) => {
    if (!api || busy) return
    setBusy(kind); setMessage(undefined)
    try {
      const next = kind === 'browser'
        ? await api.setBrowserUseEnabled(enabled, provider)
        : await api.setComputerUseEnabled(enabled, provider)
      setStatus(next)
    } catch (error) {
      setMessage(safeError(error))
      await reload()
    } finally { setBusy(undefined) }
  }

  const test = async (kind: 'browser' | 'computer') => {
    if (!api || busy) return
    setBusy(kind); setMessage(undefined)
    try {
      const result = await api.testControlProvider(kind)
      setMessage(result.message ?? (result.state === 'ready' ? '安全探测通过，未执行点击、输入或页面操作。' : stateText(result.state)))
      await reload()
    } catch (error) { setMessage(safeError(error)) } finally { setBusy(undefined) }
  }

  return <div className={css.controlCenter} data-control-center>
    <section className={css.controlHero}>
      <div><span className={css.controlKicker}>DeepSeek Harness Desktop</span><h1>让 DeepSeek 操作浏览器和电脑</h1><p>两项实验能力默认关闭。启用后，读取状态可直接进行；点击、输入、上传、下载等外部操作仍由 Harness 审批确认。</p></div>
      <span className={css.controlSafety}>默认关闭</span>
    </section>
    <div className={css.controlGrid}>
      <section className={css.controlCard} data-control-kind="browser">
        <header><div><span>Browser Use</span><h2>浏览器操控</h2></div><strong data-state={status.browser.state}>{stateText(status.browser.state)}</strong></header>
        <p>默认使用 Playwright MCP，在可见的独立浏览器窗口中运行，每个会话互相隔离。</p>
        <label>Provider<select value={status.browser.provider} disabled={busy === 'browser' || status.browser.enabled} onChange={event => { void update('browser', false, event.target.value) }}>
          <option value="playwright">Playwright MCP（推荐）</option><option value="chrome-devtools">Chrome DevTools MCP（诊断）</option><option value="stagehand">Stagehand（需要独立凭据）</option>
        </select></label>
        <small>已发现：{status.browser.browsers?.map(item => item.label).join('、') || '未发现 Chrome、Edge 或 Chromium'}</small>
        <div className={css.controlActions}><button type="button" onClick={() => { void test('browser') }} disabled={Boolean(busy)}>安全测试</button><button type="button" className={css.switch} role="switch" aria-label="Browser Use" aria-checked={status.browser.enabled} disabled={Boolean(busy)} onClick={() => { void update('browser', !status.browser.enabled, status.browser.provider) }}><span /></button></div>
      </section>
      <section className={css.controlCard} data-control-kind="computer">
        <header><div><span>Computer Use</span><h2>电脑操控</h2></div><strong data-state={status.computer.state}>{stateText(status.computer.state)}</strong></header>
        <p>默认使用随包安装的 Cua Driver Native。截图和窗口检查不会输入内容；鼠标和键盘操作逐次确认。</p>
        <label>Provider<select value={status.computer.provider} disabled={busy === 'computer' || status.computer.enabled} onChange={event => { void update('computer', false, event.target.value) }}>
          <option value="cua-native">Cua Driver Native（推荐）</option><option value="cua-mcp">外置 Cua Driver MCP（隔离回退）</option>
        </select></label>
        <small>平台能力按当前系统和图形会话真实探测，不假定三端完全一致。</small>
        {status.computer.message && <small className={css.controlWarning}>{status.computer.message}</small>}
        <div className={css.controlActions}><button type="button" onClick={() => { void test('computer') }} disabled={Boolean(busy)}>安全测试</button>{status.computer.state === 'permission-required' && <button type="button" onClick={() => { void api?.openControlPermissionSettings('computer') }}>打开系统权限</button>}<button type="button" className={css.switch} role="switch" aria-label="Computer Use" aria-checked={status.computer.enabled} disabled={Boolean(busy)} onClick={() => { void update('computer', !status.computer.enabled, status.computer.provider) }}><span /></button></div>
      </section>
    </div>
    <aside className={css.controlBoundary}><strong>安全边界</strong><span>不会把浏览器打进安装包，也不会采集 URL、域名、窗口名称、截图、提示词、工具参数、路径或凭据。Attach 模式仅通过高级配置开放，并默认限制为本机调试端点。</span></aside>
    {message && <p className={css.controlMessage} role="status" aria-live="polite">{message}</p>}
  </div>
}
