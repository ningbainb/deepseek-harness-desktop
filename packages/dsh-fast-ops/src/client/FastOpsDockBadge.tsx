import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { fetchFastOpsState, type FastOpsStateResponse } from './api.ts'
import { zh, type FastOpsLocaleKey } from './locales.ts'
import css from './FastOpsDockBadge.module.css'

export interface LiveTokenProjectionLike {
  uncachedInputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface FastOpsDockBadgeProps {
  t?: (key: FastOpsLocaleKey) => string
  useProjection?: (key: string) => LiveTokenProjectionLike | undefined
}

export type FastOpsBadgeCounters = FastOpsStateResponse['counters']

export interface FastOpsBadgeSummary {
  active: boolean
  totalSaved: number
  label: string
}

const HOVER_CLOSE_DELAY_MS = 120
const PROJECTION_REFRESH_MIN_MS = 2500
const OPEN_REFRESH_MIN_MS = 1000
const STATE_CHANGED_EVENT = 'dsh-fast-ops:state-changed'

const defaultTranslate = (key: FastOpsLocaleKey): string => zh[key]
const noopProjection = (): LiveTokenProjectionLike | undefined => undefined

/** Format a token count with compact B/M/K suffixes matching the bottom stats row. */
export function formatCompactTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1_000_000_000) return `${Math.round(value / 100_000_000) / 10}B`
  if (value >= 1_000_000) return `${Math.round(value / 10_000) / 100}M`
  if (value >= 1_000) return `${Math.round(value / 10) / 100}K`
  return String(Math.round(value))
}

/** Derive compact badge copy and active emphasis state from fast-ops counters. */
export function summarizeFastOpsBadge(
  counters: Partial<FastOpsBadgeCounters> | undefined,
  t: (key: FastOpsLocaleKey) => string = defaultTranslate,
): FastOpsBadgeSummary {
  const denoise = Math.max(0, Number(counters?.denoiseTokensSaved ?? 0))
  const spill = Math.max(0, Number(counters?.spillTokensSaved ?? 0))
  const totalSaved = denoise + spill
  const files = Math.max(0, Number(counters?.filesReadInBatches ?? 0))
  const ops = Math.max(0, Number(counters?.batchCalls ?? 0))
    + Math.max(0, Number(counters?.astCalls ?? 0))
    + Math.max(0, Number(counters?.cacheSpills ?? 0))

  if (totalSaved > 0) {
    return {
      active: true,
      totalSaved,
      label: `${t('dockSavedPrefix')} ~${formatCompactTokens(totalSaved)}`,
    }
  }
  if (files > 0) {
    return {
      active: true,
      totalSaved: 0,
      label: `nbfast ${t('dockBatchSuffix')} ${files} ${t('dockFilesUnit')}`,
    }
  }
  if (ops > 0) {
    return {
      active: true,
      totalSaved: 0,
      label: `${t('dockOpsPrefix')} ${ops} ${t('dockOpsUnit')}`,
    }
  }
  return {
    active: false,
    totalSaved: 0,
    label: t('dockReady'),
  }
}

