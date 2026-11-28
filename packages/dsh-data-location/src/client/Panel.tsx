import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { createDesktopClient, type DataMigrationPlan, type DataMigrationStatus } from '@linxin666/dsh-desktop-client'
import { useEffect, useRef, useState } from 'react'
import css from './data-location.module.css'

const zh = {
  description: '查看本机数据存储位置，或安全迁移到其他磁盘。', defaultPath: '默认路径', custom: '已自定义', environment: '环境变量接管',
  copy: '复制', copied: '已复制', copyFailed: '无法复制路径。', loading: '正在读取数据目录', unknown: '暂不可用',
  destination: '迁移向导', required: '所需空间', free: '目标盘可用空间', checking: '正在检查目标目录和磁盘空间…',
  preflightFailed: '预检未通过', starting: '等待确认并准备迁移…', booting: '正在验证新目录…',
  title: '数据目录迁移', unavailable: '数据目录由桌面应用管理。', home: '数据目录', cache: '缓存目录', size: '估算体积',
  choose: '选择目标目录', preflight: '运行预检', recheck: '重新预检', execute: '开始迁移并重启', ready: '预检通过，可开始迁移。',
  cleanup: '部分迁移残留无法自动清理，请检查目标目录。',
  copying: '正在复制并校验数据…', restarting: '正在重启桌面应用…',
  rolledBack: '桌面应用已恢复到原数据目录，原有数据已保留。', complete: '迁移完成，旧目录已保留。',
  stepChoose: '1. 选择目标目录', stepPreflight: '2. 目录与空间预检', stepExecute: '3. 复制并重启',
  targetPlaceholder: '尚未选择目标目录，请先选择一个空目录作为新存储位置。',
  safetyNote: '迁移期间旧目录将完整保留；若新目录启动异常，桌面端会自动回滚到原目录。',
  envReasonHint: '当前由 DSH_HOME 环境变量接管，移除该环境变量并重启桌面端后即可在此迁移。',
}
const en: typeof zh = {
  description: 'Review local storage paths or safely migrate your data to another drive.', defaultPath: 'Default location', custom: 'Custom location', environment: 'Environment override',
  copy: 'Copy', copied: 'Copied', copyFailed: 'Could not copy the path.', loading: 'Reading data location', unknown: 'Unavailable',
  destination: 'Migration wizard', required: 'Space required', free: 'Free on target drive', checking: 'Checking directory and disk space…',
  preflightFailed: 'Preflight failed', starting: 'Waiting for confirmation and preparing migration…', booting: 'Verifying the new data directory…',
  title: 'Data directory migration', unavailable: 'The Desktop app manages the data directory.', home: 'Data directory', cache: 'Cache directory', size: 'Estimated size',
  choose: 'Choose destination', preflight: 'Run preflight', recheck: 'Re-run preflight', execute: 'Migrate and restart', ready: 'Preflight passed.',
  cleanup: 'Some migration files could not be removed. Check the destination directory.',
  copying: 'Copying and verifying data…', restarting: 'Restarting Desktop…',
  rolledBack: 'Desktop restored the previous data directory.', complete: 'Migration complete. The previous directory was retained.',
  stepChoose: '1. Choose destination', stepPreflight: '2. Run preflight', stepExecute: '3. Copy & restart',
  targetPlaceholder: 'No destination chosen yet. Pick an empty folder on the target drive.',
  safetyNote: 'Your original folder stays intact during migration and is automatically restored if startup fails.',
  envReasonHint: 'DSH_HOME currently overrides this directory. Remove the environment variable and restart Desktop to migrate here.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'data-location': keyof typeof zh }
  interface SlotMap { 'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } } }
}

const desktop = createDesktopClient()

function formatBytes(bytes: number) {
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GiB' : (bytes / 1024 ** 2).toFixed(1) + ' MiB'
}

function StorageMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="6" rx="2" />
    <rect x="3" y="14" width="18" height="6" rx="2" />
    <path d="M7 7h.01M7 17h.01" />
  </svg>
}

