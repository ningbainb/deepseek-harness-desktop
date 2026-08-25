import { memo } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (conversation.composer.dock).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Props supplied by the session-scoped composer dock. */
export interface TpsLineProps {
  useProjection: UseProjection
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

/** Composer-status lines for the current cost estimate and response throughput. */
export const TpsLine = memo(function TpsLine({ useProjection }: TpsLineProps) {
  const projection = useProjection('liveTokenUsage')
  const rate = projection?.tokensPerSecond
  return (
    <>
      <UsageCostLine projection={projection} />
      {rate === undefined ? null : <div style={STYLE}>TPS {formatTokensPerSecond(rate)} tok/s</div>}
    </>
  )
})

/**
 * Composer-dock entry: adapts the session-scoped `conversation.composer.dock`
 * runtime share to the TPS line. The dock is the shipped stats-line seat, and
 * its standard kit supplies `useProjection` (the fifth framework hook seat),
 * which reads the host's `liveTokenUsage` projection. Registering here makes
 * the live TPS row actually mount — previously the TpsLine was only exported
 * and never mounted on rc.6 (issue #56).
 */
export const TpsLineDockEntry = memo(function TpsLineDockEntry(props: PropsRuntime<'conversation.composer.dock'>) {
  return <TpsLine useProjection={props.useProjection} />
})
