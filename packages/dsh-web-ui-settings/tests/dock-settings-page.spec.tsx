/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DockSettingsPage, dockSettingFromUrl } from '../src/client/DockSettingsPage.tsx'

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })

it('accepts known setting ids and maps the retired relay URL to Models', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=relay')
  expect(dockSettingFromUrl()).toBe('models')
  window.history.replaceState({}, '', '/?desktop-dock-setting=memory')
  expect(dockSettingFromUrl()).toBe('memory')
  window.history.replaceState({}, '', '/?desktop-dock-setting=https://example.com')
  expect(dockSettingFromUrl()).toBeUndefined()
})

it('loads one form at a time and preserves drafts when returning to an opened form', () => {
  const renderSlot = vi.fn((_slot, _owner, options) => <textarea aria-label={options.only} defaultValue="" />)
  render(<DockSettingsPage renderSlot={renderSlot as never} t={key => key} />)
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('value-mode'), { target: { value: 'unsaved draft' } })
  act(() => window.dispatchEvent(new CustomEvent('dsh:dock-setting', { detail: 'memory' })))
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  expect(screen.getByRole('textbox').getAttribute('aria-label')).toBe('memory')
  act(() => window.dispatchEvent(new CustomEvent('dsh:dock-setting', { detail: 'value-mode' })))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('unsaved draft')
  act(() => window.dispatchEvent(new CustomEvent('dsh:dock-setting', { detail: 'untrusted' })))
  expect(screen.getByRole('textbox').getAttribute('aria-label')).toBe('value-mode')
})

it('uses the opening theme and updates it without losing the active form', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=relay&desktop-dock-theme=light')
  render(<DockSettingsPage renderSlot={((_slot: string, _owner: unknown, options: { only: string }) => options.only === 'relay'
    ? <div data-testid="bai-provider" />
    : <input aria-label="draft" />) as never} t={key => key} />)
  fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'keep' } })
  expect(screen.getByRole('main').dataset.theme).toBe('light')
  act(() => window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: 'dark' })))
  expect(screen.getByRole('main').dataset.theme).toBe('dark')
  expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('keep')
})

it('switches personal forms with the keyboard without losing either draft', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=personal-prompt')
  const renderSlot = vi.fn((_slot, _owner, options) => <textarea aria-label={options.only} />)
  render(<DockSettingsPage renderSlot={renderSlot as never} t={key => key} />)
  fireEvent.change(screen.getByLabelText('personal-prompt'), { target: { value: 'prompt draft' } })
  fireEvent.keyDown(screen.getByRole('tab', { name: 'dockResponsePreferences' }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'dockMemory' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.change(screen.getByLabelText('memory'), { target: { value: 'memory draft' } })
  fireEvent.keyDown(screen.getByRole('tab', { name: 'dockMemory' }), { key: 'Home' })
  expect((screen.getByLabelText('personal-prompt') as HTMLTextAreaElement).value).toBe('prompt draft')
  fireEvent.click(screen.getByRole('tab', { name: 'dockMemory' }))
  expect((screen.getByLabelText('memory') as HTMLTextAreaElement).value).toBe('memory draft')
})

it('clears a stale skin palette when a theme-only update arrives without losing drafts', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=personal-prompt')
  render(<DockSettingsPage renderSlot={(() => <input aria-label="draft" />) as never} t={key => key} />)
  fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'retained' } })
  const page = screen.getByRole('main')
  act(() => window.dispatchEvent(new CustomEvent('dsh:dock-palette', {
    detail: { background: '#e8ecf5', foreground: '#242a34', accent: '#416bd4', border: '#dce1e8' },
  })))
  expect(page.style.getPropertyValue('--dsw-alias-bg-layer-1')).toBe('#e8ecf5')
  act(() => window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: 'dark' })))
  expect(page.dataset.theme).toBe('dark')
  expect(page.style.getPropertyValue('--dsw-alias-bg-layer-1')).toBe('')
  expect(page.style.getPropertyValue('--dsw-alias-label-primary')).toBe('')
  expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('retained')
})

it('applies a fresh committed palette after its theme update', () => {
  render(<DockSettingsPage renderSlot={(() => <input aria-label="draft" />) as never} t={key => key} />)
  const page = screen.getByRole('main')
  act(() => {
    window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: 'dark' }))
    window.dispatchEvent(new CustomEvent('dsh:dock-palette', {
      detail: { background: '#123456', foreground: '#ddeeff', accent: '#3366ff', border: '#445566' },
    }))
  })
  expect(page.dataset.theme).toBe('dark')
  expect(page.style.getPropertyValue('--dsw-alias-bg-layer-1')).toBe('#123456')
  expect(page.style.getPropertyValue('--dsw-alias-label-primary')).toBe('#ddeeff')
  expect(page.style.getPropertyValue('--dsw-alias-brand-primary')).toBe('#3366ff')
  expect(page.style.getPropertyValue('--dsw-alias-border-l2')).toBe('#445566')
})