/** Render the always-visible nbfast savings pill and breakdown popover in the composer dock. */
export const FastOpsDockBadge = memo(function FastOpsDockBadge({
  t = defaultTranslate,
  useProjection = noopProjection,
}: FastOpsDockBadgeProps) {
  const [state, setState] = useState<FastOpsStateResponse | null>(null)
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastFetchedAtRef = useRef(0)
  const mountedRef = useRef(true)

  const projection = useProjection('liveTokenUsage')
  const projectionActivityKey = projection
    ? `${projection.uncachedInputTokens ?? 0}:${projection.outputTokens ?? 0}:${projection.cacheReadTokens ?? 0}:${projection.cacheWriteTokens ?? 0}`
    : ''

  const loadState = useCallback(async (force = false) => {
    if (typeof fetch !== 'function') return
    const now = Date.now()
    if (!force && now - lastFetchedAtRef.current < OPEN_REFRESH_MIN_MS) return
    lastFetchedAtRef.current = now
    try {
      const next = await fetchFastOpsState()
      if (mountedRef.current) setState(next)
    } catch {
      // Keep the dock quiet if fast-ops host routes are unavailable.
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadState(true)
    return () => {
      mountedRef.current = false
      if (hoverCloseTimer.current !== undefined) clearTimeout(hoverCloseTimer.current)
    }
  }, [loadState])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onStateChanged = () => { void loadState(true) }
    window.addEventListener(STATE_CHANGED_EVENT, onStateChanged)
    return () => window.removeEventListener(STATE_CHANGED_EVENT, onStateChanged)
  }, [loadState])

  useEffect(() => {
    if (!projectionActivityKey) return
    if (Date.now() - lastFetchedAtRef.current < PROJECTION_REFRESH_MIN_MS) return
    void loadState(true)
  }, [projectionActivityKey, loadState])

  const isOpen = pinned || hovered

  useEffect(() => {
    if (!isOpen) return
    void loadState(false)
  }, [isOpen, loadState])

  useEffect(() => {
    if (!pinned || typeof document === 'undefined') return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setPinned(false)
        setHovered(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false)
        setHovered(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pinned])

  if (!state?.settings?.enabled) return null

  const counters = state.counters
  const denoiseSaved = Math.max(0, Number(counters?.denoiseTokensSaved ?? 0))
  const spillSaved = Math.max(0, Number(counters?.spillTokensSaved ?? 0))
  const filesRead = Math.max(0, Number(counters?.filesReadInBatches ?? 0))
  const batchCalls = Math.max(0, Number(counters?.batchCalls ?? 0))
  const cacheSpills = Math.max(0, Number(counters?.cacheSpills ?? 0))
  const astCalls = Math.max(0, Number(counters?.astCalls ?? 0))
  const toolsActivated = Math.max(0, Number(counters?.toolsActivated ?? 0))
  const summary = summarizeFastOpsBadge(counters, t)

  const handleMouseEnter = () => {
    if (hoverCloseTimer.current !== undefined) {
      clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = undefined
    }
    setHovered(true)
  }

  const handleMouseLeave = () => {
    if (hoverCloseTimer.current !== undefined) clearTimeout(hoverCloseTimer.current)
    hoverCloseTimer.current = setTimeout(() => {
      hoverCloseTimer.current = undefined
      setHovered(false)
    }, HOVER_CLOSE_DELAY_MS)
  }

  return (
    <div
      ref={rootRef}
      className={css.root}
      data-dsh-fast-ops-dock=""
      data-saved={summary.active ? 'true' : 'false'}
      data-open={isOpen ? 'true' : 'false'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={css.pill}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setPinned(prev => !prev)}
      >
        <svg
          className={css.icon}
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z" />
        </svg>
        <span className={css.pillText}>{summary.label}</span>
      </button>

      {isOpen && (
        <div className={css.popover} role="dialog" aria-label={t('dockPopoverTitle')}>
          <div className={css.popoverHeader}>
            <span className={css.popoverTitleWrap}>
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z" />
              </svg>
              <span>{t('dockPopoverTitle')}</span>
            </span>
            <span className={css.statusBadge}>{t('dockPopoverActive')}</span>
          </div>

          {summary.totalSaved > 0 && (
            <div className={css.heroSaved}>
              <span className={css.heroLabel}>{t('dockMetricTotalSaved')}</span>
              <span className={css.heroValue}>{`~${formatCompactTokens(summary.totalSaved)} tok`}</span>
            </div>
          )}

          <dl className={css.metrics}>
            <dt>{t('dockMetricDenoise')}</dt>
            <dd>{denoiseSaved > 0 ? `~${formatCompactTokens(denoiseSaved)} tok` : '0'}</dd>

            <dt>{t('dockMetricSpill')}</dt>
            <dd>
              {spillSaved > 0 || cacheSpills > 0
                ? `${spillSaved > 0 ? `~${formatCompactTokens(spillSaved)} tok` : '0'} · ${cacheSpills} ${t('dockSpillCountSuffix')}`
                : '0'}
            </dd>

            <dt>{t('dockMetricBatch')}</dt>
            <dd>
              {filesRead > 0 || batchCalls > 0
                ? `${filesRead} ${t('dockFilesUnit')} · ${batchCalls} ${t('dockBatchCallsSuffix')}`
                : `0 ${t('dockFilesUnit')}`}
            </dd>

            <dt>{t('dockMetricAst')}</dt>
            <dd>{`${astCalls} ${t('dockOpsUnit')}`}</dd>

            <dt>{t('dockMetricTools')}</dt>
            <dd>{`${toolsActivated} ${t('dockOpsUnit')}`}</dd>
          </dl>

          <p className={css.footnote}>{t('dockFootnote')}</p>
        </div>
      )}
    </div>
  )
})
