import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { createDesktopClient, type DataMigrationPlan, type DataMigrationStatus } from '@linxin666/dsh-desktop-client'
import { useEffect, useState } from 'react'

const zh = {
  title: '数据目录迁移', unavailable: '数据目录由桌面应用管理。', home: '数据目录', cache: '缓存目录', size: '估算体积',
  choose: '选择目标目录', preflight: '迁移预检', execute: '开始迁移并重启', ready: '预检通过。',
  cleanup: '部分迁移残留无法自动清理，请检查目标目录。',
  copying: '正在复制和校验数据。', restarting: '正在重启桌面应用。',
  pending: '正在执行，请稍候。', rolledBack: '桌面应用已恢复到原数据目录。', complete: '迁移完成。旧目录已保留。',
}
const en: typeof zh = {
  title: 'Data directory migration', unavailable: 'The Desktop app manages the data directory.', home: 'Data directory', cache: 'Cache directory', size: 'Estimated size',
  choose: 'Choose destination', preflight: 'Run preflight', execute: 'Migrate and restart', ready: 'Preflight passed.',
  cleanup: 'Some migration files could not be removed. Check the destination directory.',
  copying: 'Copying and verifying data.', restarting: 'Restarting Desktop.',
  pending: 'Working. Please wait.', rolledBack: 'Desktop restored the previous data directory.', complete: 'Migration complete. The previous directory was retained.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'data-location': keyof typeof zh }
  interface SlotMap { 'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } } }
}

const desktop = createDesktopClient()

export function DataLocationCard({ t }: PropsLocale<'data-location'>) {
  const [status, setStatus] = useState<DataMigrationStatus>()
  const [target, setTarget] = useState<string | null>(null)
  const [plan, setPlan] = useState<DataMigrationPlan>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => {
    const result = await desktop.statusDataMigration()
    if (!('available' in result)) setStatus(result)
  }
  useEffect(() => { void refresh().catch(error => setError(String(error))) }, [])
  useEffect(() => {
    if (!busy || !plan) return
    const timer = setInterval(() => void refresh().catch(() => {}), 800)
    return () => clearInterval(timer)
  }, [busy, plan])

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await operation() } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  return <section>
    <h3>{t('title')}</h3>
    {status ? <>
      <dl>
        <dt>{t('home')}</dt><dd>{status.home}</dd>
        <dt>{t('cache')}</dt><dd>{status.cachePath}</dd>
        {status.bytes !== undefined && <><dt>{t('size')}</dt><dd>{(status.bytes / 1024 ** 2).toFixed(1)} MiB</dd></>}
      </dl>
      {status.reason && <p>{status.reason}</p>}
      {status.cleanupIncomplete && <p role="alert">{t('cleanup')}</p>}
      {status.phase === 'rolled-back' && <p role="status">{t('rolledBack')}</p>}
      {status.phase === 'complete' && <p role="status">{t('complete')}</p>}
      {status.canMigrate && <div>
        <button disabled={busy} onClick={() => void run(async () => {
          setPlan(undefined)
          setTarget(await desktop.chooseDataMigration())
        })}>{t('choose')}</button>
        <button disabled={busy || !target} onClick={() => void run(async () => {
          setPlan(undefined)
          const result = await desktop.preflightDataMigration()
          if (!('available' in result)) setPlan(result)
        })}>{t('preflight')}</button>
        <button disabled={busy || !plan} onClick={() => void run(async () => {
          const result = await desktop.executeDataMigration()
          if ('accepted' in result && result.accepted) setPlan(undefined)
          await refresh()
        })}>{t('execute')}</button>
      </div>}
      {target && <p>{target}</p>}
      {plan && !busy && <p role="status">{t('ready')} {(plan.bytes / 1024 ** 2).toFixed(1)} MiB / {(plan.freeBytes / 1024 ** 2).toFixed(1)} MiB</p>}
    </> : <p>{t('unavailable')}</p>}
    {busy && <p role="status">{t(status?.phase === 'copying' ? 'copying' : status?.phase === 'ready-to-boot' ? 'restarting' : 'pending')}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}

export const inject = ['slots', 'locale']
export function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register('data-location', { zh, en }))
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item', id: 'data-location', order: 118, locale: 'data-location',
  }, DataLocationCard))
}
