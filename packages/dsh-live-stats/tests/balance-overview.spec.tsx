/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BalanceOverviewView } from '../src/client/BalanceOverviewView.tsx'
import { mountBalanceSidebarEntry } from '../src/client/balance-sidebar.ts'
import type { BalanceController, BalanceState } from '../src/client/balance-controller.ts'
import css from '../src/client/balance.module.css'

afterEach(cleanup)

function stubController(state: Partial<BalanceState> = {}): BalanceController {
  const snapshot: BalanceState = {
    open: true,
    loading: false,
    totalBalance: '--',
    toppedUpBalance: '--',
    grantedBalance: '--',
    currency: 'CNY',
    modelName: 'DeepSeek-V3.2',
    provider: 'deepseek-official',
    lastUpdated: 0,
    ...state,
  }
  return {
    getSnapshot: () => snapshot,
    // Match BalanceController.subscribe: the listener fires immediately.
    subscribe: (listener: (state: BalanceState) => void) => {
      listener(snapshot)
      return () => {}
    },
    fetchBalance: async () => {},
    setOpen: () => {},
    toggleOpen: () => {},
  } as unknown as BalanceController
}

// Repo rule: no emoji in UI copy (covers emoji ranges and variation selectors).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

describe('balance overview surface', () => {
  it('mounts the usage center and renders header chrome without emoji', () => {
    const view = render(<BalanceOverviewView controller={stubController()} />)
    expect(view.getByTestId('llm-balance-overview')).toBeTruthy()
    expect(view.container.textContent).toContain('大模型用量与数据分析中心')
    expect(view.container.textContent).toContain('刷新数据')
    expect(view.container.textContent ?? '').not.toMatch(EMOJI)
  })

  it('shows the error banner when official balance lookup fails', () => {
    const view = render(
      <BalanceOverviewView controller={stubController({ error: 'HTTP 401' })} />,
    )
    const banner = view.container.querySelector('[role="alert"]')
    expect(banner?.textContent).toContain('HTTP 401')
  })

  const stubStats = {
    todayTokens: 1_234_567,
    todayCost: 0.0123,
    todayTurns: 3,
    totalTokens: 123_456_789,
    totalCost: 45.6,
    totalTurns: 42,
    cacheSavedTokens: 56_789,
    cacheSavedCost: 0.5,
    peakTps: 45,
    models: [],
    recentDays: [],
    heatmap: [],
  }

  it('renders compact, clearly labeled metric cards from usage stats', () => {
    const view = render(
      <BalanceOverviewView controller={stubController({
        totalBalance: '12.50',
        toppedUpBalance: '10.00',
        grantedBalance: '2.50',
        stats: stubStats,
      })} />,
    )
    const text = view.container.textContent ?? ''
    expect(text).toContain('可用余额')
    expect(text).toContain('¥12.50')
    expect(text).toContain('充值 ¥10.00')
    expect(text).toContain('赠送 ¥2.50')
    expect(text).toContain('今日 Tokens')
    expect(text).toContain('123.5万')
    expect(text).toContain('约 ¥0.0123 · 3 轮对话')
    expect(text).toContain('累计 Tokens')
    expect(text).toContain('1.2亿')
    expect(text).toContain('缓存节省')
    expect(text).toContain('约省 ¥0.5')
    expect(text).toContain('峰值速率')
    expect(text).toContain('45 tok/s')
  })

  it('falls back to estimated spend metrics when official balance is unavailable', () => {
    const view = render(
      <BalanceOverviewView controller={stubController({ stats: stubStats })} />,
    )
    const text = view.container.textContent ?? ''
    expect(text).not.toContain('可用余额')
    expect(text).toContain('预估总花费')
    expect(text).toContain('¥45.60')
  })

  it('exposes the sidebar entry styles consumed by balance-sidebar', () => {
    expect(css.sidebarEntry).toBeTruthy()
    expect(css.sidebarIcon).toBeTruthy()
    expect(css.sidebarLabel).toBeTruthy()
    expect(css.sidebarAmount).toBeTruthy()
  })

  it('keeps the header model name class distinct from the breakdown list name', () => {
    expect(css.modelName).toBeTruthy()
    expect(css.modelItemName).toBeTruthy()
    expect(css.modelItemName).not.toBe(css.modelName)
  })
})

describe('balance sidebar entry', () => {
  const flushObserver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30))

  function mountShell(): { newSession: HTMLButtonElement } {
    document.body.innerHTML = `
      <div data-pane="sidebar">
        <div class="x_root">
          <div class="x_logoRow"><span>logo</span></div>
          <button class="x_newSession" type="button">新开会话</button>
        </div>
      </div>`
    return {
      newSession: document.querySelector('button[class*="newSession"]') as HTMLButtonElement,
    }
  }

  it('places the entry directly below the New Session button and populates the balance', async () => {
    const { newSession } = mountShell()
    const dispose = mountBalanceSidebarEntry(stubController({ totalBalance: '12.50' }))
    await flushObserver()

    const entry = document.querySelector<HTMLButtonElement>('[data-dsh-balance-entry]')
    expect(entry).toBeTruthy()
    expect(newSession.nextElementSibling).toBe(entry)
    expect(entry?.querySelector('[data-dsh-balance-amount]')?.textContent).toBe('12.50 CNY')
    expect(entry?.title).toContain('12.50')
    dispose()
  })

  it('still subscribes when the sidebar mounts after the plugin', async () => {
    // Shell absent at mount time: the entry is created later via the observer.
    const dispose = mountBalanceSidebarEntry(stubController({ totalBalance: '7.25' }))
    await flushObserver()
    mountShell()
    await flushObserver()

    const entry = document.querySelector<HTMLButtonElement>('[data-dsh-balance-entry]')
    expect(entry).toBeTruthy()
    expect(entry?.querySelector('[data-dsh-balance-amount]')?.textContent).toBe('7.25 CNY')
    dispose()
  })

  it('re-asserts its slot when a sibling plugin row pushes it down', async () => {
    const { newSession } = mountShell()
    const dispose = mountBalanceSidebarEntry(stubController())
    await flushObserver()

    const entry = document.querySelector<HTMLButtonElement>('[data-dsh-balance-entry]')
    expect(newSession.nextElementSibling).toBe(entry)

    // A sibling plugin inserts its own row directly after the New Session row.
    const foreign = document.createElement('button')
    foreign.dataset.dshTaskboardEntry = ''
    newSession.parentElement?.insertBefore(foreign, newSession.nextElementSibling)
    await flushObserver()

    expect(newSession.nextElementSibling).toBe(entry)
    expect(entry?.nextElementSibling).toBe(foreign)
    dispose()
  })
})
