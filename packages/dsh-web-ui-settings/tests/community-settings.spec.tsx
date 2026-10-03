import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CommunityPluginsSettingsCard } from '../src/client/CommunityPluginsSettingsCard.tsx'
import { composeAllowlist } from '../src/allowlist.ts'

afterEach(cleanup)

function fixture(writable = true, accepted = true) {
  let snapshot = { status: 'ready' as const, writable, value: { enabled: true } }
  const listeners = new Set<() => void>()
  const scope = {
    subscribe(listener: () => void) { expect(this).toBe(scope); listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot() { expect(this).toBe(scope); return snapshot },
    set: vi.fn(async (path: string, value: boolean) => {
      expect(path).toBe('enabled')
      if (accepted) { snapshot = { ...snapshot, value: { enabled: value } }; listeners.forEach(listener => listener()) }
      return accepted
    }),
  }
  const view = render(<CommunityPluginsSettingsCard settingsScope={scope as unknown as ConfigForm<{ enabled?: boolean }>} t={key => key} />)
  return { scope, view, update(value: boolean) { act(() => { snapshot = { ...snapshot, value: { enabled: value } }; listeners.forEach(listener => listener()) }) } }
}

it('writes the live enabled form and preserves disclosure and search across disable/enable', async () => {
  const state = fixture()
  fireEvent.click(screen.getByRole('button', { name: 'expand: title' }))
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'quick' } })
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(state.scope.set).toHaveBeenCalledExactlyOnceWith('enabled', false))
  await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull())
  expect(screen.getByRole('button', { name: 'collapse: title' })).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('quick'))
  expect(state.scope.set).toHaveBeenCalledTimes(2)
  state.view.unmount()
})

it('retains state and exposes denied writes rather than pretending success', async () => {
  const state = fixture(true, false)
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('saveFailed'))
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  expect(state.scope.set).toHaveBeenCalledExactlyOnceWith('enabled', false)
})

it('does not permit read-only form writes and observes external changes', () => {
  const state = fixture(false)
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('readonly')
  state.update(false)
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  expect(state.scope.set).not.toHaveBeenCalled()
})

it('maps the legacy community name only to actually registered modern forms', () => {
  expect(composeAllowlist(['dsh-client-ui-community-plugins', 'dsh-desktop-launcher'], ['ui-community-plugins', 'desktop-launcher', 'unknown'])).toEqual(['desktop-launcher', 'ui-community-plugins'])
  expect(composeAllowlist(['community-plugins'], ['community-plugins'])).toEqual(['community-plugins'])
  expect(composeAllowlist(['community-plugins'], ['unknown'])).toEqual([])
})
