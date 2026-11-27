import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import css from './llm-antigravity.module.css'
import { authModes, defaults, efforts, namespace, statusPath, type AuthMode, type Diagnostic, type Settings } from '../config.ts'
import { acpStore, STATUS_UPDATED_EVENT } from './acpStore.ts'
import { AcpChatFrameHoc } from './AcpChatView.tsx'
import { GeminiComposerTrigger } from './GeminiComposerTrigger.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'llm-antigravity': keyof typeof zh }
  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
    'conversation.input.right': { kind: 'list'; scope: 'session' }
    'conversation.hero.frame': { kind: 'hoc'; scope: 'root'; owner: { hero: boolean } }
  }
}

const en = {
  description: 'Use your local Gemini subscription through the official Antigravity CLI.',
  installed: 'Ready', signedOut: 'Signed out', missing: 'Not installed', stopped: 'Disabled', checkFailed: 'Detection failed',
  copy: 'Copy command', copied: 'Copied', copyFailed: 'Could not copy command.',
  check: 'Check again', advanced: 'Advanced settings', recommended: 'stream-json (legacy headless)',
  acpOption: 'ACP (recommended, interactive stdio)',
  transportHint: 'ACP uses the official Agent Client Protocol over standard input and output.',
  authMode: 'Authentication mode',
  authPersonal: 'Google account (oauth-personal, interactive ACP only)',
  authBusiness: 'Gemini Enterprise (oauth-business, interactive ACP only)',
  authApiKey: 'Gemini API key (gemini-api-key)',
  authPlatform: 'Google Cloud / Vertex AI (agent-platform)',
  oauthComplianceNotice: 'Personal and business OAuth are restricted to direct interactive ACP sessions and will not appear in the ordinary API model picker. Once Ready, use the "Gemini" trigger in the chat composer or click "Open Gemini Chat" above to talk interactively via official ACP.',
  missingApiCredentialNotice: 'API-billed credentials were not detected yet. Set GEMINI_API_KEY / GOOGLE_API_KEY (or GCP Application Default Credentials), then click Refresh models so Antigravity models appear in the chat picker.',
  openInteractive: 'Open Gemini Chat',
  expand: 'Show all models', collapse: 'Show fewer models', unsaved: 'Unsaved changes', saved: 'Settings saved.', saving: 'Saving settings',
  reset: 'Discard changes',
  title: 'Antigravity CLI (Gemini)', enabled: 'Enable provider', cliPath: 'Absolute agy executable path',
  autoPath: 'Discover automatically', transport: 'Transport', effort: 'Default reasoning effort',
  auto: 'CLI default', effortLow: 'Low (low)', effortMedium: 'Medium (medium)', effortHigh: 'High (high)',
  effortXhigh: 'Extra high (xhigh)', effortMax: 'Max (max)',
  timeoutSeconds: 'Timeout (seconds)', extraModels: 'Extra model IDs',
  extraHint: 'Separate model IDs with commas or spaces', save: 'Save settings', refresh: 'Refresh models',
  loading: 'Checking Antigravity CLI', failed: 'Settings could not be saved.',
  disabledHint: 'Enable Antigravity CLI and save to check the local installation.',
  installStep1: 'Install the official Antigravity CLI, or specify the executable path in Advanced settings.',
  installStep2: 'Sign in with agy acp --login in your terminal, then click Check again.',
  fillCliPath: 'Set executable path',
  loginGuide: 'Run this command in your terminal to sign in with your Google account, then refresh models:',
  readyGuide: 'Synced to the model selector — you can pick these Gemini models directly in chat.',
  readyOauthWithheldGuide: 'Antigravity CLI is ready. Use the "Gemini" selector at the bottom-right of the chat input bar to start an interactive ACP session (OAuth stays isolated from automated API routing).',
  acpCapabilitiesSummary: 'Official ACP v1 negotiated',
  acpLoadSupported: 'session resume supported',
  acpLoadUnsupported: 'fresh session per launch',
  'not-installed': 'Install Antigravity CLI or set its executable path.',
  'not-authenticated': 'Run agy or agy acp --login in a terminal, then refresh models.',
  error: 'Could not load models. Check agy models in a terminal.', modelCount: 'Available models',
}
const zh: typeof en = {
  description: '通过官方 Antigravity CLI 使用本机已登录的 Gemini 订阅。',
  installed: '已就绪', signedOut: '未登录', missing: '未安装', stopped: '已停用', checkFailed: '检测失败',
  copy: '复制命令', copied: '已复制', copyFailed: '无法复制命令。',
  check: '重新检测', advanced: '高级配置', recommended: 'stream-json（兼容无头流）',
  acpOption: 'ACP（推荐，官方交互协议）',
  transportHint: 'ACP 通过标准输入输出使用官方 Agent Client Protocol。',
  authMode: '认证方式',
  authPersonal: '个人 Google 账号（仅交互 ACP）',
  authBusiness: 'Gemini Enterprise（仅交互 ACP）',
  authApiKey: 'Gemini API Key（按量计费）',
  authPlatform: 'Google Cloud / Vertex AI（ADC 按量计费）',
  oauthComplianceNotice: '说明：个人或企业 Google OAuth 仅限人工实时交互使用，不进入后台自动化/IM 或普通 API 路由。启用就绪后，直接在聊天输入框右下角点击「✦ Gemini」选择模型，即可通过官方 ACP 协议发起合规的交互对话（或切换为 API Key 计费接入通用路由）。',
  missingApiCredentialNotice: '当前环境尚未检测到按量计费凭据（GEMINI_API_KEY / GOOGLE_API_KEY 或 gcloud ADC 凭据文件）。配置对应环境变量并重启桌面端后，模型将自动出现在通用模型下拉列表中；若继续使用本机登录的 OAuth，可直接点击输入框右下角「✦ Gemini」交互使用。',
  openInteractive: '打开 Gemini 交互会话',
  expand: '显示全部模型', collapse: '收起模型', unsaved: '有未保存的修改', saved: '设置已保存。', saving: '正在保存设置',
  reset: '还原修改',
  title: 'Antigravity CLI (Gemini)', enabled: '启用模型提供商', cliPath: 'agy 可执行文件绝对路径',
  autoPath: '自动探测', transport: '传输方式', effort: '默认推理档位',
  auto: 'CLI 默认值', effortLow: '低 (low)', effortMedium: '中 (medium)', effortHigh: '高 (high)',
  effortXhigh: '极高 (xhigh)', effortMax: '最大 (max)',
  timeoutSeconds: '超时（秒）', extraModels: '额外模型 ID', extraHint: '用逗号或空格分隔模型 ID',
  save: '保存设置', refresh: '刷新模型', loading: '正在检测 Antigravity CLI', failed: '无法保存设置。',
  disabledHint: '开启 Antigravity CLI 并保存后，可检测本机安装。',
  installStep1: '安装官方 Antigravity CLI，或在下方「高级配置」中指定 agy.exe 的绝对路径。',
  installStep2: '在终端运行 agy acp --login 完成登录，然后点击「重新检测」。',
  fillCliPath: '填写可执行文件路径',
  loginGuide: '请在终端运行以下命令完成 Google 账号登录，登录后点击「重新检测」：',
  readyGuide: '已同步到模型选择器，可直接在会话中切换使用以下 Gemini 模型。',
  readyOauthWithheldGuide: '已检测到本机 Antigravity CLI 与模型列表：可直接点击下方「打开 Gemini 交互会话」或在对话输入框右下角选择「Gemini」进行人工 ACP 交互。',
  acpCapabilitiesSummary: '已协商官方 ACP v1 协议',
  acpLoadSupported: '支持会话恢复',
  acpLoadUnsupported: '每次独立会话',
  'not-installed': '请安装 Antigravity CLI 或配置其可执行文件路径。',
  'not-authenticated': '请在终端运行 agy 或 agy acp --login，登录后刷新模型。',
  error: '无法加载模型。请在终端检查 agy models。', modelCount: '可用模型',
}

