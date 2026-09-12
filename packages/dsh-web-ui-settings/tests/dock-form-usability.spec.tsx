/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PluginSettingsCard } from '../../../shared/client/settings/PluginSettingsCard.tsx'
import { PersonalPromptCard, type PersonalPromptCardProps } from '../../dsh-personal-prompt/src/client/PersonalPromptCard.tsx'
import type { PersonalPromptLocaleKey } from '../../dsh-personal-prompt/src/client/locales.ts'
import { DEFAULT_PERSONAL_PROMPT } from '../../dsh-personal-prompt/src/core/config.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'personal-prompt': PersonalPromptLocaleKey }
}

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); vi.restoreAllMocks() })
const shell = { available: true, exposed: true, writable: true, dirty: false, invalid: false, saving: false, failed: false }

it('opens the dedicated Dock form without an extra click and retains its collapse control', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=particle-theme')
  render(<PluginSettingsCard t={key => key} titleKey="title" descriptionKey="description" state={shell} onSave={() => {}} onDiscard={() => {}}><input aria-label="setting" /></PluginSettingsCard>)
  expect(screen.getByRole('textbox')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'settings.collapse: title' }))
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'settings.expand: title' }))
  expect(screen.getByRole('textbox')).toBeTruthy()
})

it('keeps ordinary settings cards collapsed and exposes dirty Dock forms to the close guard', () => {
  const save = vi.fn()
  const card = () => <PluginSettingsCard t={key => key} titleKey="title" descriptionKey="description" state={{ ...shell, dirty: true }} onSave={save} onDiscard={() => {}}><input /></PluginSettingsCard>
  const view = render(card())
  expect(screen.queryByRole('textbox')).toBeNull()
  view.unmount()
  window.history.replaceState({}, '', '/?desktop-dock-setting=describe-image')
  render(card())
  const dirty = document.querySelector('[data-dock-dirty="true"]')!
  expect(dirty).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'settings.collapse: title' }))
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(dirty.querySelector('[data-dock-save]')!)
  expect(save).toHaveBeenCalledOnce()
})

it('focuses a newly opened preference body without stealing focus on later edits', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=personal-prompt')
  const snapshot = { status: 'ready', writable: true, revision: 1, value: DEFAULT_PERSONAL_PROMPT }
  const props = {
    config: DEFAULT_PERSONAL_PROMPT,
    settingsScope: { getSnapshot: () => snapshot, subscribe: () => () => {}, set: vi.fn(), unset: vi.fn() },
    t: (key: string) => key,
  }
  render(<PersonalPromptCard {...props as unknown as PersonalPromptCardProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'settings.new' }))
  const body = screen.getByPlaceholderText('settings.contentPlaceholder')
  expect(document.activeElement).toBe(body)
  const name = screen.getByPlaceholderText('settings.profileNamePlaceholder')
  name.focus()
  fireEvent.change(name, { target: { value: 'Preference' } })
  expect(document.activeElement).toBe(name)
})