export function DataLocationCard({ t }: PropsLocale<'data-location'>) {
  const [status, setStatus] = useState<DataMigrationStatus>()
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<string | null>(null)
  const [plan, setPlan] = useState<DataMigrationPlan>()
  const [busy, setBusy] = useState<'choose' | 'check' | 'execute'>()
  const [error, setError] = useState('')
  const [preflightError, setPreflightError] = useState('')
  const [copiedField, setCopiedField] = useState<'home' | 'cache' | 'error'>()
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const refresh = async () => {
    const result = await desktop.statusDataMigration()
    if (!('available' in result)) setStatus(result)
  }
  useEffect(() => {
    void refresh().catch(error => setError(String(error))).finally(() => setLoading(false))
    return () => clearTimeout(copyTimer.current)
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

  async function copyPath(field: 'home' | 'cache', value: string) {
    clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
    } catch {
      setCopiedField('error')
    }
    copyTimer.current = setTimeout(() => setCopiedField(undefined), 2500)
  }

  const renderPath = (field: 'home' | 'cache', value: string) => <div className={css.path}>
    <code title={value}>{value}</code>
    <button type="button" className={css.copyBtn} onClick={() => void copyPath(field, value)}>
      {copiedField === field ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
      )}
      <span>{copiedField === field ? t('copied') : t('copy')}</span>
    </button>
  </div>

  const phase = status?.phase
  const progress = phase === 'copying' ? 'copying' : phase === 'ready-to-boot' ? 'restarting'
    : phase === 'booting' ? 'booting' : busy === 'execute' ? 'starting' : undefined
  const planOk = Boolean(plan && plan.freeBytes >= plan.bytes)
  const step1State = target ? 'done' : 'active'
  const step2State = preflightError || (plan && !planOk) ? 'error' : planOk ? 'done' : target ? 'active' : 'pending'
  const step3State = progress ? 'active' : phase === 'complete' ? 'done' : planOk ? 'active' : 'pending'
  const ratio = plan && plan.freeBytes > 0 ? Math.min(100, Math.max(4, Math.round((plan.bytes / plan.freeBytes) * 100))) : 100

  return <section className={css.card} data-data-location-card>
    <header className={css.header}>
      <div className={css.titleGroup}>
        <div className={css.mark} aria-hidden="true"><StorageMark /></div>
        <div>
          <h3>{t('title')}</h3>
          <p>{t('description')}</p>
        </div>
      </div>
      {status && <span className={css.badge} data-source={status.source}>
        <span className={css.badgeDot} aria-hidden="true" />
        {t(status.source === 'environment' ? 'environment'
          : ['persisted', 'selected'].includes(status.source) ? 'custom' : 'defaultPath')}
      </span>}
    </header>

    {status ? <>
      <div className={css.infoPanel}>
        <dl className={css.grid}>
          <dt>{t('home')}</dt><dd>{renderPath('home', status.home)}</dd>
          <dt>{t('cache')}</dt><dd>{renderPath('cache', status.cachePath)}</dd>
          <dt>{t('size')}</dt><dd><span className={css.sizeValue}>{status.bytes === undefined ? t('unknown') : formatBytes(status.bytes)}</span></dd>
        </dl>
      </div>

      {copiedField === 'error' && <p className={css.notice} data-tone="error" role="status">{t('copyFailed')}</p>}
      {status.reason && <div className={css.notice} data-tone="info">
        <p>{status.source === 'environment' ? t('envReasonHint') : status.reason}</p>
      </div>}
      {status.cleanupIncomplete && <p className={css.notice} data-tone="error" role="alert">{t('cleanup')}</p>}
      {phase === 'rolled-back' && <p className={css.notice} data-tone="error" role="status">{t('rolledBack')}</p>}
      {phase === 'complete' && <p className={css.notice} data-tone="success" role="status">{t('complete')}</p>}

      {(status.canMigrate || busy || target) && <div className={css.workflow}>
        <div className={css.workflowHead}>
          <h4>{t('destination')}</h4>
        </div>
        <ol className={css.stepper} aria-label={t('destination')}>
          <li data-state={step1State}>{t('stepChoose')}</li>
          <li data-state={step2State}>{t('stepPreflight')}</li>
          <li data-state={step3State}>{t('stepExecute')}</li>
        </ol>

        {target
          ? <code className={css.target} title={target}>{target}</code>
          : <p className={css.targetPlaceholder}>{t('targetPlaceholder')}</p>}

        {busy === 'check' && <div className={css.notice} data-tone="info" role="status">
          <div className={css.inlineStatus}><span className={css.spinner} aria-hidden="true" /><span>{t('checking')}</span></div>
        </div>}

        {preflightError && <div className={css.notice} data-tone="error" role="alert">
          <strong>{t('preflightFailed')}</strong>
          <p>{preflightError}</p>
        </div>}

        {plan && <div className={css.notice} data-tone={planOk ? 'success' : 'error'} role="status">
          <strong>{t(planOk ? 'ready' : 'preflightFailed')}</strong>
          <div className={css.capacityRow}>
            <span>{t('required')}: <strong>{formatBytes(plan.bytes)}</strong></span>
            <span>{t('free')}: <strong>{formatBytes(plan.freeBytes)}</strong></span>
          </div>
          <div className={css.meter} aria-hidden="true">
            <div className={css.meterFill} data-tone={planOk ? 'success' : 'error'} style={{ width: `${ratio}%` }} />
          </div>
          <p className={css.safetyNote}>{t('safetyNote')}</p>
        </div>}

        <div className={css.workflowFooter}>
          <div className={css.actions}>
            <button type="button" disabled={!!busy || !status.canMigrate} onClick={() => void run('choose', async () => {
              setPlan(undefined)
              setPreflightError('')
              const chosen = await desktop.chooseDataMigration()
              setTarget(chosen)
              if (chosen) {
                setBusy('check')
                await preflight()
              }
            })}>{t('choose')}</button>
            <button type="button" disabled={!!busy || !target || !status.canMigrate} onClick={() => void run('check', preflight)}>
              {t(plan || preflightError ? 'recheck' : 'preflight')}
            </button>
          </div>
          <button className={css.primary} type="button" disabled={!!busy || !status.canMigrate || !planOk} onClick={() => void run('execute', async () => {
            const result = await desktop.executeDataMigration()
            if ('accepted' in result && result.accepted) {
              setPlan(undefined)
              setTarget(null)
            }
            await refresh()
          })}>{t('execute')}</button>
        </div>
      </div>}
    </> : <p className={css.loadingText} role="status">{t(loading ? 'loading' : 'unavailable')}</p>}

    {progress && <div className={css.notice} data-tone="info" role="status">
      <div className={css.inlineStatus}><span className={css.spinner} aria-hidden="true" /><span>{t(progress)}</span></div>
    </div>}
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
