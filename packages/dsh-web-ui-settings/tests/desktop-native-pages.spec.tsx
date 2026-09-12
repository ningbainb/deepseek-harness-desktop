import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DockSettingsPage, DOCK_SETTINGS } from '../src/client/DockSettingsPage.tsx'
import { installDesktopAppearance, opaqueColor, surfaceColor } from '../src/client/desktop-appearance.ts'

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })
describe('native Dock sections', () => {
  for (const [id, section] of [['appearance', 'skin-center'], ['models', 'models'], ['usage', 'dsh-usage'], ['sessions', 'dsh-session-archive']]) {
    it(`renders ${id} through the official section contract`, () => {
      window.history.replaceState({}, '', `/?desktop-dock-setting=${id}`)
      const renderSlot = vi.fn((slot: string, _owner: unknown, _options: { only: string }) => slot === 'settings.section'
        ? <input aria-label="draft" defaultValue="retained" />
        : <div data-testid="bai-provider">bai</div>)
      render(<DockSettingsPage renderSlot={renderSlot as never} t={((key: string) => key) as never} />)
      expect(DOCK_SETTINGS).toContain(id)
      expect(renderSlot).toHaveBeenCalledWith('settings.section', { close: expect.any(Function) }, expect.objectContaining({ only: section }))
      if (id === 'models') {
        expect(renderSlot.mock.calls.slice(0, 2).map(([slot, , options]) => [slot, options.only]))
          .toEqual([['web-ui.plugin.item', 'relay'], ['settings.section', 'models']])
      }
      fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'edited' } })
      fireEvent(window, new CustomEvent('dsh:dock-setting', { detail: 'particle-theme' }))
      fireEvent(window, new CustomEvent('dsh:dock-setting', { detail: id }))
      expect((screen.getAllByLabelText('draft')[0] as HTMLInputElement).value).toBe('edited')
    })
  }
})

it('maps the retired relay URL and navigation event to the combined Models page', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=relay')
  const renderSlot = vi.fn((slot: string, _owner: unknown, _options: { only: string }) => <div>{slot}</div>)
  const { container } = render(<DockSettingsPage renderSlot={renderSlot as never} t={((key: string) => key) as never} />)
  expect(container.querySelector('[data-dsh-dock-settings="models"]')).toBeTruthy()
  expect(renderSlot.mock.calls.slice(0, 2).map(([slot, , options]) => [slot, options.only]))
    .toEqual([['web-ui.plugin.item', 'relay'], ['settings.section', 'models']])
  fireEvent(window, new CustomEvent('dsh:dock-setting', { detail: 'relay' }))
  expect(container.querySelector('[data-dsh-dock-settings="models"]')).toBeTruthy()
})
it('only converts opaque resolved color values into native colors', () => {
  expect(opaqueColor('#abc')).toBe('#aabbcc')
  expect(opaqueColor('rgb(16, 32, 48)')).toBe('#102030')
  expect(opaqueColor('rgba(16, 32, 48, 0.5)')).toBeUndefined()
  expect(opaqueColor('var(--unresolved)')).toBeUndefined()
})
it('flattens translucent skin colors into opaque native surfaces', () => {
  expect(surfaceColor('#ffffff80', '#000000')).toBe('#808080')
  expect(surfaceColor('#fff8', '#000000')).toBe('#888888')
  expect(surfaceColor('rgba(32, 64, 96, 0.5)', '#000000')).toBe('#102030')
  expect(surfaceColor('url(https://invalid.test)', '#112233')).toBe('#112233')
})

it('observes skin changes, clears native colors on reset, and stops on disposal', async () => {
  vi.useFakeTimers()
  const desktopWindow = window as Window & { dshDesktop?: { setWindowChromeTheme: ReturnType<typeof vi.fn> } }
  const setWindowChromeTheme = vi.fn().mockResolvedValue(undefined)
  desktopWindow.dshDesktop = { setWindowChromeTheme }
  const rootStyle = document.documentElement.getAttribute('style')
  const bodyStyle = document.body.getAttribute('style')
  document.documentElement.setAttribute('data-dsh-skin', 'fixture')
  document.body.style.setProperty('--dsw-alias-bg-layer-1', '#123456')
  document.body.style.setProperty('--dsw-alias-label-primary', '#ddeeff')
  document.body.style.setProperty('--dsw-alias-brand-primary', '#3366ff')
  document.body.style.setProperty('--dsw-alias-border-l2', '#445566')
  const dispose = installDesktopAppearance(window)
  try {
    await vi.advanceTimersByTimeAsync(200)
    expect(setWindowChromeTheme).toHaveBeenCalledTimes(1)
    expect(setWindowChromeTheme).toHaveBeenLastCalledWith('light', { background: '#123456', foreground: '#ddeeff', accent: '#3366ff', border: '#445566' })
    document.documentElement.removeAttribute('data-dsh-skin')
    await vi.advanceTimersByTimeAsync(200)
    expect(setWindowChromeTheme).toHaveBeenLastCalledWith('light', null)
    expect(document.documentElement.style.getPropertyValue('--dsh-desktop-chrome-bg')).toBe('')
    dispose()
    document.documentElement.setAttribute('data-dsh-skin', 'fixture')
    await vi.advanceTimersByTimeAsync(200)
    expect(setWindowChromeTheme).toHaveBeenCalledTimes(2)
  } finally {
    dispose()
    delete desktopWindow.dshDesktop
    document.documentElement.removeAttribute('data-dsh-skin')
    for (const [element, value] of [[document.documentElement, rootStyle], [document.body, bodyStyle]] as const) {
      if (value === null) element.removeAttribute('style')
      else element.setAttribute('style', value)
    }
    vi.useRealTimers()
  }
})
