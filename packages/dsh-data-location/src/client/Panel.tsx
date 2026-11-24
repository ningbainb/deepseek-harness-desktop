import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { createDesktopClient, type DataMigrationPlan, type DataMigrationStatus } from '@linxin666/dsh-desktop-client'
import { useEffect, useState } from 'react'
import css from './data-location.module.css'

const zh = {
  description: '查看本机数据存储位置，或迁移到另一块磁盘。', defaultPath: '默认路径', custom: '已自定义', environment: '环境变量接管',
  copy: '复制路径', copied: '路径已复制', copyFailed: '无法复制路径。', loading: '正在读取数据目录', unknown: '暂不可用',
  destination: '迁移目标', required: '所需空间', free: '目标盘可用空间', checking: '正在检查目标目录和磁盘空间。',
  preflightFailed: '预检失败', starting: '等待确认并准备迁移。', booting: '正在验证新目录。',
  title: '数据目录迁移', unavailable: '数据目录由桌面应用管理。', home: '数据目录', cache: '缓存目录', size: '估算体积',
  choose: '选择目标目录', preflight: '迁移预检', execute: '开始迁移并重启', ready: '预检通过。',
  cleanup: '部分迁移残留无法自动清理，请检查目标目录。',
  copying: '正在复制和校验数据。', restarting: '正在重启桌面应用。',
  rolledBack: '桌面应用已恢复到原数据目录，原有数据已保留。', complete: '迁移完成。旧目录已保留。',
}
const en: typeof zh = {
  description: 'Review local storage or move your data to another drive.', defaultPath: 'Default location', custom: 'Custom location', environment: 'Environment override',
  copy: 'Copy path', copied: 'Path copied', copyFailed: 'Could not copy the path.', loading: 'Reading data location', unknown: 'Unavailable',
  destination: 'Migration destination', required: 'Space required', free: 'Free space on destination drive', checking: 'Checking the directory and disk space.',
  preflightFailed: 'Preflight failed', starting: 'Waiting for confirmation and preparing the migration.', booting: 'Verifying the new data directory.',
  title: 'Data directory migration', unavailable: 'The Desktop app manages the data directory.', home: 'Data directory', cache: 'Cache directory', size: 'Estimated size',
  choose: 'Choose destination', preflight: 'Run preflight', execute: 'Migrate and restart', ready: 'Preflight passed.',
  cleanup: 'Some migration files could not be removed. Check the destination directory.',
  copying: 'Copying and verifying data.', restarting: 'Restarting Desktop.',
  rolledBack: 'Desktop restored the previous data directory.', complete: 'Migration complete. The previous directory was retained.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'data-location': keyof typeof zh }
  interface SlotMap { 'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } } }
}

const desktop = createDesktopClient()

function formatBytes(bytes: number) {
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GiB' : (bytes / 1024 ** 2).toFixed(1) + ' MiB'
}

export function DataLocationCard({ t }: PropsLocale<'data-location'>) {
  const [status, setStatus] = useState<DataMigrationStatus>()
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<string | null>(null)
  const [plan, setPlan] = useState<DataMigrationPlan>()
  const [busy, setBusy] = useState<'choose' | 'check' | 'execute'>()
  const [error, setError] = useState('')
  const [preflightError, setPreflightError] = useState('')
  const [copyFeedback, setCopyFeedback] = useState<'copied' | 'copyFailed'>()
  const refresh = async () => {
    const result = await desktop.statusDataMigration()
    if (!('available' in result)) setStatus(result)
  }
  useEffect(() => {
    void refresh().catch(error => setError(String(error))).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (busy !== 'execute' && !['copying', 'ready-to-boot', 'booting'].includes(status?.phase ?? '')) return
    const timer = setInterval(() => void refresh().catch(() => {}), 800)
    return () => clearInterval(timer)
  }, [busy, status?.phase])

  async function run(action: NonNullable<typeof busy>, operation: () => Promise<void>) {
    setBusy(action)
    setError('')
    try { await operation() }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(undefined) }
  }

  async function preflight() {
    setPlan(undefined)
    setPreflightError('')
    try {
      const result = await desktop.preflightDataMigration()
      if ('available' in result) throw Error(t('unavailable'))
      setPlan(result)
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : String(error))
    }
  }

  const path = (value: string) => <div className={css.path}>
    <code title={value}>{value}</code>
    <button type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(value)
        setCopyFeedback('copied')
      } catch { setCopyFeedback('copyFailed') }
    }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>{t('copy')}</button>
  </div>
  const phase = status?.phase
  const progress = phase === 'copying' ? 'copying' : phase === 'ready-to-boot' ? 'restarting'
    : phase === 'booting' ? 'booting' : busy === 'execute' ? 'starting' : undefined

  return <section className={css.card} data-data-location-card>
    <header className={css.header}>
      <div><h3>{t('title')}</h3><p>{t('description')}</p></div>
      {status && <span className={css.badge}>{t(status.source === 'environment' ? 'environment'
        : ['persisted', 'selected'].includes(status.source) ? 'custom' : 'defaultPath')}</span>}
    </header>
    {status ? <>
      <dl className={css.grid}>
        <dt>{t('home')}</dt><dd>{path(status.home)}</dd>
        <dt>{t('cache')}</dt><dd>{path(status.cachePath)}</dd>
        <dt>{t('size')}</dt><dd>{status.bytes === undefined ? t('unknown') : formatBytes(status.bytes)}</dd>
      </dl>
      {copyFeedback && <p role="status">{t(copyFeedback)}</p>}
      {status.reason && <p className={css.notice}>{status.reason}</p>}
      {status.cleanupIncomplete && <p className={css.notice} data-tone="error" role="alert">{t('cleanup')}</p>}
      {phase === 'rolled-back' && <p className={css.notice} data-tone="error" role="status">{t('rolledBack')}</p>}
      {phase === 'complete' && <p className={css.notice} data-tone="success" role="status">{t('complete')}</p>}
      {(status.canMigrate || busy || target) && <div className={css.workflow}>
        <h4>{t('destination')}</h4>
        {target && <code className={css.target} title={target}>{target}</code>}
        <div className={css.actions}>
          <button type="button" disabled={!!busy || !status.canMigrate} onClick={() => void run('choose', async () => {
            setPlan(undefined)
            setPreflightError('')
            setTarget(await desktop.chooseDataMigration())
          })}>{t('choose')}</button>
          <button type="button" disabled={!!busy || !target || !status.canMigrate} onClick={() => void run('check', preflight)}>{t('preflight')}</button>
        </div>
        {busy === 'check' && <p role="status">{t('checking')}</p>}
        {preflightError && <div className={css.notice} data-tone="error" role="alert"><strong>{t('preflightFailed')}</strong><p>{preflightError}</p></div>}
        {plan && <div className={css.notice} data-tone={plan.freeBytes >= plan.bytes ? 'success' : 'error'} role="status">
          <strong>{t(plan.freeBytes >= plan.bytes ? 'ready' : 'preflightFailed')}</strong>
          <dl className={css.grid}>
            <dt>{t('required')}</dt><dd>{formatBytes(plan.bytes)}</dd>
            <dt>{t('free')}</dt><dd>{formatBytes(plan.freeBytes)}</dd>
          </dl>
        </div>}
        <button className={css.primary} type="button" disabled={!!busy || !status.canMigrate || !plan || plan.freeBytes < plan.bytes} onClick={() => void run('execute', async () => {
          const result = await desktop.executeDataMigration()
          if ('accepted' in result && result.accepted) {
            setPlan(undefined)
            setTarget(null)
          }
          await refresh()
        })}>{t('execute')}</button>
      </div>}
    </> : <p role="status">{t(loading ? 'loading' : 'unavailable')}</p>}
    {progress && <p className={css.notice} role="status">{t(progress)}</p>}
    {error && <p className={css.notice} data-tone="error" role="alert">{error}</p>}
  </section>
}

export const inject = ['slots', 'locale']
export function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register('data-location', { zh, en }))
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item', id: 'data-location', order: 118, locale: 'data-location',
  }, DataLocationCard))
}
