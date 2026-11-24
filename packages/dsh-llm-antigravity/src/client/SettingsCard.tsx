import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import css from './llm-antigravity.module.css'
import { defaults, efforts, namespace, statusPath, type Diagnostic, type Settings } from '../config.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'llm-antigravity': keyof typeof zh }
  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

const en = {
  description: 'Use your local Gemini subscription through the official Antigravity CLI.',
  installed: 'Ready', signedOut: 'Signed out', missing: 'Not installed', stopped: 'Disabled', checkFailed: 'Detection failed',
  copy: 'Copy command', copied: 'Command copied', copyFailed: 'Could not copy the command.',
  check: 'Check again', advanced: 'Advanced settings', recommended: 'stream-json (recommended)',
  expand: 'Show all models', collapse: 'Show fewer models', unsaved: 'Unsaved changes', saved: 'Settings saved.', saving: 'Saving settings',
  title: 'Antigravity CLI (Gemini)', enabled: 'Enable provider', cliPath: 'Absolute agy executable path',
  autoPath: 'Discover automatically', transport: 'Transport', effort: 'Default reasoning effort',
  auto: 'CLI default', timeoutSeconds: 'Timeout (seconds)', extraModels: 'Extra model IDs',
  extraHint: 'Separate model IDs with commas or spaces', save: 'Save settings', refresh: 'Refresh models',
  loading: 'Checking Antigravity CLI', failed: 'Settings could not be saved.',
  'not-installed': 'Install Antigravity CLI or set its executable path.',
  'not-authenticated': 'Run agy or agy acp --login in a terminal, then refresh models.',
  error: 'Could not load models. Check agy models in a terminal.', modelCount: 'Available models',
}
const zh: typeof en = {
  description: '通过官方 Antigravity CLI 使用本机已登录的 Gemini 订阅。',
  installed: '已就绪', signedOut: '未登录', missing: '未安装', stopped: '已停用', checkFailed: '检测失败',
  copy: '复制命令', copied: '命令已复制', copyFailed: '无法复制命令。',
  check: '重新检测', advanced: '高级配置', recommended: 'stream-json（推荐）',
  expand: '显示全部模型', collapse: '收起模型', unsaved: '有未保存的修改', saved: '设置已保存。', saving: '正在保存设置',
  title: 'Antigravity CLI (Gemini)', enabled: '启用模型提供商', cliPath: 'agy 可执行文件绝对路径',
  autoPath: '自动探测', transport: '传输方式', effort: '默认推理档位', auto: 'CLI 默认值',
  timeoutSeconds: '超时（秒）', extraModels: '额外模型 ID', extraHint: '用逗号或空格分隔模型 ID',
  save: '保存设置', refresh: '刷新模型', loading: '正在检测 Antigravity CLI', failed: '无法保存设置。',
  'not-installed': '请安装 Antigravity CLI 或配置其可执行文件路径。',
  'not-authenticated': '请在终端运行 agy 或 agy acp --login，登录后刷新模型。',
  error: '无法加载模型。请在终端检查 agy models。', modelCount: '可用模型',
}

const loginCommand = 'agy acp --login'
const visibleModelCount = 8
const statusLabel = {
  ready: 'installed', 'not-authenticated': 'signedOut', 'not-installed': 'missing', disabled: 'stopped', error: 'checkFailed',
} as const

