import React from 'react'
import type { ModelBreakdownEntry } from '../ledger-store.ts'
import { formatCost, formatTokens } from './format.ts'
import styles from './balance.module.css'

export interface ModelBreakdownChartProps {
  models: ModelBreakdownEntry[]
}

/* Model palette rides the DSH semantic tokens so the breakdown follows the
   active skin; hex fallbacks keep distinct hues when a token is absent. */
const MODEL_COLORS = [
  'var(--dsw-alias-state-business-primary, #3b82f6)',
  'var(--dsw-alias-state-success-primary, #10b981)',
  'var(--dsw-alias-state-warn-primary, #f59e0b)',
  'var(--dsw-alias-state-error-primary, #ec4899)',
  'var(--dsw-alias-brand-primary, #6366f1)',
  'var(--dsw-alias-label-dimmed, #a855f7)',
]

export const ModelBreakdownChart: React.FC<ModelBreakdownChartProps> = ({ models }) => {
  return (
    <div className={styles.breakdownCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a10 10 0 0 1 10 10h-10z"></path>
          </svg>
          模型消耗分布
        </div>
      </div>

      {/* Multi-segment progress bar */}
      <div className={styles.multiBar}>
        {models.map((m, i) => (
          <div
            key={m.model}
            className={styles.multiBarSegment}
            style={{
              width: `${Math.max(m.percentage, 2)}%`,
              backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length],
            }}
            title={`${m.model}: ${m.percentage}% (${m.tokens.toLocaleString()} tokens)`}
          />
        ))}
      </div>

      {/* Model list */}
      <div className={styles.modelList}>
        {models.map((m, i) => (
          <div key={m.model} className={styles.modelItem}>
            <div className={styles.modelItemLeft}>
              <span
                className={styles.modelDot}
                style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }}
              />
              <span className={styles.modelItemName}>{m.model}</span>
            </div>
            <div className={styles.modelItemRight}>
              <span className={styles.modelTokens} title={`${m.tokens.toLocaleString()} tokens`}>
                {formatTokens(m.tokens)} tokens
              </span>
              <span className={styles.modelPercent}>{m.percentage}%</span>
              {m.cost > 0 && <span className={styles.modelCost}>¥{formatCost(m.cost)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
