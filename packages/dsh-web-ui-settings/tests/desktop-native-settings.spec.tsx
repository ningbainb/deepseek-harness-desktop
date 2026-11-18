import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { openDesktopNativeSettings, useDesktopNativeSettingsNavigation } from '../src/client/desktop-native-settings.tsx'
import { withSettingsOnboardingPriority } from '../src/client/settings-onboarding-priority.tsx'
import type { SnapshotSelectorHook } from './settings-sdk-adapter.ts'

function SettingsShell({ openSection }: { openSection: (id: string) => void }) {
  useDesktopNativeSettingsNavigation({ openSection })
  return null
}

afterEach(cleanup)
afterEach(() => vi.restoreAllMocks())

it('opens one built-in Settings shell and keeps the latest early deep link', () => {
  expect(openDesktopNativeSettings('plugin-options')).toBe(false)
  expect(openDesktopNativeSettings('__proto__')).toBe(false)
  expect(openDesktopNativeSettings('models')).toBe(true)
  expect(openDesktopNativeSettings('memory')).toBe(true)
  const openSection = vi.fn()
  const first = render(<SettingsShell openSection={openSection} />)
  expect(openSection.mock.calls).toEqual([['desktop-personal-preferences']])

  act(() => {
    for (const route of ['relay', 'value-mode', 'describe-image', 'personal-prompt', 'usage', 'sessions']) {
      expect(openDesktopNativeSettings(route)).toBe(true)
    }
  })
  expect(openSection.mock.calls).toEqual([
    ['desktop-personal-preferences'], ['models'], ['desktop-model-advanced'], ['desktop-model-advanced'],
    ['desktop-personal-preferences'], ['dsh-usage'], ['archived-sessions'],
  ])

  first.unmount()
  expect(openDesktopNativeSettings('models')).toBe(true)
  const reopened = vi.fn()
  render(<SettingsShell openSection={reopened} />)
  expect(reopened.mock.calls).toEqual([['models']])
  expect(openSection).toHaveBeenCalledTimes(7)
})

it('retains dirty native edits when closing Settings or choosing another destination is canceled', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const actions = { openSection: vi.fn(), select: vi.fn(), close: vi.fn() }
  type Shell = {
    actions: typeof actions
    useStore: SnapshotSelectorHook<{ open: boolean; activeId: string }>
    useOnboardingSteps: SnapshotSelectorHook<Array<{ id: string; order: number }>>
  }
  const NativeShell = withSettingsOnboardingPriority<Shell>(({ actions }) => <div data-shortcut-modal="settings">
    <section data-dsh-native-settings="personal"><input aria-label="Draft" data-dock-dirty="true" defaultValue="Keep this draft" /></section>
    <button type="button" onClick={() => actions.select('models')}>Models</button>
    <button type="button" onClick={() => actions.close()}>Close</button>
  </div>)
  render(<NativeShell actions={actions} useStore={selector => selector({ open: true, activeId: 'desktop-personal-preferences' })}
    useOnboardingSteps={selector => selector([])} />)
  fireEvent.click(screen.getByRole('button', { name: 'Models' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(openDesktopNativeSettings('value-mode')).toBe(true)
  expect(confirm).toHaveBeenCalledTimes(3)
  expect(actions.openSection).not.toHaveBeenCalled()
  expect(actions.select).not.toHaveBeenCalled()
  expect(actions.close).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('Keep this draft')

  confirm.mockReturnValue(true)
  act(() => { openDesktopNativeSettings('value-mode') })
  expect(actions.openSection).toHaveBeenCalledExactlyOnceWith('desktop-model-advanced')
})

it('groups the official navigation while opening old links at the exact mounted section', () => {
  const rows = [
    ['general', 'General'], ['models', 'Models'], ['chatgpt-auth', 'ChatGPT sign-in'], ['dsh-usage', 'Usage'],
    ['desktop-personal-preferences', 'Personal preferences'], ['agent-presets', 'Agent presets'],
    ['archived-sessions', 'Archived sessions'], ['skin-center', 'Skins'],
    ['dsh-builtin-browser', 'Browser'], ['plugins', 'Built-in plugins'], ['custom-extension', 'Custom extension'],
  ].map(([id, label], order) => ({ id: id!, label: label!, order }))
  type Shell = {
    actions: { openSection: (id: string) => void; select: (id: string) => void }
    useStore: SnapshotSelectorHook<{ open: boolean; activeId: string | undefined }>
    useSections: SnapshotSelectorHook<typeof rows>
    useOnboardingSteps: SnapshotSelectorHook<Array<{ id: string; order: number }>>
    renderSlot: (key: string, owner: unknown, options: { only?: string }) => ReactNode
  }
  const NativeShell = withSettingsOnboardingPriority<Shell>(({ actions, useStore, useSections, renderSlot }) => {
    const selected = useStore(state => state.activeId)
    const sections = useSections(value => value)
    return <div data-shortcut-modal="settings">
      <nav>{sections.map(row => <button key={row.id} aria-current={row.id === selected} onClick={() => actions.select(row.id)}>{row.label}</button>)}</nav>
      {renderSlot('settings.section', { close: () => {} }, selected === undefined ? {} : { only: selected })}
    </div>
  })
  function Fixture() {
    const [id, setId] = useState<string>('general')
    return <NativeShell actions={{ openSection: setId, select: setId }}
      useStore={selector => selector({ open: true, activeId: id })} useSections={selector => selector(rows)}
      useOnboardingSteps={selector => selector([])}
      renderSlot={(_key, _owner, options) => <div data-testid="official-form">{options.only}</div>} />
  }
  render(<Fixture />)
  expect(screen.getByRole('navigation').querySelectorAll('button')).toHaveLength(6)
  act(() => { openDesktopNativeSettings('usage') })
  expect(screen.getByRole('button', { name: 'Models and sign-in' }).getAttribute('aria-current')).toBe('true')
  expect(screen.getByRole('tab', { name: 'Usage and balance' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getByTestId('official-form').textContent).toBe('dsh-usage')
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Usage and balance' }), { key: 'Home' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Providers' }))
  expect(screen.getByTestId('official-form').textContent).toBe('models')
  fireEvent.click(screen.getByRole('button', { name: 'Tools and permissions' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Custom extension' }))
  expect(screen.getByTestId('official-form').textContent).toBe('custom-extension')
})
