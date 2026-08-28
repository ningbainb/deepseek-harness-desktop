/**
 * Balance Controller for managing LLM balance state, activity heatmaps, and token stats.
 */

import type { UsageStatsSummary } from '../ledger-store.ts'

export interface BalanceState {
  open: boolean
  loading: boolean
  totalBalance: string
  toppedUpBalance: string
  grantedBalance: string
  currency: string
  modelName: string
  provider: string
  stats?: UsageStatsSummary
  error?: string
  lastUpdated: number
}

export type BalanceListener = (state: BalanceState) => void

export class BalanceController {
  private state: BalanceState = {
    open: false,
    loading: true,
    totalBalance: '--',
    toppedUpBalance: '--',
    grantedBalance: '--',
    currency: 'CNY',
    modelName: 'DeepSeek',
    provider: 'deepseek-official',
    lastUpdated: Date.now(),
  }

  private listeners = new Set<BalanceListener>()

  public getSnapshot(): BalanceState {
    return this.state
  }

  public subscribe(listener: BalanceListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  public setOpen(open: boolean): void {
    if (this.state.open === open) return
    this.state = { ...this.state, open }
    this.notify()
    if (open) {
      void this.fetchBalance()
    }
  }

  public toggleOpen(): void {
    this.setOpen(!this.state.open)
  }

  public async fetchBalance(forceRefresh = false): Promise<void> {
    this.state = { ...this.state, loading: true, error: undefined }
    this.notify()

    try {
      const balanceUrl = forceRefresh ? '/api/live-stats/balance?force=1' : '/api/live-stats/balance'
      const statsUrl = '/api/live-stats/stats'

      const [balanceRes, statsRes] = await Promise.allSettled([
        fetch(balanceUrl, { headers: { 'Accept': 'application/json' } }),
        fetch(statsUrl, { headers: { 'Accept': 'application/json' } }),
      ])

      let nextState: Partial<BalanceState> = {
        loading: false,
        lastUpdated: Date.now(),
      }

      if (balanceRes.status === 'fulfilled' && balanceRes.value.ok) {
        const data = await balanceRes.value.json().catch(() => ({})) as {
          totalBalance?: string
          toppedUpBalance?: string
          grantedBalance?: string
          currency?: string
          modelName?: string
          provider?: string
          error?: string
        }
        nextState = {
          ...nextState,
          totalBalance: data.totalBalance ?? this.state.totalBalance,
          toppedUpBalance: data.toppedUpBalance ?? this.state.toppedUpBalance,
          grantedBalance: data.grantedBalance ?? this.state.grantedBalance,
          currency: data.currency ?? this.state.currency,
          modelName: data.modelName ?? this.state.modelName,
          provider: data.provider ?? this.state.provider,
          error: data.error,
        }
      } else if (balanceRes.status === 'fulfilled') {
        const errJson = await balanceRes.value.json().catch(() => ({})) as { error?: string }
        nextState.error = errJson.error || `HTTP ${balanceRes.value.status}`
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const statsData = await statsRes.value.json().catch(() => ({})) as {
          stats?: UsageStatsSummary
        }
        if (statsData.stats) {
          nextState.stats = statsData.stats
        }
      }

      this.state = { ...this.state, ...nextState }
      this.notify()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.state = { ...this.state, loading: false, error: msg, lastUpdated: Date.now() }
      this.notify()
    }
  }
}

export const globalBalanceController = new BalanceController()
