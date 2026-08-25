/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
import {
  TpsLine,
  UsageCostLine,
  formatCompactTokens,
  formatEstimatedCost,
  formatTokensPerSecond,
} from '../src/client/TpsLine.tsx'

afterEach(cleanup)

describe('TPS composer line', () => {
  it('formats stable compact rates', () => {
    expect(formatTokensPerSecond(42.64)).toBe('42.6')
    expect(formatTokensPerSecond(142.64)).toBe('143')
  })

  it('formats token counts and currency values compactly', () => {
    expect(formatCompactTokens(1_230_000)).toBe('1.23M')
    expect(formatCompactTokens(345_000)).toBe('345K')
    expect(formatEstimatedCost(0.42)).toBe('¥0.42')
  })

  it('renders only after an elapsed output sample exists', () => {
    const absent = ((key: string): unknown => key === 'liveTokenUsage'
      ? { estimated: true, uncachedInputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }
      : undefined) as UseProjection
    const view = render(<TpsLine useProjection={absent} />)
    expect(view.container.textContent).toBe('')

    const live = ((key: string): unknown => key === 'liveTokenUsage'
      ? {
        estimated: true,
        uncachedInputTokens: 10,
        outputTokens: 8,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        tokensPerSecond: 42.64,
      }
      : undefined) as UseProjection
    view.rerender(<TpsLine useProjection={live} />)
    expect(view.container.textContent).toBe('TPS 42.6 tok/s')
  })

  it('renders token buckets and the current estimated cost', () => {
    const view = render(
      <UsageCostLine
        projection={{
          uncachedInputTokens: 1_000_000,
          outputTokens: 345_000,
          cacheReadTokens: 230_000,
          cacheWriteTokens: 0,
          estimatedCost: 0.42,
          costCurrency: 'CNY',
        }}
      />,
    )
    expect(view.container.textContent).toBe('API ↑1.23M ↓345K · ≈¥0.42')
  })
})
