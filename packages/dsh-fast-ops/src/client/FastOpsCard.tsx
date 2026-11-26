import { useCallback, useEffect, useState } from 'react'
import {
  INLINE_BYTE_OPTIONS,
  TTL_MS_OPTIONS,
  defaultSettings,
  type FastOpsSettings,
} from '../core/settings.ts'
import {
  fetchFastOpsState,
  reclaimFastOpsCache,
  saveFastOpsSettings,
  type FastOpsStateResponse,
} from './api.ts'
import type { FastOpsLocaleKey } from './locales.ts'
import css from './FastOps.module.css'

export interface FastOpsCardProps {
  t: (key: FastOpsLocaleKey) => string
}

const RESIDENT_TOOL_NAMES = ['fast_read_files', 'fast_search', 'fast_edit_batch', 'fast_discover'] as const
const SPECIALIZED_TOOL_NAMES = ['fast_stat', 'fast_diff', 'fast_replace', 'fast_read_table', 'fast_result'] as const

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function FastOpsCard({ t }: FastOpsCardProps) {
  const [state, setState] = useState<FastOpsStateResponse | null>(null)
  const [draft, setDraft] = useState<FastOpsSettings>(defaultSettings)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchFastOpsState()
      setState(next)
      setDraft(next.settings)
    } catch {
      setFeedback({ kind: 'err', text: t('errorNotice') })
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSave() {
    setBusy(true)
    setFeedback(null)
    try {
      const res = await saveFastOpsSettings(draft)
      setDraft(res.settings)
      setState(prev => (prev ? { ...prev, settings: res.settings } : prev))
      setFeedback({ kind: 'ok', text: t('savedNotice') })
    } catch {
      setFeedback({ kind: 'err', text: t('errorNotice') })
    } finally {
      setBusy(false)
    }
  }

  async function handleReclaim() {
    setBusy(true)
    setFeedback(null)
    try {
      const res = await reclaimFastOpsCache()
      setState(prev => (prev ? { ...prev, cache: res.cache } : prev))
      setFeedback({ kind: 'ok', text: t('reclaimedNotice') })
    } catch {
      setFeedback({ kind: 'err', text: t('errorNotice') })
    } finally {
      setBusy(false)
    }
  }

  const ttlLabel = (ms: number) => {
    if (ms === 900000) return t('ttl15m')
    if (ms === 3600000) return t('ttl1h')
    return t('ttl6h')
  }

  const counters = state?.counters ?? {
    batchCalls: 0,
    filesReadInBatches: 0,
    cacheSpills: 0,
    toolsActivated: 0,
  }
  const cache = state?.cache ?? { totalRefs: 0, totalBytes: 0, sessionCount: 0 }
  const isDirty = state !== null && JSON.stringify(draft) !== JSON.stringify(state.settings)

  return (
    <section className={css.card} data-fast-ops-settings data-fast-ops-loaded={state ? 'true' : 'false'}>
      <header className={css.hero}>
        <div className={css.heroText}>
          <div className={css.titleRow}>
            <h3 className={css.title}>{t('cardTitle')}</h3>
            <span className={css.statusPill} data-active={draft.enabled ? 'true' : 'false'}>
              <span className={css.statusDot} aria-hidden="true" />
              <span>{draft.enabled ? t('statusActive') : t('statusDisabled')}</span>
            </span>
          </div>
          <p className={css.description}>{t('cardDescription')}</p>
        </div>

        <label className={css.heroControl}>
          <span className={css.masterText}>{t('enableLabel')}</span>
          <span className={css.switchControl}>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('enableLabel')}
              className={css.switchInput}
              checked={draft.enabled}
              onChange={e => setDraft(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <span className={css.switchTrack} aria-hidden="true" />
          </span>
        </label>
      </header>

      <div className={css.metricsStrip} data-fast-ops-stats>
        <div className={css.metricCard}>
          <div className={css.metricValue}>{counters.batchCalls}</div>
          <div className={css.metricLabel}>{t('statsBatchCalls')}</div>
        </div>
        <div className={css.metricCard}>
          <div className={css.metricValue}>{counters.filesReadInBatches}</div>
          <div className={css.metricLabel}>{t('statsFilesBatched')}</div>
        </div>
        <div className={css.metricCard}>
          <div className={css.metricValue}>{counters.toolsActivated}</div>
          <div className={css.metricLabel}>{t('statsActivated')}</div>
        </div>
        <div className={css.metricCard}>
          <div className={css.metricValue}>{`${cache.totalRefs} (${formatBytes(cache.totalBytes)})`}</div>
          <div className={css.metricLabel}>{t('statsCacheRefs')}</div>
          <div className={css.metricSub}>{`${counters.cacheSpills} ${t('statsSpillSuffix')}`}</div>
        </div>
      </div>

      <div className={css.sectionBlock}>
        <div className={css.sectionHeading}>{t('coreSectionTitle')}</div>

        <div className={css.settingRow}>
          <div className={css.rowText}>
            <div className={css.rowTitle}>{t('lazyToolsLabel')}</div>
            <div className={css.rowDesc}>{t('lazyToolsDesc')}</div>
          </div>
          <label className={css.switchControl}>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('lazyToolsLabel')}
              className={css.switchInput}
              checked={draft.lazySpecializedTools}
              onChange={e => setDraft(prev => ({ ...prev, lazySpecializedTools: e.target.checked }))}
            />
            <span className={css.switchTrack} aria-hidden="true" />
          </label>
        </div>

        <div className={css.settingRow}>
          <div className={css.rowText}>
            <div className={css.rowTitle}>{t('batchGuidanceLabel')}</div>
            <div className={css.rowDesc}>{t('batchGuidanceDesc')}</div>
          </div>
          <label className={css.switchControl}>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('batchGuidanceLabel')}
              className={css.switchInput}
              checked={draft.batchingGuidance}
              onChange={e => setDraft(prev => ({ ...prev, batchingGuidance: e.target.checked }))}
            />
            <span className={css.switchTrack} aria-hidden="true" />
          </label>
        </div>
      </div>

      <div className={css.legendPanel}>
        <div className={css.legendRow}>
          <span className={css.legendGroupLabel}>{t('residentLabel')}</span>
          {RESIDENT_TOOL_NAMES.map(name => (
            <code key={name} className={`${css.toolTag} ${css.toolTagPrimary}`}>{name}</code>
          ))}
        </div>
        <div className={css.legendRow}>
          <span className={css.legendGroupLabel}>{t('specializedLabel')}</span>
          {SPECIALIZED_TOOL_NAMES.map(name => (
            <code key={name} className={css.toolTag}>{name}</code>
          ))}
        </div>
      </div>

      <details className={css.disclosure}>
        <summary className={css.disclosureSummary}>{t('advancedTitle')}</summary>
        <div className={css.disclosureBody}>
          <div className={css.fieldGroup}>
            <div className={css.fieldTitle}>{t('maxInlineLabel')}</div>
            <div className={css.fieldDesc}>{t('maxInlineDesc')}</div>
            <div className={css.segmented4} role="group" aria-label={t('maxInlineLabel')}>
              {INLINE_BYTE_OPTIONS.map(bytes => (
                <button
                  key={bytes}
                  type="button"
                  className={css.segBtn}
                  aria-pressed={draft.maxInlineBytes === bytes}
                  onClick={() => setDraft(prev => ({ ...prev, maxInlineBytes: bytes }))}
                >
                  {`${bytes / 1024} KB`}
                </button>
              ))}
            </div>
          </div>

          <div className={css.fieldGroup}>
            <div className={css.fieldTitle}>{t('ttlLabel')}</div>
            <div className={css.segmented3} role="group" aria-label={t('ttlLabel')}>
              {TTL_MS_OPTIONS.map(ms => (
                <button
                  key={ms}
                  type="button"
                  className={css.segBtn}
                  aria-pressed={draft.resultCacheTtlMs === ms}
                  onClick={() => setDraft(prev => ({ ...prev, resultCacheTtlMs: ms }))}
                >
                  {ttlLabel(ms)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      <footer className={css.footer}>
        <div>
          {feedback ? (
            <span className={feedback.kind === 'ok' ? css.notice : css.error}>{feedback.text}</span>
          ) : isDirty ? (
            <span className={css.dirty}>{t('dirtyNotice')}</span>
          ) : null}
        </div>
        <div className={css.actions}>
          <button type="button" className={css.btn} disabled={busy} onClick={() => void refresh()}>
            {t('refresh')}
          </button>
          <button type="button" className={css.btn} disabled={busy} onClick={() => void handleReclaim()}>
            {t('reclaimAction')}
          </button>
          <button type="button" className={css.primaryBtn} disabled={busy} onClick={() => void handleSave()}>
            {busy ? t('saving') : t('saveAction')}
          </button>
        </div>
      </footer>
    </section>
  )
}
