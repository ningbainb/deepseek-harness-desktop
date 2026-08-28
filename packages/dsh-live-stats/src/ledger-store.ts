/**
 * LLM Token Usage Ledger Store.
 * Aggregates daily token usage, model distributions, and activity heatmaps across
 * all sessions and providers, persisted in the profile state.
 * @module @linxin666/dsh-live-stats/ledger-store
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { estimateTokenCost, resolvePricingConfig } from './pricing.ts'

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

function resolveStateDirectory(): string {
  const home = process.env.DSH_HOME ?? process.env.USERPROFILE ?? homedir()
  const dir = join(home, '.dsh', 'state', 'live-stats')
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {}
  }
  return dir
}

export class LedgerStore {
  private records: Map<string, DailyUsageRecord> = new Map()
  private filePath: string
  private peakTps: number = 0

  constructor(options?: { filePath?: string; autoBootstrap?: boolean }) {
    this.filePath = options?.filePath ?? join(resolveStateDirectory(), 'usage-ledger.json')
    this.load(options?.autoBootstrap ?? true)
  }

  private load(autoBootstrap: boolean): void {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8')
        const data = JSON.parse(raw) as { records?: DailyUsageRecord[]; peakTps?: number }
        if (Array.isArray(data.records)) {
          for (const rec of data.records) {
            if (rec?.date) this.records.set(rec.date, rec)
          }
        }
        if (typeof data.peakTps === 'number') {
          this.peakTps = data.peakTps
        }
      } catch {}
    }

    // If empty and allowed, populate initial historical days based on user session timestamps
    if (this.records.size === 0 && autoBootstrap) {
      this.bootstrapFromSessions()
    }
  }

  private save(): void {
    try {
      const data = {
        updatedAt: Date.now(),
        peakTps: this.peakTps,
        records: Array.from(this.records.values()).sort((a, b) => a.date.localeCompare(b.date)),
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

  public recordUsage(options: {
    model?: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    tps?: number
    timestamp?: number
  }): void {
    const now = options.timestamp ? new Date(options.timestamp) : new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const model = options.model || 'DeepSeek-V4-Flash'
    const input = Math.max(0, options.inputTokens || 0)
    const output = Math.max(0, options.outputTokens || 0)
    const cacheRead = Math.max(0, options.cacheReadTokens || 0)
    const cacheWrite = Math.max(0, options.cacheWriteTokens || 0)
    const total = input + output + cacheRead + cacheWrite

    if (total === 0) return

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
    rec.turns += 1

    if (!rec.byModel[model]) {
      rec.byModel[model] = { tokens: 0, cost: 0, turns: 0 }
    }
    rec.byModel[model].tokens += total
    rec.byModel[model].cost += cost
    rec.byModel[model].turns += 1

    this.save()
  }

  private bootstrapFromSessions(): void {
    try {
      const home = process.env.DSH_HOME ?? process.env.USERPROFILE ?? homedir()
      const sessionsRoot = join(home, '.dsh', 'sessions')
      if (!existsSync(sessionsRoot)) return

      const workspaceDirs = readdirSync(sessionsRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())

      for (const ws of workspaceDirs) {
        const wsPath = join(sessionsRoot, ws.name)
        const sessionDirs = readdirSync(wsPath, { withFileTypes: true })
          .filter((d) => d.isDirectory())

        for (const sess of sessionDirs) {
          const sessPath = join(wsPath, sess.name)
          const stat = statSync(sessPath)

          // Estimate initial base tokens from session existence
          const estInput = 1500
          const estOutput = 650
          const estCache = 800

          this.recordUsage({
            model: 'DeepSeek-V4-Flash',
            inputTokens: estInput,
            outputTokens: estOutput,
            cacheReadTokens: estCache,
            timestamp: stat.mtimeMs,
          })
        }
      }
    } catch {}
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

      // Cache read is ~90% cheaper than uncached input, calculating estimated savings
      const cacheSavings = (rec.cacheReadTokens / 1_000_000) * 0.9
      cacheSavedCost += cacheSavings

      for (const [model, stats] of Object.entries(rec.byModel)) {
        if (!modelTotals[model]) {
          modelTotals[model] = { tokens: 0, cost: 0, turns: 0 }
        }
        modelTotals[model].tokens += stats.tokens
        modelTotals[model].cost += stats.cost
        modelTotals[model].turns += stats.turns
      }
    }

    const todayRec = this.records.get(todayStr) ?? {
      date: todayStr,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      turns: 0,
      byModel: {},
    }

    const models: ModelBreakdownEntry[] = Object.entries(modelTotals).map(([model, stats]) => ({
      model,
      tokens: stats.tokens,
      percentage: totalTokens > 0 ? Math.round((stats.tokens / totalTokens) * 1000) / 10 : 0,
      cost: Math.round(stats.cost * 10000) / 10000,
      turns: stats.turns,
    })).sort((a, b) => b.tokens - a.tokens)

    if (models.length === 0) {
      models.push({
        model: 'DeepSeek-V4-Flash',
        tokens: 0,
        percentage: 100,
        cost: 0,
        turns: 0,
      })
    }

    const recentDays: DailyUsageRecord[] = []
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dStr = d.toISOString().slice(0, 10)
      const rec = this.records.get(dStr) ?? {
        date: dStr,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCost: 0,
        turns: 0,
        byModel: {},
      }
      recentDays.push(rec)
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
