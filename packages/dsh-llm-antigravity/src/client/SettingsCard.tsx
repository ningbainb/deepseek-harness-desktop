import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { defaults, efforts, namespace, statusPath, type Diagnostic, type Settings } from '../config.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'llm-antigravity': keyof typeof zh }
  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

const en = {
  title: 'Antigravity CLI (Gemini)', enabled: 'Enable provider', cliPath: 'Absolute agy executable path',
  autoPath: 'Discover automatically', transport: 'Transport', effort: 'Default reasoning effort',
  auto: 'CLI default', timeoutSeconds: 'Timeout (seconds)', extraModels: 'Extra model IDs',
  extraHint: 'Separate model IDs with commas or spaces', save: 'Save settings', refresh: 'Refresh models',
  loading: 'Checking Antigravity CLI', failed: 'Settings could not be saved.',
  'not-installed': 'Install Antigravity CLI or set its executable path.',
  'not-authenticated': 'Run agy or agy acp --login in a terminal, then refresh models.',
  ready: 'Installed and signed in', error: 'Could not load models. Check agy models in a terminal.',
  disabled: 'Provider disabled', modelCount: 'Available models',
}
const zh: typeof en = {
  title: 'Antigravity CLI (Gemini)', enabled: '启用模型提供商', cliPath: 'agy 可执行文件绝对路径',
  autoPath: '自动探测', transport: '传输方式', effort: '默认推理档位', auto: 'CLI 默认值',
  timeoutSeconds: '超时（秒）', extraModels: '额外模型 ID', extraHint: '用逗号或空格分隔模型 ID',
  save: '保存设置', refresh: '刷新模型', loading: '正在检测 Antigravity CLI', failed: '无法保存设置。',
  'not-installed': '请安装 Antigravity CLI 或配置其可执行文件路径。',
  'not-authenticated': '请在终端运行 agy 或 agy acp --login，登录后刷新模型。',
  ready: '已安装并登录', error: '无法加载模型。请在终端检查 agy models。',
  disabled: '提供商已停用', modelCount: '可用模型',
}

function SettingsCard({ form, t }: { form: ConfigForm<Settings> } & PropsLocale<typeof namespace>) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
  const [draft, setDraft] = useState<Settings>(defaults)
  const [diagnostic, setDiagnostic] = useState<Diagnostic>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setDraft({ ...defaults, ...snapshot.value }) }, [snapshot.value])
  async function check(refresh: boolean, signal?: AbortSignal) {
    setBusy(true)
    try {
      const result = await fetch(statusPath, {
        method: refresh ? 'POST' : 'GET', headers: { 'x-dsh-antigravity': '1' }, signal,
      })
      if (!result.ok) throw new Error()
      setDiagnostic(await result.json())
    } catch {
      if (!signal?.aborted) setDiagnostic({ state: 'error', models: [] })
    } finally {
      if (!signal?.aborted) setBusy(false)
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    void check(false, controller.signal)
    return () => controller.abort()
  }, [snapshot.revision])
  const update = <K extends keyof Settings>(field: K, value: Settings[K]) =>
    setDraft(current => ({ ...current, [field]: value }))
  return <section>
    <h3>{t('title')}</h3>
    <p role="status">{diagnostic ? t(diagnostic.state) : t('loading')}
      {diagnostic?.path && <> <code>{diagnostic.path}</code></>}
      {diagnostic?.state === 'ready' && <> · {t('modelCount')} {diagnostic.models.length}</>}
    </p>
    <button type="button" disabled={busy} onClick={() => void check(true)}>{t('refresh')}</button>
    <form onSubmit={event => {
      event.preventDefault()
      const value = { ...defaults, ...snapshot.value }
      const ops = (Object.keys(draft) as Array<keyof Settings>)
        .filter(key => draft[key] !== value[key])
        .map(key => ({ op: 'set' as const, path: [key], value: draft[key] }))
      if (ops.length) void form.mutate(ops, snapshot.revision).then(ok => setFailed(!ok), () => setFailed(true))
    }}>
      <fieldset disabled={snapshot.status !== 'ready' || !snapshot.writable}>
        <p><label><input type="checkbox" checked={draft.enabled} onChange={e => update('enabled', e.target.checked)} /> {t('enabled')}</label></p>
        <p><label>{t('cliPath')} <input value={draft.cliPath} placeholder={t('autoPath')} onChange={e => update('cliPath', e.target.value)} /></label></p>
        <p><label>{t('transport')} <select value={draft.transport} onChange={e => update('transport', e.target.value === 'acp' ? 'acp' : 'stream-json')}>
          <option value="stream-json">stream-json</option><option value="acp">ACP</option>
        </select></label></p>
        <p><label>{t('effort')} <select value={draft.effort} onChange={e => update('effort', efforts.find(value => value === e.target.value) ?? 'auto')}>
          <option value="auto">{t('auto')}</option>{efforts.map(value => <option key={value}>{value}</option>)}
        </select></label></p>
        <p><label>{t('timeoutSeconds')} <input type="number" required min={1} max={1800} value={draft.timeoutSeconds}
          onChange={e => update('timeoutSeconds', Number(e.target.value))} /></label></p>
        <p><label>{t('extraModels')} <input value={draft.extraModels} placeholder={t('extraHint')} onChange={e => update('extraModels', e.target.value)} /></label></p>
        <button type="submit">{t('save')}</button>
        {failed && <p role="alert">{t('failed')}</p>}
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
