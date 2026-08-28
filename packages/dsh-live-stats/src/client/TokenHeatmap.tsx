import React, { useState } from 'react'
import type { HeatmapDay } from '../ledger-store.ts'
import { formatCost, formatTokens } from './format.ts'
import styles from './balance.module.css'

export interface TokenHeatmapProps {
  data: HeatmapDay[]
}

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const DAYS = ['', '周一', '', '周三', '', '周五', '']

export const TokenHeatmap: React.FC<TokenHeatmapProps> = ({ data }) => {
  const [hoveredDay, setHoveredDay] = useState<{ day: HeatmapDay; x: number; y: number } | null>(null)

  // Organize 364 days into 52 weeks x 7 days
  const weeks: HeatmapDay[][] = []
  let currentWeek: HeatmapDay[] = []

  // Pad the first week if needed
  const firstDate = data.length > 0 ? new Date(data[0].date) : new Date()
  const firstDayOfWeek = firstDate.getDay() // 0 is Sunday
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push({
      date: '',
      count: 0,
      level: 0,
      cost: 0,
      turns: 0,
    })
  }

  for (const day of data) {
    currentWeek.push(day)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({
        date: '',
        count: 0,
        level: 0,
        cost: 0,
        turns: 0,
      })
    }
    weeks.push(currentWeek)
  }

  // Calculate month label positions
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weeks.forEach((week, colIndex) => {
    const validDay = week.find((d) => d.date)
    if (validDay) {
      const month = new Date(validDay.date).getMonth()
      if (month !== lastMonth && colIndex < weeks.length - 2) {
        monthLabels.push({ label: MONTHS[month], col: colIndex })
        lastMonth = month
      }
    }
  })

  const getColor = (level: number): string => {
    const success = 'var(--dsw-alias-state-success-primary, #10b981)'
    switch (level) {
      case 1: return `color-mix(in srgb, ${success} 30%, transparent)`
      case 2: return `color-mix(in srgb, ${success} 55%, transparent)`
      case 3: return `color-mix(in srgb, ${success} 80%, transparent)`
      case 4: return success
      default: return 'var(--dsw-alias-bg-base, rgba(128, 128, 128, 0.15))'
    }
  }

  const cellSize = 10
  const cellGap = 3
  const leftPad = 28
  const topPad = 18

  return (
    <div className={styles.heatmapCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Token 活跃热力图 · 近一年
        </div>
        <div className={styles.heatmapLegend}>
          <span>少</span>
          <div className={styles.legendCell} style={{ background: getColor(0) }} />
          <div className={styles.legendCell} style={{ background: getColor(1) }} />
          <div className={styles.legendCell} style={{ background: getColor(2) }} />
          <div className={styles.legendCell} style={{ background: getColor(3) }} />
          <div className={styles.legendCell} style={{ background: getColor(4) }} />
          <span>多</span>
        </div>
      </div>

      <div className={styles.heatmapScrollContainer}>
        <svg
          width={leftPad + weeks.length * (cellSize + cellGap) + 10}
          height={topPad + 7 * (cellSize + cellGap) + 8}
          className={styles.heatmapSvg}
        >
          {/* Month labels */}
          {monthLabels.map(({ label, col }, i) => (
            <text
              key={`m-${i}`}
              x={leftPad + col * (cellSize + cellGap)}
              y={11}
              className={styles.svgText}
            >
              {label}
            </text>
          ))}

          {/* Day of week labels */}
          {DAYS.map((label, rowIndex) => (
            label ? (
              <text
                key={`d-${rowIndex}`}
                x={0}
                y={topPad + rowIndex * (cellSize + cellGap) + 8}
                className={styles.svgText}
              >
                {label}
              </text>
            ) : null
          ))}

          {/* Grid Cells */}
          {weeks.map((week, colIndex) =>
            week.map((day, rowIndex) => {
              if (!day.date) return null
              const x = leftPad + colIndex * (cellSize + cellGap)
              const y = topPad + rowIndex * (cellSize + cellGap)
              return (
                <rect
                  key={`${colIndex}-${rowIndex}`}
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  ry={2}
                  style={{ fill: getColor(day.level) }}
                  className={styles.heatmapCell}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoveredDay({ day, x: rect.left + rect.width / 2, y: rect.top - 8 })
                  }}
                  onMouseLeave={() => setHoveredDay(null)}
                />
              )
            })
          )}
        </svg>

        {hoveredDay && (
          <div
            className={styles.tooltip}
            style={{
              position: 'fixed',
              left: `${hoveredDay.x}px`,
              top: `${hoveredDay.y}px`,
              transform: 'translate(-50%, -100%)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <div className={styles.tooltipDate}>{hoveredDay.day.date}</div>
            <div className={styles.tooltipContent}>
              <strong title={`${hoveredDay.day.count.toLocaleString()} tokens`}>
                {formatTokens(hoveredDay.day.count)} tokens
              </strong>
              {hoveredDay.day.turns > 0 && ` · ${hoveredDay.day.turns} 轮对话`}
            </div>
            {hoveredDay.day.cost > 0 && (
              <div className={styles.tooltipCost}>
                约 ¥{formatCost(hoveredDay.day.cost)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