const loginCommand = 'agy acp --login'
const visibleModelCount = 8
const statusLabel = {
  ready: 'installed', 'not-authenticated': 'signedOut', 'not-installed': 'missing', disabled: 'stopped', error: 'checkFailed',
} as const
const effortLabelKey = {
  low: 'effortLow', medium: 'effortMedium', high: 'effortHigh', xhigh: 'effortXhigh', max: 'effortMax',
} as const
const authModeLabelKey: Record<AuthMode, keyof typeof en> = {
  'oauth-personal': 'authPersonal',
  'oauth-business': 'authBusiness',
  'gemini-api-key': 'authApiKey',
  'agent-platform': 'authPlatform',
}

function ProviderMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M7 15l3-3-3-3M12 15h5" />
  </svg>
}

export function SettingsCard({ form, t }: { form: ConfigForm<Settings> } & PropsLocale<typeof namespace>) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
  const [draft, setDraft] = useState<Settings>(() => ({ ...defaults, ...snapshot.value }))
  const [diagnostic, setDiagnostic] = useState<Diagnostic>()
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>()
  const [copyState, setCopyState] = useState<'copied' | 'copyFailed'>()
  const [acpCaps, setAcpCaps] = useState<{ loadSession: boolean }>()
  const [expanded, setExpanded] = useState(false)
  const detection = useRef<AbortController | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const advancedRef = useRef<HTMLDetailsElement>(null)
  const cliPathInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft({ ...defaults, ...snapshot.value }) }, [snapshot.value])
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  async function check(refresh: boolean) {
    detection.current?.abort()
    const controller = new AbortController()
    detection.current = controller
    setBusy(true)
    try {
      const result = await fetch(statusPath, {
        method: refresh ? 'POST' : 'GET', headers: { 'x-dsh-antigravity': '1' }, signal: controller.signal,
      })
      if (!result.ok) throw new Error()
      const value: Diagnostic = await result.json()
      if (!controller.signal.aborted) {
        setDiagnostic(value)
        window.dispatchEvent(new CustomEvent(STATUS_UPDATED_EVENT))
      }
      if (!controller.signal.aborted && value.state === 'ready') {
        void fetch('/api/dsh-acp/probe', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-dsh-acp': '1' },
          body: JSON.stringify({ agentId: 'antigravity', commandOverride: value.path }),
          signal: controller.signal,
        }).then(r => (r.ok ? r.json() : null)).then((probe) => {
          if (!controller.signal.aborted && probe?.state === 'ready' && probe?.capabilities) {
            setAcpCaps({ loadSession: Boolean(probe.capabilities.loadSession) })
          }
        }).catch(() => {})
      }
    } catch {
      if (!controller.signal.aborted) setDiagnostic({ state: 'error', models: [] })
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  useEffect(() => {
    void check(false)
    return () => detection.current?.abort()
  }, [snapshot.revision])

  const update = <K extends keyof Settings>(field: K, value: Settings[K]) => {
    setSaveState(undefined)
    setDraft(current => ({ ...current, [field]: value }))
  }
  const value = { ...defaults, ...snapshot.value }
  const changed = (Object.keys(draft) as Array<keyof Settings>).filter(key => draft[key] !== value[key])
  const dirty = changed.length > 0
  const writable = snapshot.status === 'ready' && snapshot.writable && saveState !== 'saving'
  const state = diagnostic?.state
  const models = diagnostic?.models ?? []

  async function save() {
    if (!dirty || !writable) return
    setSaveState('saving')
    const ops = changed.map(key => ({ op: 'set' as const, path: [key], value: draft[key] }))
    try {
      const ok = await form.mutate(ops, snapshot.revision)
      setSaveState(ok ? 'saved' : 'failed')
      if (ok) window.dispatchEvent(new CustomEvent(STATUS_UPDATED_EVENT))
    } catch { setSaveState('failed') }
  }

  async function copyLoginCommand() {
    clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(loginCommand)
      setCopyState('copied')
    } catch {
      setCopyState('copyFailed')
    }
    copyTimer.current = setTimeout(() => setCopyState(undefined), 2500)
  }

  function focusCliPath() {
    if (advancedRef.current) advancedRef.current.open = true
    queueMicrotask(() => cliPathInputRef.current?.focus())
  }

  return <section className={css.card} data-antigravity-settings data-dock-dirty={dirty ? 'true' : undefined}>
    <header className={css.header}>
      <div className={css.titleGroup}>
        <div className={css.mark} aria-hidden="true"><ProviderMark /></div>
        <div>
          <h3>{t('title')}</h3>
          <p>{t('description')}</p>
        </div>
      </div>
      <div className={css.headerControls}>
        {dirty && <span className={css.dirtyBadge}>{t('unsaved')}</span>}
        <button className={css.toggle} type="button" role="switch" aria-checked={draft.enabled} disabled={!writable}
          onClick={() => update('enabled', !draft.enabled)}>
          <span className={css.track} aria-hidden="true" />{t('enabled')}
        </button>
      </div>
    </header>

    <div className={css.statusPanel}>
      <div className={css.connection}>
        <div className={css.statusIdentity} role="status">
          <span className={css.statusDot} data-state={busy || !state ? 'checking' : state} aria-hidden="true" />
          <span className={css.statusText}>{busy || !state ? t('loading') : t(statusLabel[state])}</span>
          {diagnostic?.path && <code className={css.cliPath} title={diagnostic.path}>{diagnostic.path}</code>}
        </div>
        <button type="button" className={css.secondary} disabled={busy} onClick={() => void check(true)}>
          {busy && <span className={css.spinner} aria-hidden="true" />}
          {t(state === 'ready' ? 'refresh' : 'check')}
        </button>
      </div>

      {state === 'disabled' && <p className={css.mutedNotice}>{t('disabledHint')}</p>}

      {state === 'not-installed' && <div className={css.guideBox}>
        <ol className={css.steps}>
          <li>
            <span>{t('installStep1')}</span>
            <button type="button" className={css.inlineLink} onClick={focusCliPath}>{t('fillCliPath')}</button>
          </li>
          <li><span>{t('installStep2')}</span></li>
        </ol>
        <div className={css.commandBar}>
          <code><span className={css.prompt} aria-hidden="true">$</span>{loginCommand}</code>
          <button type="button" className={css.quietBtn} onClick={() => void copyLoginCommand()}>
            {copyState === 'copied' ? t('copied') : t('copy')}
          </button>
        </div>
        {copyState && <p className={css.copyStatus} role="status">{t(copyState)}</p>}
      </div>}

      {state === 'not-authenticated' && <div className={css.guideBox} data-tone="warn">
        <p className={css.guideText}>{t('loginGuide')}</p>
        <div className={css.commandBar}>
          <code><span className={css.prompt} aria-hidden="true">$</span>{loginCommand}</code>
          <button type="button" className={css.quietBtn} onClick={() => void copyLoginCommand()}>
            {copyState === 'copied' ? t('copied') : t('copy')}
          </button>
        </div>
        {copyState && <p className={css.copyStatus} role="status">{t(copyState)}</p>}
      </div>}

      {state === 'error' && <p className={css.notice} data-tone="error" role="alert">{t('error')}</p>}

      {state === 'ready' && <div className={css.models}>
        <p className={css.readyBanner}>
          {t(diagnostic?.harnessLlmAllowed ? 'readyGuide' : 'readyOauthWithheldGuide')}
          {acpCaps && ` (${t('acpCapabilitiesSummary')}: ${t(acpCaps.loadSession ? 'acpLoadSupported' : 'acpLoadUnsupported')})`}
        </p>
        <div className={css.modelsHead}>
          <h4>{t('modelCount')} <span className={css.countPill}>{models.length}</span></h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {models.length > 0 && (
              <button
                type="button"
                className={css.quietBtn}
                onClick={() => {
                  void acpStore.openWithModel(models[0]?.id)
                }}
              >
                {t('openInteractive')}
              </button>
            )}
            {models.length > visibleModelCount && <button type="button" className={css.quietBtn} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {t(expanded ? 'collapse' : 'expand')}
            </button>}
          </div>
        </div>
        <ul>{(expanded ? models : models.slice(0, visibleModelCount)).map(model =>
          <li key={model.id} className={css.modelChip} title={model.id}>{model.name}</li>)}</ul>
      </div>}
    </div>

    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <fieldset disabled={!writable} className={css.form}>
        <div className={css.formPanel}>
          <div className={css.fields}>
            <label>
              <span>{t('authMode')}</span>
              <select value={draft.authMode} onChange={e => update('authMode', authModes.find(value => value === e.target.value) ?? 'oauth-personal')}>
                {authModes.map(mode => <option key={mode} value={mode}>{t(authModeLabelKey[mode])}</option>)}
              </select>
            </label>
            <label>
              <span>{t('transport')}</span>
              <select value={draft.transport} onChange={e => update('transport', e.target.value === 'acp' ? 'acp' : 'stream-json')}>
                <option value="acp">{t('acpOption')}</option>
                <option value="stream-json">{t('recommended')}</option>
              </select>
            </label>
            <label>
              <span>{t('effort')}</span>
              <select value={draft.effort} onChange={e => update('effort', efforts.find(value => value === e.target.value) ?? 'auto')}>
                <option value="auto">{t('auto')}</option>
                {efforts.map(value => <option key={value} value={value}>{t(effortLabelKey[value])}</option>)}
              </select>
            </label>
            <label>
              <span>{t('timeoutSeconds')}</span>
              <input type="number" required min={1} max={1800} value={draft.timeoutSeconds}
                onChange={e => update('timeoutSeconds', Number(e.target.value))} />
            </label>
          </div>
          <p className={css.fieldHint}>{t('transportHint')}</p>
          {!diagnostic?.harnessLlmAllowed && <div className={css.guideBox} data-tone="warn">
            <p className={css.guideText}>
              {t(draft.authMode === 'gemini-api-key' || draft.authMode === 'agent-platform'
                ? 'missingApiCredentialNotice'
                : 'oauthComplianceNotice')}
            </p>
          </div>}

          <details ref={advancedRef} className={css.advanced}>
            <summary>{t('advanced')}</summary>
            <div className={css.fields}>
              <label>
                <span>{t('cliPath')}</span>
                <input ref={cliPathInputRef} className={css.mono} value={draft.cliPath} placeholder={t('autoPath')}
                  onChange={e => update('cliPath', e.target.value)} />
              </label>
              <label>
                <span>{t('extraModels')}</span>
                <input className={css.mono} value={draft.extraModels} placeholder={t('extraHint')}
                  onChange={e => update('extraModels', e.target.value)} />
              </label>
            </div>
          </details>
        </div>

        <div className={css.footer}>
          <div className={css.saveStatus}>
            {saveState ? <span role={saveState === 'failed' ? 'alert' : 'status'} data-tone={saveState === 'failed' ? 'error' : 'success'}>{t(saveState)}</span>
              : dirty && <span role="status" data-tone="warn">{t('unsaved')}</span>}
          </div>
          <div className={css.footerActions}>
            {dirty && <button type="button" className={css.secondary} onClick={() => { setDraft(value); setSaveState(undefined) }}>{t('reset')}</button>}
            <button className={css.primary} type="submit" data-dock-save disabled={!dirty}>{t('save')}</button>
          </div>
        </div>
      </fieldset>
    </form>
  </section>
}

export const inject = ['slots', 'configForms', 'locale']

export function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }))
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item', id: namespace, order: 120, locale: namespace,
    inject: () => ({ form: ctx.configForms.get<Settings>(namespace) }),
  }, SettingsCard))
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: `${namespace}-gemini`, order: 20,
  }, GeminiComposerTrigger))
  ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({
    name: 'conversation.hero.frame', id: `${namespace}-acp-frame`, order: 80,
  }, AcpChatFrameHoc))
}