export function SettingsCard({ form, t }: { form: ConfigForm<Settings> } & PropsLocale<typeof namespace>) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
  const [draft, setDraft] = useState<Settings>(() => ({ ...defaults, ...snapshot.value }))
  const [diagnostic, setDiagnostic] = useState<Diagnostic>()
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>()
  const [copyState, setCopyState] = useState<'copied' | 'copyFailed'>()
  const [expanded, setExpanded] = useState(false)
  const detection = useRef<AbortController | null>(null)
  useEffect(() => { setDraft({ ...defaults, ...snapshot.value }) }, [snapshot.value])
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
      if (!controller.signal.aborted) setDiagnostic(value)
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
  const setup = state === 'not-installed' || state === 'not-authenticated'
  const models = diagnostic?.models ?? []
  async function save() {
    if (!dirty || !writable) return
    setSaveState('saving')
    const ops = changed.map(key => ({ op: 'set' as const, path: [key], value: draft[key] }))
    try { setSaveState(await form.mutate(ops, snapshot.revision) ? 'saved' : 'failed') }
    catch { setSaveState('failed') }
  }
  return <section className={css.card} data-antigravity-settings data-dock-dirty={dirty ? 'true' : undefined}>
    <header className={css.header}>
      <div><h3>{t('title')}</h3><p>{t('description')}</p></div>
      <button className={css.toggle} type="button" role="switch" aria-checked={draft.enabled} disabled={!writable}
        onClick={() => update('enabled', !draft.enabled)}>
        <span className={css.track} aria-hidden="true" />{t('enabled')}
      </button>
    </header>
    <div className={css.connection}>
      <span className={css.badge} data-state={state} role="status">{busy || !state ? t('loading') : t(statusLabel[state])}</span>
      {diagnostic?.path && <code className={css.cliPath} title={diagnostic.path}>{diagnostic.path}</code>}
      <button type="button" disabled={busy} onClick={() => void check(true)}>{t(state === 'ready' ? 'refresh' : 'check')}</button>
    </div>
    {setup && <div className={css.notice}>
      <p>{t(state)}</p>
      <div className={css.actions}>
        <code>{loginCommand}</code>
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(loginCommand)
            setCopyState('copied')
          } catch { setCopyState('copyFailed') }
        }}>{t('copy')}</button>
      </div>
      {copyState && <p role="status">{t(copyState)}</p>}
    </div>}
    {state === 'error' && <p className={css.notice} data-tone="error" role="alert">{t('error')}</p>}
    {state === 'ready' && <div className={css.models}>
      <h4>{t('modelCount')} <span className={css.badge}>{models.length}</span></h4>
      <ul>{(expanded ? models : models.slice(0, visibleModelCount)).map(model =>
        <li key={model.id} className={css.badge} title={model.id}>{model.name}</li>)}</ul>
      {models.length > visibleModelCount && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {t(expanded ? 'collapse' : 'expand')}
      </button>}
    </div>}
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <fieldset disabled={!writable} className={css.form}>
        <div className={css.fields}>
          <label>{t('transport')}<select value={draft.transport} onChange={e => update('transport', e.target.value === 'acp' ? 'acp' : 'stream-json')}>
            <option value="stream-json">{t('recommended')}</option><option value="acp">ACP</option>
          </select></label>
          <label>{t('effort')}<select value={draft.effort} onChange={e => update('effort', efforts.find(value => value === e.target.value) ?? 'auto')}>
            <option value="auto">{t('auto')}</option>{efforts.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label>{t('timeoutSeconds')}<input type="number" required min={1} max={1800} value={draft.timeoutSeconds}
            onChange={e => update('timeoutSeconds', Number(e.target.value))} /></label>
        </div>
        <details className={css.advanced}>
          <summary>{t('advanced')}</summary>
          <div className={css.fields}>
            <label>{t('cliPath')}<input className={css.mono} value={draft.cliPath} placeholder={t('autoPath')} onChange={e => update('cliPath', e.target.value)} /></label>
            <label>{t('extraModels')}<input className={css.mono} value={draft.extraModels} placeholder={t('extraHint')} onChange={e => update('extraModels', e.target.value)} /></label>
          </div>
        </details>
        <div className={css.footer}>
          <button className={css.primary} type="submit" disabled={!dirty}>{t('save')}</button>
          {saveState ? <span role={saveState === 'failed' ? 'alert' : 'status'} data-tone={saveState === 'failed' ? 'error' : undefined}>{t(saveState)}</span>
            : dirty && <span role="status">{t('unsaved')}</span>}
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
}
