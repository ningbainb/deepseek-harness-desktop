/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import { en } from '../src/client/locales.ts'
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

  it('does not invent a throughput reading before an elapsed output sample exists', () => {
    const absent = ((key: string): unknown => key === 'liveTokenUsage'
      ? { estimated: true, uncachedInputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }
      : undefined) as UseProjection
    const view = render(<TpsLine useProjection={absent} />)
    expect(view.container.querySelector('summary')?.textContent).toBe('实时估算 · 明细')
    expect(view.container.textContent).not.toContain('tok/s')

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
    expect(view.container.querySelector('summary')?.textContent).toBe('实时估算 · 明细')
    expect(view.container.querySelector('details')?.open).toBe(false)
    expect(view.container.textContent).toContain('滚动 1 秒42.6 tok/s')
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

  it('keeps the primary row cost-only while preserving distinct rolling and peak measurements', () => {
    const useProjection = (() => ({
      estimated: true, uncachedInputTokens: 100, cacheReadTokens: 200,
      cacheWriteTokens: 0, outputTokens: 40, estimatedCost: 0.42,
      tokensPerSecond: 20, peakTokensPerSecond: 50,
    })) as UseProjection
    const view = render(<TpsLine useProjection={useProjection} />)
    expect(view.container.querySelector('summary')?.textContent).toBe('≈¥0.42 · 明细')
    expect(view.container.querySelectorAll('details')).toHaveLength(1)
    expect(view.container.querySelector('details')?.open).toBe(false)
    expect(view.container.textContent).toContain('API 输入~300')
    expect(view.container.textContent).toContain('API 输出~40')
    expect(view.container.textContent).toContain('滚动 1 秒20 tok/s')
    expect(view.container.textContent).toContain('步骤峰值50 tok/s')
    expect(view.container.textContent).toContain('不是原生会话平均速度')
  })

  it('keeps unknown cost unknown and preserves live estimates when cost display is off', () => {
    const state = { estimated: false, uncachedInputTokens: 100, outputTokens: 20,
      cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCost: undefined as number | undefined }
    const useProjection = (() => state) as UseProjection
    const view = render(<TpsLine useProjection={useProjection} t={key => en[key]} />)
    expect(view.container.querySelector('summary')?.textContent).toBe('Live estimates · Details')
    expect(view.container.textContent).toContain('API input100')
    expect(view.container.textContent).not.toContain('¥')
    state.estimatedCost = Number.NaN
    view.rerender(<TpsLine useProjection={(() => ({ ...state })) as UseProjection} />)
    expect(view.container.textContent).not.toContain('¥')
  })

  it('removes the supplement on empty sessions and never presents invalid rates as real measurements', () => {
    const empty = { estimated: true, uncachedInputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCost: 0 }
    const view = render(<TpsLine useProjection={(() => empty) as UseProjection} />)
    expect(view.container.textContent).toBe('')
    view.rerender(<TpsLine useProjection={(() => ({ ...empty, outputTokens: 5,
      tokensPerSecond: Number.POSITIVE_INFINITY, peakTokensPerSecond: -1 })) as UseProjection} />)
    expect(view.container.querySelector('summary')?.textContent).toBe('≈¥0.00 · 明细')
    expect(view.container.textContent).not.toContain('tok/s')
    view.rerender(<TpsLine useProjection={(() => undefined) as UseProjection} />)
    expect(view.container.textContent).toBe('')
  })

  it('opens a hover preview with cache breakdown without shifting pinned state, and toggles pin on click', () => {
    vi.useFakeTimers()
    try {
      const useProjection = (() => ({
        estimated: true, uncachedInputTokens: 200, cacheReadTokens: 700,
        cacheWriteTokens: 100, outputTokens: 50, estimatedCost: 0.42,
      })) as UseProjection
      const view = render(<TpsLine useProjection={useProjection} />)
      const details = view.container.querySelector('details') as HTMLDetailsElement
      const summary = view.container.querySelector('summary') as HTMLElement

      expect(details.open).toBe(false)
      expect(view.container.textContent).toContain('缓存命中~700 (70%)')
      expect(view.container.textContent).toContain('缓存写入~100')

      fireEvent.mouseEnter(details)
      expect(details.open).toBe(true)
      expect(details.dataset.preview).toBe('hover')

      fireEvent.mouseLeave(details)
      act(() => { vi.advanceTimersByTime(150) })
      expect(details.open).toBe(false)
      expect(details.dataset.preview).toBeUndefined()

      fireEvent.click(summary)
      expect(details.open).toBe(true)
      expect(details.dataset.preview).toBeUndefined()

      fireEvent.click(summary)
      expect(details.open).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows nbfast token and batch file savings inside the opened details panel when available', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (String(input).includes('/api/dsh-fast-ops/state')) {
        return {
          ok: true,
          json: async () => ({
            counters: { denoiseTokensSaved: 3_200, spillTokensSaved: 1_800, filesReadInBatches: 14 },
          }),
        }
      }
      return { ok: false }
    }))
    try {
      const useProjection = (() => ({
        estimated: true, uncachedInputTokens: 100, cacheReadTokens: 0,
        cacheWriteTokens: 0, outputTokens: 20, estimatedCost: 0.1,
      })) as UseProjection
      const view = render(<TpsLine useProjection={useProjection} />)
      const summary = view.container.querySelector('summary') as HTMLElement
      fireEvent.click(summary)
      await vi.waitFor(() => {
        expect(view.container.textContent).toContain('nbfast 省流~5K tok · 14 文件')
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
