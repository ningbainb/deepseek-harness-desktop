import { describe, expect, it } from 'vitest'
import { LedgerStore } from '../src/ledger-store.ts'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'node:fs'

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

  it('ignores legacy average-rate peaks and persists the rolling metric version', () => {
    const tempFile = join(tmpdir(), `test-legacy-ledger-${Date.now()}.json`)
    const legacyRecord = {
      date: '2026-08-30',
      totalTokens: 7,
      inputTokens: 4,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0.1,
      turns: 1,
      cacheSavedCost: 0,
      byModel: { legacy: { tokens: 7, cost: 0.1, turns: 1 } },
    }
    writeFileSync(tempFile, JSON.stringify({
      updatedAt: Date.now(),
      peakTps: 12_625,
      records: [legacyRecord],
      steps: [],
    }), 'utf-8')

    const store = new LedgerStore({ filePath: tempFile })
    expect(store.getSummary().peakTps).toBe(0)
    expect(store.getSummary().totalTokens).toBe(7)

    expect(store.recordUsage({
      model: 'new-model',
      inputTokens: 1,
      outputTokens: 1,
      peakTps: 12.4,
      timestamp: Date.now(),
    })).toBe(true)
    expect(store.getSummary().peakTps).toBe(12.4)

    const persisted = JSON.parse(readFileSync(tempFile, 'utf-8')) as { peakTpsVersion?: number }
    expect(persisted.peakTpsVersion).toBe(2)
    expect(new LedgerStore({ filePath: tempFile }).getSummary().peakTps).toBe(12.4)

    if (existsSync(tempFile)) unlinkSync(tempFile)
  })
})
