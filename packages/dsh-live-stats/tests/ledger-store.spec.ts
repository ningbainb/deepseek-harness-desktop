import { describe, expect, it } from 'vitest'
import { LedgerStore } from '../src/ledger-store.ts'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unlinkSync, existsSync } from 'node:fs'

describe('LedgerStore', () => {
  it('records usage, aggregates totals, models, and calculates 52-week heatmap', () => {
    const tempFile = join(tmpdir(), `test-ledger-${Date.now()}.json`)
    if (existsSync(tempFile)) unlinkSync(tempFile)

    const store = new LedgerStore({ filePath: tempFile })

    // Record some token usage: 2000 in + 500 out + 1000 cache = 3500
    store.recordUsage({
      model: 'DeepSeek-V4-Flash',
      inputTokens: 2000,
      outputTokens: 500,
      cacheReadTokens: 1000,
      tps: 45.2,
      timestamp: Date.now(),
    })

    // Record second usage: 1000 in + 800 out + 500 cache = 2300
    store.recordUsage({
      model: 'DeepSeek-Reasoner',
      inputTokens: 1000,
      outputTokens: 800,
      cacheReadTokens: 500,
      tps: 52.8,
      timestamp: Date.now(),
    })

    const summary = store.getSummary()

    expect(summary.todayTokens).toBe(5800)
    expect(summary.todayTurns).toBe(2)
    expect(summary.totalTokens).toBe(5800)
    expect(summary.peakTps).toBe(52.8)
    expect(summary.models).toHaveLength(2)
    expect(summary.heatmap).toHaveLength(364)
    expect(summary.recentDays).toHaveLength(30)

    // Verify heatmap has level for today
    const today = summary.heatmap[summary.heatmap.length - 1]
    expect(today.count).toBe(5800)
    expect(today.level).toBeGreaterThan(0)

    if (existsSync(tempFile)) unlinkSync(tempFile)
  })
})
