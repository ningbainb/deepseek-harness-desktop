import { memo } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh, type SettingsCardKey } from './locales.ts'
import styles from './TpsLine.module.css'
// Type-only: pulls the ui-conversation SlotMap merge (conversation.composer.dock).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Props supplied by the session-scoped composer dock. */
export interface TpsLineProps {
  useProjection: UseProjection
  t?: (key: SettingsCardKey) => string
}

/** Format throughput with one decimal below 100 tok/s. */
export function formatTokensPerSecond(value: number): string {
  return String(value < 100 ? Math.round(value * 10) / 10 : Math.round(value))
}

/** Format a token count using the compact units used by the DSH stats row. */
export function formatCompactTokens(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000) return String(Math.round(value / 100_000_000) / 10) + 'B'
  if (absolute >= 1_000_000) return String(Math.round(value / 10_000) / 100) + 'M'
  if (absolute >= 1_000) return String(Math.round(value / 10) / 100) + 'K'
  return String(Math.round(value))
}

/** Format a current-session cost estimate for the compact line. */
export function formatEstimatedCost(value: number, currency = 'CNY'): string {
  const safeValue = Number.isFinite(value) && value >= 0 ? value : 0
  const symbol = currency === 'CNY' ? '¥' : currency + ' '
  return symbol + safeValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

const STYLE = {
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: '20px',
  margin: '0 auto',
  maxWidth: 'var(--dsh-chat-content-width)',
  overflow: 'hidden',
  padding: '0 var(--dsh-composer-side-clearance)',
  textAlign: 'center',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
} as const

export interface UsageCostLineProps {
  projection?: {
    uncachedInputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    estimatedCost?: number
    costCurrency?: string
  }
}

/** Render the current-session token buckets and estimated cost. */
export const UsageCostLine = memo(function UsageCostLine({ projection }: UsageCostLineProps) {
  if (projection?.estimatedCost === undefined) return null
  const inputTokens = projection.uncachedInputTokens
    + projection.cacheReadTokens
    + projection.cacheWriteTokens
  return (
    <div style={STYLE}>
      API ↑{formatCompactTokens(inputTokens)} ↓{formatCompactTokens(projection.outputTokens)}
      {' · '}≈{formatEstimatedCost(projection.estimatedCost, projection.costCurrency)}
    </div>
  )
})

const defaultTranslation = (key: SettingsCardKey): string => zh[key]
const validMeasurement = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0

/** Native stats stay authoritative; desktop-only readings live in one disclosure. */
export const TpsLine = memo(function TpsLine({ useProjection, t = defaultTranslation }: TpsLineProps) {
  const projection = useProjection('liveTokenUsage')
  const rate = projection?.tokensPerSecond
  const peak = projection?.peakTokensPerSecond
  const input = projection === undefined ? 0 : projection.uncachedInputTokens
    + projection.cacheReadTokens + projection.cacheWriteTokens
  const output = projection?.outputTokens ?? 0
  // A zero initial projection is not evidence of a billed conversation.
  if (projection === undefined || !(input > 0 || output > 0 || validMeasurement(rate) || validMeasurement(peak))) return null
  const estimated = projection.estimated ? '~' : ''
  return (
    <details className={styles.root} data-dsh-live-stats>
      <summary className={styles.summary}>
        {validMeasurement(projection.estimatedCost)
          ? `≈${formatEstimatedCost(projection.estimatedCost, projection.costCurrency)}`
          : t('stats.live')}
        {' · '}{t('stats.details')}
      </summary>
      <div className={styles.panel}>
        <dl className={styles.metrics}>
          <dt>{t('stats.input')}</dt><dd>{estimated}{formatCompactTokens(input)}</dd>
          <dt>{t('stats.output')}</dt><dd>{estimated}{formatCompactTokens(output)}</dd>
          {validMeasurement(rate) && <><dt>{t('stats.rolling')}</dt><dd>{formatTokensPerSecond(rate)} tok/s</dd></>}
          {validMeasurement(peak) && <><dt>{t('stats.peak')}</dt><dd>{formatTokensPerSecond(peak)} tok/s</dd></>}
        </dl>
        <p className={styles.note}>{t('stats.explanation')}</p>
      </div>
    </details>
  )
})

/** The official composer dock supplies the session projection and localized copy. */
export const TpsLineDockEntry = memo(function TpsLineDockEntry(props: PropsRuntime<'conversation.composer.dock'> & PropsLocale<'live-stats'>) {
  return <TpsLine useProjection={props.useProjection} t={props.t} />
})
