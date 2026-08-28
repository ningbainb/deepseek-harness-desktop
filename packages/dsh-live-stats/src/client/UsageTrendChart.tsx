import React, { useState } from 'react'
import type { DailyUsageRecord } from '../ledger-store.ts'
import { formatCost, formatTokens } from './format.ts'
import styles from './balance.module.css'

export interface UsageTrendChartProps {
  records: DailyUsageRecord[]
}

export const UsageTrendChart: React.FC<UsageTrendChartProps> = ({ records }) => {
  const [hoveredRec, setHoveredRec] = useState<{ rec: DailyUsageRecord; x: number; y: number } | null>(null)

  const height = 130
  const width = 640
  const padBottom = 22
  const chartHeight = height - padBottom
  const barWidth = 12
  const gap = (width - 40) / Math.max(records.length, 1)

  const maxTokens = Math.max(...records.map((r) => r.totalTokens), 1000)

  return (
    <div className={styles.chartCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          近 30 天用量走势
        </div>
        <div className={styles.chartLegend}>
          <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--dsw-alias-state-business-primary, #3b82f6)' }} />输入</span>
          <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--dsw-alias-state-warn-primary, #f59e0b)' }} />输出</span>
          <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--dsw-alias-state-success-primary, #10b981)' }} />缓存</span>
        </div>
      </div>

      <div className={styles.chartContainer}>
        <svg viewBox={`0 0 ${width} ${height}`} className={styles.trendSvg}>
          {/* Baseline */}
          <line x1="10" y1={chartHeight} x2={width - 10} y2={chartHeight} stroke="var(--dsw-alias-border-l1)" strokeWidth="1" />

          {records.map((rec, i) => {
            const x = 20 + i * gap
            const totalH = (rec.totalTokens / maxTokens) * (chartHeight - 15)
            const inH = (rec.inputTokens / maxTokens) * (chartHeight - 15)
            const outH = (rec.outputTokens / maxTokens) * (chartHeight - 15)
            const cacheH = ((rec.cacheReadTokens + rec.cacheWriteTokens) / maxTokens) * (chartHeight - 15)

            const showDate = i % 5 === 0 || i === records.length - 1

            return (
              <g key={rec.date}>
                {/* Background placeholder bar */}
                <rect
                  x={x}
                  y={10}
                  width={barWidth}
                  height={chartHeight - 10}
                  fill="transparent"
                  className={styles.barHoverZone}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoveredRec({ rec, x: rect.left + rect.width / 2, y: rect.top - 8 })
                  }}
                  onMouseLeave={() => setHoveredRec(null)}
                />

                {rec.totalTokens === 0 ? (
                  <rect
                    x={x}
                    y={chartHeight - 2}
                    width={barWidth}
                    height={2}
                    rx={1}
                    fill="var(--dsw-alias-bg-layer-3, rgba(128, 128, 128, 0.15))"
                  />
                ) : (
                  <>
                    {/* Cache Tokens */}
                    <rect
                      x={x}
                      y={chartHeight - totalH}
                      width={barWidth}
                      height={cacheH}
                      rx={2}
                      fill="var(--dsw-alias-state-success-primary, #10b981)"
                      className={styles.barRect}
                    />
                    {/* Input Tokens */}
                    <rect
                      x={x}
                      y={chartHeight - inH - outH}
                      width={barWidth}
                      height={inH}
                      rx={2}
                      fill="var(--dsw-alias-state-business-primary, #3b82f6)"
                      className={styles.barRect}
                    />
                    {/* Output Tokens */}
                    <rect
                      x={x}
                      y={chartHeight - outH}
                      width={barWidth}
                      height={outH}
                      rx={2}
                      fill="var(--dsw-alias-state-warn-primary, #f59e0b)"
                      className={styles.barRect}
                    />
                  </>
                )}

                {showDate && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 4}
                    textAnchor="middle"
                    className={styles.svgDateText}
                  >
                    {rec.date.slice(5)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {hoveredRec && (
          <div
            className={styles.tooltip}
            style={{
              position: 'fixed',
              left: `${hoveredRec.x}px`,
              top: `${hoveredRec.y}px`,
              transform: 'translate(-50%, -100%)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <div className={styles.tooltipDate}>{hoveredRec.rec.date}</div>
            <div className={styles.tooltipRow}>
              <span>总用量</span>
              <strong title={`${hoveredRec.rec.totalTokens.toLocaleString()} tokens`}>
                {formatTokens(hoveredRec.rec.totalTokens)}
              </strong>
            </div>
            <div className={styles.tooltipDetail}>
              <div>输入 {formatTokens(hoveredRec.rec.inputTokens)}</div>
              <div>输出 {formatTokens(hoveredRec.rec.outputTokens)}</div>
              <div>缓存 {formatTokens(hoveredRec.rec.cacheReadTokens)}</div>
            </div>
            {hoveredRec.rec.estimatedCost > 0 && (
              <div className={styles.tooltipCost}>
                约 ¥{formatCost(hoveredRec.rec.estimatedCost)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
