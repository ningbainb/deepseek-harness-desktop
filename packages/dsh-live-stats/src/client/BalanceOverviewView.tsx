/**
 * LLM Analytics & Usage Center Overview View.
 * Renders model name, providers, adaptive metric cards, GitHub-style token heatmap,
 * 30-day usage trends, model breakdown, notice, back and refresh actions.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { BalanceController, BalanceState } from './balance-controller.ts'
import { formatBalanceAmount, formatCost, formatTokens } from './format.ts'
import { TokenHeatmap } from './TokenHeatmap.tsx'
import { UsageTrendChart } from './UsageTrendChart.tsx'
import { ModelBreakdownChart } from './ModelBreakdownChart.tsx'
import css from './balance.module.css'

export interface BalanceOverviewViewProps {
  controller: BalanceController
  onClose?: () => void
}

interface MetricSub {
  text: string
  accent?: boolean
}

interface MetricCardProps {
  label: string
  value: string
  /** Full-precision figure shown as a native tooltip when the value is compacted. */
  valueTitle?: string
  subs?: MetricSub[]
}

function MetricCard({ label, value, valueTitle, subs }: MetricCardProps): ReactElement {
  return (
    <div className={css.metricCard}>
      <span className={css.metricLabel}>{label}</span>
      <span className={css.metricValue} title={valueTitle}>{value}</span>
      {subs?.map((sub) => (
        <span
          key={sub.text}
          className={sub.accent ? `${css.metricSub} ${css.metricSubAccent}` : css.metricSub}
        >
          {sub.text}
        </span>
      ))}
    </div>
  )
}

export function BalanceOverviewView({ controller, onClose }: BalanceOverviewViewProps): ReactElement {
  const [state, setState] = useState<BalanceState>(() => controller.getSnapshot())

  useEffect(() => {
    const unsub = controller.subscribe(setState)
    void controller.fetchBalance()
    return unsub
  }, [controller])

  const handleRefresh = (): void => {
    void controller.fetchBalance(true)
  }

  const handleBack = (): void => {
    controller.setOpen(false)
    onClose?.()
  }

  const stats = state.stats
  const isOfficialBalanceAvailable = state.totalBalance !== '--' && !state.error

  return (
    <div className={css.surfaceContainer} data-testid="llm-balance-overview">
      <div className={css.contentWrapper}>
        <header className={css.surfaceHeader}>
          <div className={css.headerLeft}>
            <button
              type="button"
              className={css.backButton}
              onClick={handleBack}
              aria-label="返回对话"
            >
              ← 返回对话
            </button>
            <h1 className={css.surfaceTitle}>大模型用量与数据分析中心</h1>
          </div>

          <div className={css.headerRight}>
            <span className={css.lastUpdatedText}>
              更新于 {new Date(state.lastUpdated).toLocaleTimeString()}
            </span>
            <button
              type="button"
              className={css.refreshButton}
              onClick={handleRefresh}
              disabled={state.loading}
              aria-label="刷新用量与余额"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              {state.loading ? '正在同步…' : '刷新数据'}
            </button>
          </div>
        </header>

        {/* Model Title & Core Metrics */}
        <section className={css.modelCard}>
          <div className={css.modelTitleRow}>
            <h2 className={css.modelName}>{state.modelName}</h2>
            <span className={css.providerBadge}>当前服务商: {state.provider}</span>
          </div>

          <div className={css.metricsGrid}>
            {isOfficialBalanceAvailable ? (
              <MetricCard
                label="可用余额"
                value={formatBalanceAmount(state.totalBalance, state.currency)}
                subs={[
                  { text: `充值 ${formatBalanceAmount(state.toppedUpBalance, state.currency)}` },
                  { text: `赠送 ${formatBalanceAmount(state.grantedBalance, state.currency)}` },
                ]}
              />
            ) : null}
            <MetricCard
              label="今日 Tokens"
              value={formatTokens(stats?.todayTokens ?? 0)}
              valueTitle={`${(stats?.todayTokens ?? 0).toLocaleString()} tokens`}
              subs={[{ text: `约 ¥${formatCost(stats?.todayCost ?? 0)} · ${stats?.todayTurns ?? 0} 轮对话` }]}
            />
            <MetricCard
              label="累计 Tokens"
              value={formatTokens(stats?.totalTokens ?? 0)}
              valueTitle={`${(stats?.totalTokens ?? 0).toLocaleString()} tokens`}
              subs={[{ text: `共 ${stats?.totalTurns ?? 0} 轮对话` }]}
            />
            <MetricCard
              label="缓存节省"
              value={formatTokens(stats?.cacheSavedTokens ?? 0)}
              valueTitle={`${(stats?.cacheSavedTokens ?? 0).toLocaleString()} tokens`}
              subs={[{ text: `约省 ¥${formatCost(stats?.cacheSavedCost ?? 0)}`, accent: true }]}
            />
            {isOfficialBalanceAvailable ? null : (
              <MetricCard
                label="预估总花费"
                value={`¥${formatCost(stats?.totalCost ?? 0)}`}
                subs={[{ text: '按标准定价估算' }]}
              />
            )}
            <MetricCard
              label="滚动 1 秒峰值"
              value={stats?.peakTps ? `${stats.peakTps} tok/s` : '暂无数据'}
              subs={[{ text: '仅统计有效流式样本' }]}
            />
          </div>

          <div className={css.noticeBox}>
            <span className={css.noticeIcon} aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            已开启全模型通用 Token 审计：即使使用无余额接口的第三方/本地模型，系统也将持续精确记录 Token 消耗、缓存命中与预估成本。
          </div>

          {state.error ? (
            <div className={css.errorBanner} role="alert">
              官方余额查询提示: {state.error}（本地 Token 统计与热力图仍正常运作）
            </div>
          ) : null}
        </section>

        {/* GitHub-style Activity Heatmap */}
        {stats?.heatmap && stats.heatmap.length > 0 && (
          <TokenHeatmap data={stats.heatmap} />
        )}

        {/* 30-Day Trends & Model Breakdown Grid */}
        <div className={css.chartsGrid}>
          {stats?.recentDays && stats.recentDays.length > 0 && (
            <UsageTrendChart records={stats.recentDays} />
          )}
          {stats?.models && stats.models.length > 0 && (
            <ModelBreakdownChart models={stats.models} />
          )}
        </div>
      </div>
    </div>
  )
}
