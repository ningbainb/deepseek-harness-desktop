import { describe, expect, it } from 'vitest'

import { formatBalanceAmount, formatCost, formatTokens } from '../src/client/format.ts'

describe('formatTokens', () => {
  it('keeps small counts as locale strings', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(9500)).toBe('9,500')
  })

  it('compacts to 万 with at most one decimal', () => {
    expect(formatTokens(10_000)).toBe('1万')
    expect(formatTokens(12_345)).toBe('1.2万')
    expect(formatTokens(1_234_567)).toBe('123.5万')
  })

  it('compacts to 亿 above 1e8', () => {
    expect(formatTokens(100_000_000)).toBe('1亿')
    expect(formatTokens(234_000_000)).toBe('2.3亿')
  })

  it('guards non-finite and negative input', () => {
    expect(formatTokens(Number.NaN)).toBe('0')
    expect(formatTokens(-5)).toBe('0')
  })
})

describe('formatCost', () => {
  it('uses two decimals at or above 1', () => {
    expect(formatCost(12.345)).toBe('12.35')
    expect(formatCost(3)).toBe('3.00')
  })

  it('keeps up to four decimals below 1, trimming zeros', () => {
    expect(formatCost(0.0123)).toBe('0.0123')
    expect(formatCost(0.5)).toBe('0.5')
    expect(formatCost(0.01)).toBe('0.01')
  })

  it('marks sub-0.0001 dust instead of printing 0.0000', () => {
    expect(formatCost(0.00001)).toBe('<0.0001')
    expect(formatCost(0)).toBe('0')
  })
})

describe('formatBalanceAmount', () => {
  it('pairs well-known currency codes with their symbol', () => {
    expect(formatBalanceAmount('12.50', 'CNY')).toBe('¥12.50')
    expect(formatBalanceAmount('12.50', 'USD')).toBe('$12.50')
    expect(formatBalanceAmount('12.50', 'EUR')).toBe('12.50 EUR')
  })

  it('passes through the unavailable placeholder', () => {
    expect(formatBalanceAmount('--', 'CNY')).toBe('--')
  })
})
