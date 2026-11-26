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

  return (
    <section className={css.card} data-fast-ops-settings>
      <header className={css.header}>
        <div>
          <h3 className={css.title}>{t('cardTitle')}</h3>
          <p className={css.description}>{t('cardDescription')}</p>
        </div>
        <span className={css.statusPill} data-active={draft.enabled ? 'true' : 'false'}>
          {draft.enabled ? t('statusActive') : t('statusDisabled')}
        </span>
      </header>

      {state && (
        <div className={css.statsGrid}>
          <div className={css.statBox}>
            <div className={css.statValue}>{state.counters.batchCalls}</div>
            <div className={css.statLabel}>{t('statsBatchCalls')}</div>
          </div>
          <div className={css.statBox}>
            <div className={css.statValue}>{state.counters.filesReadInBatches}</div>
            <div className={css.statLabel}>{t('statsFilesBatched')}</div>
          </div>
          <div className={css.statBox}>
            <div className={css.statValue}>{state.counters.cacheSpills}</div>
            <div className={css.statLabel}>{t('statsSpills')}</div>
          </div>
          <div className={css.statBox}>
            <div className={css.statValue}>{state.counters.toolsActivated}</div>
            <div className={css.statLabel}>{t('statsActivated')}</div>
          </div>
          <div className={css.statBox}>
            <div className={css.statValue}>{`${state.cache.totalRefs} (${formatBytes(state.cache.totalBytes)})`}</div>
            <div className={css.statLabel}>{t('statsCacheRefs')}</div>
          </div>
        </div>
      )}

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={e => setDraft(prev => ({ ...prev, enabled: e.target.checked }))}
        />
        <span>{t('enableLabel')}</span>
      </label>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.lazySpecializedTools}
          onChange={e => setDraft(prev => ({ ...prev, lazySpecializedTools: e.target.checked }))}
        />
        <span>{t('lazyToolsLabel')}</span>
      </label>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.batchingGuidance}
          onChange={e => setDraft(prev => ({ ...prev, batchingGuidance: e.target.checked }))}
        />
        <span>{t('batchGuidanceLabel')}</span>
      </label>

      <div className={css.grid}>
        <label className={css.field}>
          <span>{t('maxInlineLabel')}</span>
          <select
            className={css.select}
            value={String(draft.maxInlineBytes)}
            onChange={e => setDraft(prev => ({ ...prev, maxInlineBytes: Number(e.target.value) }))}
          >
            {INLINE_BYTE_OPTIONS.map(bytes => (
              <option key={bytes} value={String(bytes)}>{`${bytes / 1024} KB`}</option>
            ))}
          </select>
        </label>

        <label className={css.field}>
          <span>{t('ttlLabel')}</span>
          <select
            className={css.select}
            value={String(draft.resultCacheTtlMs)}
            onChange={e => setDraft(prev => ({ ...prev, resultCacheTtlMs: Number(e.target.value) }))}
          >
            {TTL_MS_OPTIONS.map(ms => (
              <option key={ms} value={String(ms)}>{ttlLabel(ms)}</option>
            ))}
          </select>
        </label>
      </div>

      <footer className={css.footer}>
        <div>
          {feedback && (
            <span className={feedback.kind === 'ok' ? css.notice : css.error}>{feedback.text}</span>
          )}
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
