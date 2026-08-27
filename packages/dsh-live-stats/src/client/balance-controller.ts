/**
 * Balance Controller for managing LLM balance state, sidebar badge, and center surface.
 */

export interface BalanceState {
  open: boolean
  loading: boolean
  totalBalance: string
  toppedUpBalance: string
  grantedBalance: string
  currency: string
  modelName: string
  provider: string
  error?: string
  lastUpdated: number
}

export type BalanceListener = (state: BalanceState) => void

export class BalanceController {
  private state: BalanceState = {
    open: false,
    loading: false,
    totalBalance: '49.19',
    toppedUpBalance: '49.19',
    grantedBalance: '0.00',
    currency: 'CNY',
    modelName: 'deepseek-v4-视觉模型 (modlens vision)High',
    provider: 'deepseek',
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
  }

  public toggleOpen(): void {
    this.setOpen(!this.state.open)
  }

  public async fetchBalance(forceRefresh = false): Promise<void> {
    this.state = { ...this.state, loading: true, error: undefined }
    this.notify()

    try {
      const url = forceRefresh ? '/api/live-stats/balance?force=1' : '/api/live-stats/balance'
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json() as {
        totalBalance?: string
        toppedUpBalance?: string
        grantedBalance?: string
        currency?: string
        modelName?: string
        provider?: string
        error?: string
      }

      this.state = {
        ...this.state,
        loading: false,
        totalBalance: data.totalBalance || this.state.totalBalance,
        toppedUpBalance: data.toppedUpBalance || this.state.toppedUpBalance,
        grantedBalance: data.grantedBalance || this.state.grantedBalance,
        currency: data.currency || 'CNY',
        modelName: data.modelName || this.state.modelName,
        provider: data.provider || this.state.provider,
        error: data.error,
        lastUpdated: Date.now(),
      }
    } catch {
      // Offline / fallback demo state
      this.state = {
        ...this.state,
        loading: false,
        lastUpdated: Date.now(),
      }
    } finally {
      this.notify()
    }
  }
}
