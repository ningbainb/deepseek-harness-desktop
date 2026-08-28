/**
 * LLM Token Usage Ledger Store.
 * Aggregates daily token usage, model distributions, and activity heatmaps across
 * all sessions and providers, persisted in the profile state.
 * @module @linxin666/dsh-live-stats/ledger-store
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { estimateTokenCost, resolvePricePeriod, resolvePricingConfig } from './pricing.ts'

export interface ModelUsageStats {
  tokens: number
  cost: number
  turns: number
}

export interface DailyUsageRecord {
  date: string // YYYY-MM-DD
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  turns: number
  /** Savings from cache reads priced against uncached input at record time. */
  cacheSavedCost: number
  byModel: Record<string, ModelUsageStats>
}

export interface HeatmapDay {
  date: string // YYYY-MM-DD
  count: number // total tokens
  level: number // 0: 0, 1: 1-1000, 2: 1001-10000, 3: 10001-50000, 4: >50000
  cost: number
  turns: number
}

export interface ModelBreakdownEntry {
  model: string
  tokens: number
  percentage: number
  cost: number
  turns: number
}

export interface UsageStatsSummary {
  todayTokens: number
  todayCost: number
  todayTurns: number
  totalTokens: number
  totalCost: number
  totalTurns: number
  cacheSavedTokens: number
  cacheSavedCost: number
  peakTps: number
  models: ModelBreakdownEntry[]
  recentDays: DailyUsageRecord[]
  heatmap: HeatmapDay[]
}

export interface RecordUsageOptions {
  model?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  tps?: number
  timestamp?: number
  /**
   * Durable dedupe key (e.g. `sessionId:turn:step`). The projection replays
   * session events on every cold load; the key keeps a settled step from
   * being recorded twice across restarts.
   */
  dedupeKey?: string
}

/** Bound the persisted dedupe table so the ledger file stays small. */
const MAX_DEDUPE_KEYS = 5_000

function resolveStateDirectory(): string {
  // DSH_HOME already IS the dsh home (the desktop host sets it to ~/.dsh);
  // only fall back to <user-home>/.dsh when it is unset.
  const base = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? homedir(), '.dsh')
  const dir = join(base, 'state', 'live-stats')
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {}
  }
  return dir
}

export class LedgerStore {
  private records: Map<string, DailyUsageRecord> = new Map()
  private dedupeKeys: string[] = []
  private dedupeSet: Set<string> = new Set()
  private filePath: string
  private peakTps: number = 0

