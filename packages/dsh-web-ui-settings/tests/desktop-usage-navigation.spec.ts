import { afterEach, expect, it, vi } from 'vitest'
import { openDesktopSurface } from '@linxin666/dsh-desktop-client'
import { installDesktopUsageNavigation } from '../src/client/desktop-usage-navigation.ts'
import { en, zh } from '../src/client/locales.ts'

vi.mock('@linxin666/dsh-desktop-client', () => ({ openDesktopSurface: vi.fn() }))
let dispose: (() => void) | undefined

function fixture(desktop = true) {
  if (desktop) Object.defineProperty(window, 'dshDesktop', { configurable: true, value: {} })
  document.body.innerHTML = '<aside data-pane="sidebar"><button aria-label="账号菜单">账号菜单</button><section data-dsh-usage-foot-card><button data-dsh-part="foot-card-main"><span>今日消费</span></button><button data-dsh-part="foot-card-toggle">折叠</button></section></aside>'
  const card = document.querySelector<HTMLElement>('[data-dsh-usage-foot-card]')!
  const main = card.querySelector<HTMLButtonElement>('[data-dsh-part="foot-card-main"]')!
  const toggle = card.querySelector<HTMLButtonElement>('[data-dsh-part="foot-card-toggle"]')!
  const oldOpen = vi.fn()
  const collapse = vi.fn()
  main.addEventListener('click', oldOpen)
  toggle.addEventListener('click', collapse)
  dispose = installDesktopUsageNavigation(document, key => (document.documentElement.lang === 'en' ? en : zh)[key])
  return { card, main, toggle, oldOpen, collapse }
}

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
  document.documentElement.lang = ''
  Reflect.deleteProperty(window, 'dshDesktop')
  Reflect.deleteProperty(window, 'dshDesktopTransport')
  vi.resetAllMocks()
})

it('retains the ordinary browser usage handler without a Desktop bridge', () => {
  const state = fixture(false)
  state.main.click()
  expect(state.oldOpen).toHaveBeenCalledExactlyOnceWith(expect.any(MouseEvent))
  expect(openDesktopSurface).not.toHaveBeenCalled()
})

it('routes nested ordinary clicks and keyboard button activation to the real usage page', async () => {
  vi.mocked(openDesktopSurface).mockResolvedValue(true)
  const state = fixture()
  state.main.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await vi.waitFor(() => { expect(openDesktopSurface).toHaveBeenCalledExactlyOnceWith('extensions', { setting: 'usage' }) })
  await Promise.resolve()
  state.main.click()
  expect(openDesktopSurface).toHaveBeenCalledTimes(2)
  expect(state.oldOpen).not.toHaveBeenCalled()
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

it('retains the card collapse control and unrelated buttons', () => {
  const state = fixture()
  state.toggle.click()
  document.querySelector<HTMLButtonElement>('[aria-label="账号菜单"]')!.click()
  expect(state.collapse).toHaveBeenCalledTimes(1)
  expect(openDesktopSurface).not.toHaveBeenCalled()
})

it.each([false, new Error('synthetic-private-error')])('reports a visible localized failure and permits explicit retry: %s', async result => {
  if (result instanceof Error) vi.mocked(openDesktopSurface).mockRejectedValue(result)
  else vi.mocked(openDesktopSurface).mockResolvedValue(result)
  document.documentElement.lang = 'en'
  const state = fixture()
  state.main.click()
  await vi.waitFor(() => { expect(state.card.querySelector('[role="alert"]')?.textContent).toBe(en.usageOpenFailed) })
  expect(state.card.textContent).not.toContain('synthetic-private-error')
  vi.mocked(openDesktopSurface).mockResolvedValue(true)
  state.main.click()
  await vi.waitFor(() => { expect(openDesktopSurface).toHaveBeenCalledTimes(2) })
  expect(state.card.querySelector('[role="alert"]')).toBeNull()
})

it('suppresses duplicate pending opens and ignores late failure after disposal', async () => {
  let complete!: (opened: boolean) => void
  vi.mocked(openDesktopSurface).mockReturnValue(new Promise(resolve => { complete = resolve }))
  const state = fixture()
  state.main.click()
  state.main.click()
  expect(openDesktopSurface).toHaveBeenCalledTimes(1)
  dispose!()
  dispose!()
  complete(false)
  await Promise.resolve()
  await Promise.resolve()
  expect(document.querySelector('[role="alert"]')).toBeNull()
  state.main.click()
  expect(state.oldOpen).toHaveBeenCalledTimes(1)
  expect(openDesktopSurface).toHaveBeenCalledTimes(1)
})

it('accepts the runtime transport bridge and ignores disabled or cancelled clicks', () => {
  const state = fixture(false)
  Object.defineProperty(window, 'dshDesktopTransport', { configurable: true, value: {} })
  dispose!()
  dispose = installDesktopUsageNavigation(document, key => zh[key])
  state.main.disabled = true
  state.main.click()
  state.main.disabled = false
  const cancelled = new MouseEvent('click', { bubbles: true, cancelable: true })
  cancelled.preventDefault()
  state.main.dispatchEvent(cancelled)
  expect(openDesktopSurface).not.toHaveBeenCalled()
})
