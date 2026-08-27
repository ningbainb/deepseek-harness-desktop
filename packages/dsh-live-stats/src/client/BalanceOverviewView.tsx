/**
 * LLM Balance & Usage Center Overview View.
 * Renders model name, providers, balance metric cards, notice, back and refresh actions.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { BalanceController, BalanceState } from './balance-controller.ts'
import css from './balance.module.css'

export interface BalanceOverviewViewProps {
  controller: BalanceController
  onClose?: () => void
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

  return (
    <div className={css.surfaceContainer} data-testid="llm-balance-overview">
      <header className={css.surfaceHeader}>
        <button
          type="button"
          className={css.backButton}
          onClick={handleBack}
          aria-label="返回对话"
        >
          ← 返回
        </button>
        <button
          type="button"
          className={css.refreshButton}
          onClick={handleRefresh}
          disabled={state.loading}
          aria-label="刷新余额"
        >
          {state.loading ? '正在刷新…' : '刷新'}
        </button>
      </header>

      <section className={css.modelCard}>
        <div className={css.modelTitleRow}>
          <h2 className={css.modelName}>{state.modelName}</h2>
          <span className={css.providerBadge}>当前模型 ({state.provider})</span>
        </div>

        <div className={css.metricsGrid}>
          <div className={css.metricCard}>
            <span className={css.metricValue}>{state.toppedUpBalance} {state.currency}</span>
            <span className={css.metricLabel}>充值余额</span>
          </div>
          <div className={css.metricCard}>
            <span className={css.metricValue}>{state.totalBalance} {state.currency}</span>
            <span className={css.metricLabel}>总余额</span>
          </div>
          <div className={css.metricCard}>
            <span className={css.metricValue}>{state.grantedBalance} {state.currency}</span>
            <span className={css.metricLabel}>赠送余额</span>
          </div>
        </div>

        <div className={css.noticeBox}>
          <span className={css.noticeIcon}>💡</span>
          余额由官方接口实时拉取；换用其它大模型时，需在其对应 provider 配置余额端点。刷新可更新。
        </div>

        {state.error ? (
          <div className={css.errorBanner} role="alert">
            {state.error}
          </div>
        ) : null}
      </section>
    </div>
  )
}
