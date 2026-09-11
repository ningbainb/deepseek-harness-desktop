/**
 * Balance Controller for managing LLM balance state, activity heatmaps, and token stats.
 */

import type { UsageStatsSummary } from '../ledger-store.ts'
import type { BalanceSelection, ModelBalanceResponse } from '../balance-service.ts'

export interface BalanceState {
  open: boolean
  loading: boolean
  totalBalance: string
  toppedUpBalance: string
  grantedBalance: string
  currency: string
  modelName: string
  provider: string
  source?: ModelBalanceResponse['source']
  stats?: UsageStatsSummary
  error?: string
  lastUpdated: number
}

export type BalanceListener = (state: BalanceState) => void

export class BalanceController {
  private selection: BalanceSelection | null | undefined
  private generation = 0
  private request?: AbortController
  private disposed = false
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

  /** null waits for the native model projection; undefined follows the host default. */
  public setSelection(selection: BalanceSelection | null | undefined): void {
    if (JSON.stringify(this.selection) === JSON.stringify(selection)) return
    this.selection = selection
    this.generation++
    this.request?.abort()
    this.state = { ...this.state, totalBalance: '--', toppedUpBalance: '--', grantedBalance: '--', currency: '', source: undefined,
      modelName: selection?.model ?? '', provider: selection?.provider ?? '', error: undefined, loading: true }
    this.notify()
    if (selection !== null) void this.fetchBalance()
  }

  public dispose(): void { this.disposed = true; this.generation++; this.request?.abort(); this.listeners.clear() }

  public async fetchBalance(forceRefresh = false): Promise<void> {
    if (this.disposed) return
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    const generation = ++this.generation
    const timeout = setTimeout(() => request.abort(), 12_000)
    this.state = { ...this.state, loading: true, error: undefined }
    this.notify()

    try {
      const params = new URLSearchParams(forceRefresh ? { force: '1' } : {})
      if (this.selection) { params.set('provider', this.selection.provider); params.set('model', this.selection.model) }
      const balanceUrl = '/api/live-stats/balance' + (params.size ? '?' + params : '')
      const statsUrl = '/api/live-stats/stats'

      const [balanceRes, statsRes] = await Promise.allSettled([
        this.selection === null ? Promise.resolve(undefined) : fetch(balanceUrl, { signal: request.signal, headers: { 'Accept': 'application/json' } }),
        fetch(statsUrl, { signal: request.signal, headers: { 'Accept': 'application/json' } }),
      ])

      let nextState: Partial<BalanceState> = {
        loading: false,
        lastUpdated: Date.now(),
        totalBalance: '--',
        toppedUpBalance: '--',
        grantedBalance: '--',
        currency: '',
        source: undefined,
      }

      if (balanceRes.status === 'fulfilled' && balanceRes.value?.ok) {
        const data = (await balanceRes.value.json().catch(() => ({})) ?? {}) as {
          totalBalance?: string
          toppedUpBalance?: string
          grantedBalance?: string
          currency?: string
          modelName?: string
          provider?: string
          error?: string
          source?: ModelBalanceResponse['source']
        }
        nextState = {
          ...nextState,
          totalBalance: data.totalBalance ?? '--',
          toppedUpBalance: data.toppedUpBalance ?? '--',
          grantedBalance: data.grantedBalance ?? '--',
          currency: data.currency ?? '',
          modelName: data.modelName ?? this.state.modelName,
          provider: data.provider ?? this.state.provider,
          source: data.source,
          error: data.error ?? (typeof data.totalBalance === 'string' ? undefined : '余额查询暂时不可用，请稍后重试'),
        }
      } else if (balanceRes.status === 'fulfilled' && balanceRes.value) {
        const errJson = (await balanceRes.value.json().catch(() => ({})) ?? {}) as { error?: string }
        nextState.error = errJson.error || `HTTP ${balanceRes.value.status}`
        nextState.totalBalance = '--'
      } else if (balanceRes.status === 'rejected') {
        nextState.error = '余额查询暂时不可用，请稍后重试'
        nextState.totalBalance = '--'
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const statsData = (await statsRes.value.json().catch(() => ({})) ?? {}) as {
          stats?: UsageStatsSummary
        }
        if (statsData.stats) {
          nextState.stats = statsData.stats
        }
      }

      if (generation !== this.generation || this.disposed) return
      this.state = { ...this.state, ...nextState }
      this.notify()
    } catch {
      if (generation !== this.generation || this.disposed) return
      this.state = { ...this.state, loading: false, totalBalance: '--', toppedUpBalance: '--', grantedBalance: '--', currency: '', source: undefined,
        error: '余额查询暂时不可用，请稍后重试', lastUpdated: Date.now() }
      this.notify()
    } finally { clearTimeout(timeout) }
  }
}

export const globalBalanceController = new BalanceController()
