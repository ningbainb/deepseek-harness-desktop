import { useEffect, useState, type ReactNode } from 'react'

import type { DesktopRepairStatus, DesktopRepairUnavailableReason } from '../protocol.ts'
import type { WebUIPluginsKey } from './locales.ts'
import css from './web-ui-settings.module.css'

type RepairAction = 'open-logs' | 'export-diagnostics'

declare global {
  interface Window {
    dshDesktop?: {
      getRepairStatus?: () => Promise<DesktopRepairStatus>
      retryRepair?: () => Promise<{ accepted?: boolean }>
      action?: (action: RepairAction) => Promise<unknown>
    }
  }
}

export interface RepairStatusCardProps {
  t: (key: WebUIPluginsKey) => string
}

function resultKey(status: Extract<DesktopRepairStatus, { available: true }>): WebUIPluginsKey {
  if (status.result === 'applied') return 'repairApplied'
  if (status.result === 'rolled-back') return 'repairRolledBack'
  if (status.result === 'exhausted') return 'repairExhausted'
  return 'repairPending'
}
const unavailableReasonKeys: Record<DesktopRepairUnavailableReason, WebUIPluginsKey> = {
  'full-retry-failed': 'repairFullRetryFailed',
  'missing-credentials': 'repairMissingCredentials',
  'no-model': 'repairNoModel',
  'unsupported-tools': 'repairUnsupportedTools',
  'repair-failed': 'repairFailed',
  'budget-exhausted': 'repairBudgetExhausted',
  'profile-permission': 'repairProfilePermission',
  'profile-installation': 'repairProfileInstallation',
  'profile-failed': 'repairProfileFailed',
}

function DetailList({ title, values, empty }: { title: string; values: string[]; empty: string }): ReactNode {
  return (
    <div className={css.repairDetailGroup}>
      <dt>{title}</dt>
      <dd>
        {values.length === 0
          ? <span className={css.repairEmptyValue}>{empty}</span>
          : <ul>{values.map(value => <li key={value}><code>{value}</code></li>)}</ul>}
      </dd>
    </div>
  )
}

export function RepairStatusCard({ t }: RepairStatusCardProps): ReactNode {
  const [status, setStatus] = useState<DesktopRepairStatus | undefined>()
  const [retrying, setRetrying] = useState(false)
  const [retryFailed, setRetryFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let active = true
    const getRepairStatus = window.dshDesktop?.getRepairStatus
    if (typeof getRepairStatus !== 'function') {
      setStatus({ available: false })
      return () => { active = false }
    }
    void getRepairStatus()
      .then(value => { if (active) setStatus(value) })
      .catch(() => { if (active) setStatus({ available: false }) })
    return () => { active = false }
  }, [])

  const runAction = (action: RepairAction): void => {
    void window.dshDesktop?.action?.(action).catch(() => {})
  }

  const runRepairRetry = (): void => {
    const retryRepair = window.dshDesktop?.retryRepair
    if (retrying || typeof retryRepair !== 'function') return
    setRetrying(true)
    setRetryFailed(false)
    void retryRepair()
      .then(result => { if (result?.accepted !== true) setRetryFailed(true) })
      .catch(() => setRetryFailed(true))
      .finally(() => setRetrying(false))
  }
  return (
    <section className={css.repairCard} aria-labelledby="desktop-repair-title">
      <div className={css.repairHeader}>
        <span className={css.repairGlyph} aria-hidden="true">R</span>
        <div className={css.repairHeadingBlock}>
          <h3 id="desktop-repair-title">{t('repairTitle')}</h3>
          <p>{t('repairDescription')}</p>
        </div>
        {status?.available === true && (
          <span className={`${css.repairResult} ${css[`repairResult_${status.result}`]}`}>
            {t(resultKey(status))}
          </span>
        )}
      </div>

      {status === undefined && <p className={css.repairQuiet}>{t('repairLoading')}</p>}
      {status?.available === false && (
        <div className={css.repairUnavailable}>
          <p className={css.repairQuiet}>{status.reason === undefined ? t('repairNone') : t(unavailableReasonKeys[status.reason])}</p>
          {status.canRetry === true && typeof window.dshDesktop?.retryRepair === 'function' && (
            <div className={css.repairActions}>
              <button type="button" className={css.repairRetry} disabled={retrying} onClick={runRepairRetry}>
                {retrying ? t('repairRetrying') : t('repairRetry')}
              </button>
            </div>
          )}
          {retryFailed && <p className={`${css.repairQuiet} ${css.repairRetryError}`}>{t('repairRetryFailed')}</p>}
        </div>
      )}
      {status?.available === true && (
        <>
          <button
            type="button"
            className={css.repairDisclosure}
            aria-expanded={expanded}
            onClick={() => setExpanded(value => !value)}
          >
            <span>{expanded ? t('repairCollapse') : t('repairExpand')}</span>
            <span aria-hidden="true" className={expanded ? css.chevronOpen : css.chevron}>⌄</span>
          </button>
          {expanded && (
            <div className={css.repairBody}>
              <dl className={css.repairDetails}>
                <div className={css.repairDetailGroup}>
                  <dt>{t('repairFingerprint')}</dt>
                  <dd><code title={status.fingerprint}>{status.fingerprint.slice(0, 16)}…</code></dd>
                </div>
                <DetailList
                  title={t('repairModels')}
                  values={status.models.map(model => `${model.provider} / ${model.model}`)}
                  empty={t('repairNoItems')}
                />
                <DetailList title={t('repairFiles')} values={status.changedFiles} empty={t('repairNoItems')} />
                <DetailList title={t('repairChecks')} values={status.checks} empty={t('repairNoItems')} />
              </dl>
              <div className={css.repairActions}>
                <button type="button" onClick={() => runAction('open-logs')}>{t('repairOpenLogs')}</button>
                <button type="button" onClick={() => runAction('export-diagnostics')}>{t('repairExportDiagnostics')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
