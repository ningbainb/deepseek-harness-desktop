import { describe, expect, it } from 'vitest'
import {
  estimateTokenCost,
  resolvePricePeriod,
  resolvePricingConfig,
  type TokenUsageBuckets,
} from '../src/pricing.ts'

const buckets = (overrides: Partial<TokenUsageBuckets> = {}): TokenUsageBuckets => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...overrides,
})

describe('live-stats pricing', () => {
  it('resolves DeepSeek peak and off-peak windows in Beijing time', () => {
    expect(resolvePricePeriod(new Date('2026-08-26T01:00:00.000Z'), 'auto')).toBe('peak')
    expect(resolvePricePeriod(new Date('2026-08-26T04:00:00.000Z'), 'auto')).toBe('offpeak')
    expect(resolvePricePeriod(new Date('2026-08-26T06:00:00.000Z'), 'auto')).toBe('peak')
    expect(resolvePricePeriod(new Date('2026-08-26T10:00:00.000Z'), 'auto')).toBe('offpeak')
    expect(resolvePricePeriod(new Date('2026-08-26T04:00:00.000Z'), 'peak')).toBe('peak')
    expect(resolvePricePeriod(new Date('2026-08-26T01:00:00.000Z'), 'offpeak')).toBe('offpeak')
  })

  it('prices uncached input, cache writes, cache reads, and output per million tokens', () => {
    const spec = resolvePricingConfig({ priceMode: 'offpeak' })
    const estimate = estimateTokenCost(
      buckets({
        uncachedInputTokens: 1_000_000,
        cacheWriteTokens: 500_000,
        cacheReadTokens: 2_000_000,
        outputTokens: 3_000_000,
      }),
      spec,
      new Date('2026-08-26T04:00:00.000Z'),
    )
    expect(estimate.period).toBe('offpeak')
    expect(estimate.amount).toBeCloseTo(15.85, 8)
  })

  it('uses the configured period and keeps empty usage at zero', () => {
    const spec = resolvePricingConfig({ priceMode: 'peak' })
    const estimate = estimateTokenCost(buckets(), spec, new Date('2026-08-26T04:00:00.000Z'))
    expect(estimate).toEqual({ amount: 0, period: 'peak' })
  })

  it('rejects an unknown price mode', () => {
    expect(() => resolvePricingConfig({ priceMode: 'broken' as never })).toThrow('priceMode')
  })
})