  constructor(options?: { filePath?: string }) {
    this.filePath = options?.filePath ?? join(resolveStateDirectory(), 'usage-ledger.json')
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as {
        records?: DailyUsageRecord[]
        peakTps?: number
        steps?: string[]
      }
      if (Array.isArray(data.records)) {
        for (const rec of data.records) {
          if (rec?.date) this.records.set(rec.date, { ...rec, cacheSavedCost: rec.cacheSavedCost ?? 0 })
        }
      }
      if (typeof data.peakTps === 'number') {
        this.peakTps = data.peakTps
      }
      if (Array.isArray(data.steps)) {
        this.dedupeKeys = data.steps.filter((key): key is string => typeof key === 'string')
        this.dedupeSet = new Set(this.dedupeKeys)
      }
    } catch {}
  }

  private save(): void {
    try {
      const data = {
        updatedAt: Date.now(),
        peakTps: this.peakTps,
        records: Array.from(this.records.values()).sort((a, b) => a.date.localeCompare(b.date)),
        steps: this.dedupeKeys,
      }
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch {}
  }

  public recordTps(tps: number): void {
    if (tps > this.peakTps) {
      this.peakTps = Math.round(tps * 10) / 10
      this.save()
    }
  }

  /** @returns true when the sample was recorded, false when skipped (zero total or duplicate). */
  public recordUsage(options: RecordUsageOptions): boolean {
    if (options.dedupeKey !== undefined && this.dedupeSet.has(options.dedupeKey)) return false

    const now = options.timestamp ? new Date(options.timestamp) : new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const model = options.model || 'unknown'
    const input = Math.max(0, options.inputTokens || 0)
    const output = Math.max(0, options.outputTokens || 0)
    const cacheRead = Math.max(0, options.cacheReadTokens || 0)
    const cacheWrite = Math.max(0, options.cacheWriteTokens || 0)
    const total = input + output + cacheRead + cacheWrite

    if (total === 0) return false

    if (options.tps && options.tps > this.peakTps) {
      this.peakTps = Math.round(options.tps * 10) / 10
    }

    const pricingSpec = resolvePricingConfig()
    const costEstimate = estimateTokenCost({
      uncachedInputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    }, pricingSpec, now)
    const cost = costEstimate?.amount ?? 0
    // Cache reads would otherwise be billed as uncached input; the spread
    // between the two rates at this period is the real saving.
    const rates = pricingSpec[resolvePricePeriod(now, pricingSpec.priceMode)]
    const cacheSaved = cacheRead * Math.max(0, rates.inputPerMillion - rates.cacheReadPerMillion) / 1_000_000

    let rec = this.records.get(dateStr)
    if (!rec) {
      rec = {
        date: dateStr,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCost: 0,
        turns: 0,
        cacheSavedCost: 0,
        byModel: {},
      }
      this.records.set(dateStr, rec)
    }

    rec.totalTokens += total
    rec.inputTokens += input
    rec.outputTokens += output
    rec.cacheReadTokens += cacheRead
    rec.cacheWriteTokens += cacheWrite
    rec.estimatedCost += cost
    rec.cacheSavedCost += cacheSaved
    rec.turns += 1

    if (!rec.byModel[model]) {
      rec.byModel[model] = { tokens: 0, cost: 0, turns: 0 }
    }
    rec.byModel[model].tokens += total
    rec.byModel[model].cost += cost
    rec.byModel[model].turns += 1

    if (options.dedupeKey !== undefined) {
      this.dedupeSet.add(options.dedupeKey)
      this.dedupeKeys.push(options.dedupeKey)
      if (this.dedupeKeys.length > MAX_DEDUPE_KEYS) {
        const dropped = this.dedupeKeys.splice(0, this.dedupeKeys.length - MAX_DEDUPE_KEYS)
        for (const key of dropped) this.dedupeSet.delete(key)
      }
    }

    this.save()
    return true
  }

  public getSummary(): UsageStatsSummary {
    const todayStr = new Date().toISOString().slice(0, 10)
    let totalTokens = 0
    let totalCost = 0
    let totalTurns = 0
    let cacheSavedTokens = 0
    let cacheSavedCost = 0

    const modelTotals: Record<string, { tokens: number; cost: number; turns: number }> = {}

    for (const rec of this.records.values()) {
      totalTokens += rec.totalTokens
      totalCost += rec.estimatedCost
      totalTurns += rec.turns
      cacheSavedTokens += rec.cacheReadTokens
      cacheSavedCost += rec.cacheSavedCost

      for (const [model, stats] of Object.entries(rec.byModel)) {
        if (!modelTotals[model]) {
          modelTotals[model] = { tokens: 0, cost: 0, turns: 0 }
        }
        modelTotals[model].tokens += stats.tokens
        modelTotals[model].cost += stats.cost
        modelTotals[model].turns += stats.turns
      }
    }

    const emptyDay = (date: string): DailyUsageRecord => ({
      date,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      turns: 0,
      cacheSavedCost: 0,
      byModel: {},
    })

    const todayRec = this.records.get(todayStr) ?? emptyDay(todayStr)

    const models: ModelBreakdownEntry[] = Object.entries(modelTotals).map(([model, stats]) => ({
      model,
      tokens: stats.tokens,
      percentage: totalTokens > 0 ? Math.round((stats.tokens / totalTokens) * 1000) / 10 : 0,
      cost: Math.round(stats.cost * 10000) / 10000,
      turns: stats.turns,
    })).sort((a, b) => b.tokens - a.tokens)

    const recentDays: DailyUsageRecord[] = []
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dStr = d.toISOString().slice(0, 10)
      recentDays.push(this.records.get(dStr) ?? emptyDay(dStr))
    }

    // 52-week (364 days) GitHub-style heatmap dataset
    const heatmap: HeatmapDay[] = []
    for (let i = 363; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dStr = d.toISOString().slice(0, 10)
      const rec = this.records.get(dStr)
      const count = rec?.totalTokens ?? 0
      let level = 0
      if (count > 50000) level = 4
      else if (count > 10000) level = 3
      else if (count > 1000) level = 2
      else if (count > 0) level = 1

      heatmap.push({
        date: dStr,
        count,
        level,
        cost: rec ? Math.round(rec.estimatedCost * 10000) / 10000 : 0,
        turns: rec?.turns ?? 0,
      })
    }

    return {
      todayTokens: todayRec.totalTokens,
      todayCost: Math.round(todayRec.estimatedCost * 10000) / 10000,
      todayTurns: todayRec.turns,
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalTurns,
      cacheSavedTokens,
      cacheSavedCost: Math.round(cacheSavedCost * 10000) / 10000,
      peakTps: this.peakTps,
      models,
      recentDays,
      heatmap,
    }
  }
}
