/** @vitest-environment jsdom */

/**
 * rc.7 treats settings.plugin.item as keyed, so the group itself must be a
 * list-style settings.section entry with an id. Exercise both the actual
 * registration and its section component's child-slot render contract.
 */

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import * as desktop from '@linxin666/dsh-desktop-client'

const particleClient = vi.hoisted(() => vi.fn())

vi.mock('@linxin666/dsh-particle-theme/src/client/index.ts', () => ({
  installParticleThemeClient: particleClient,
}))

vi.mock('../src/client/compat-settings-scope.ts', () => ({
  WebUiSettingsBinder: class WebUiSettingsBinder {},
}))

import { apply } from '../src/client/index.ts'
import { ChatGptAuthSection } from '../src/client/ChatGptAuthSection.tsx'
import { WebUIPluginsSection } from '../src/client/WebUIPluginsCard.tsx'
import { RelayOnboardingCard } from '../src/client/RelayOnboardingCard.tsx'
import { DesktopCollaborationEntry, DesktopExtensionDockEntry, DesktopSmartControlEntry } from '../src/client/desktop-extension-dock.tsx'

function ownedEffect(callback: () => unknown): unknown {
  const dispose = callback()
  if (typeof dispose === 'function') onTestFinished(() => { dispose() })
  return dispose
}

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('Web UI settings section', () => {
  it('uses the Desktop Plugin Center as the only Desktop plugin-management destination', async () => {
    vi.spyOn(desktop, 'getDockEntryState').mockResolvedValue({ available: true, showNudge: false })
    vi.spyOn(desktop, 'openDesktopSurface').mockResolvedValue(true)
    const renderSlot = vi.fn((_slot, _owner, options) => <li>{options?.only ?? 'all cards'}</li>)
    render(<WebUIPluginsSection {...{
      t: (key: string) => key,
      close: () => {},
      renderSlot,
    } as Parameters<typeof WebUIPluginsSection>[0]} />)
    await waitFor(() => expect(screen.getByText('desktopPluginCenterTitle')).toBeTruthy())
    expect(screen.queryByText('all cards')).toBeNull()
    expect(renderSlot).not.toHaveBeenCalled()
    expect(screen.getByTestId('desktop-dock-banner')).toBeTruthy()
    screen.getByRole('button', { name: 'dockBannerAction' }).click()
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions', { tab: 'plugins' }))
  })
  it('registers a list-style rc.7 settings.section and declares the family child slot', () => {
    const register = vi.fn(() => () => {})
    const inject = vi.fn((_name: string, callback: () => unknown) => callback())
    const localeRegister = vi.fn(() => () => {})
    const bind = vi.fn(() => (key: string) => key === 'title' ? 'Web UI Plugins' : key)
    const ctx = {
      effect: ownedEffect,
      inject: vi.fn(),
      locale: { register: localeRegister, bind },
      slots: { inject, register },
    }

    apply(ctx as never)

    expect(ctx.inject).toHaveBeenCalledWith(['workspaces', 'sessions', 'uiWorkspace'], expect.any(Function))
    expect(localeRegister).toHaveBeenCalledWith('desktop-project', expect.any(Object))
    expect(localeRegister).toHaveBeenCalledWith('web-ui-plugins', expect.any(Object))
    expect(localeRegister).toHaveBeenCalledWith('chatgpt-auth', expect.any(Object))
    expect(localeRegister).toHaveBeenCalledWith('relay-onboarding', expect.any(Object))
    expect(inject.mock.calls.map(([name]) => name)).toEqual(['settings.section', 'settings.section', 'settings.models.footer', 'sidebar.footer.action', 'sidebar.footer.action', 'sidebar.footer.action'])
    expect(register).toHaveBeenCalledTimes(6)
    const [authOptions, AuthComponent] = register.mock.calls[0] as unknown as [Record<string, unknown>, typeof ChatGptAuthSection]
    expect(authOptions).toMatchObject({
      name: 'settings.section',
      id: 'chatgpt-auth',
      order: 20,
      locale: 'chatgpt-auth',
    })
    expect(AuthComponent).toBe(ChatGptAuthSection)
    const [options, Component] = register.mock.calls[1] as unknown as [Record<string, unknown>, typeof WebUIPluginsSection]
    expect(options).toMatchObject({
      name: 'settings.section',
      id: 'web-ui-plugins',
      order: 110,
      locale: 'web-ui-plugins',
      children: { 'web-ui.plugin.item': { kind: 'list', scope: 'root' } },
    })
    expect(options).not.toHaveProperty('key')
    expect(Component).toBe(WebUIPluginsSection)
    const [relayOptions, RelayComponent] = register.mock.calls[2] as unknown as [Record<string, unknown>, typeof RelayOnboardingCard]
    expect(relayOptions).toMatchObject({
      name: 'settings.models.footer',
      id: 'bai-onboarding',
      order: -100,
      locale: 'relay-onboarding',
    })
    expect(RelayComponent).toBe(RelayOnboardingCard)
    const [controlOptions, ControlComponent] = register.mock.calls[3] as unknown as [Record<string, unknown>, typeof DesktopSmartControlEntry]
    expect(controlOptions).toMatchObject({ name: 'sidebar.footer.action', id: 'desktop-smart-control', order: 98 })
    expect(ControlComponent).toBe(DesktopSmartControlEntry)
    const [collaborationOptions, CollaborationComponent] = register.mock.calls[4] as unknown as [Record<string, unknown>, typeof DesktopCollaborationEntry]
    expect(collaborationOptions).toMatchObject({ name: 'sidebar.footer.action', id: 'desktop-model-collaboration', order: 99 })
    expect(CollaborationComponent).toBe(DesktopCollaborationEntry)
    const [dockOptions, DockComponent] = register.mock.calls[5] as unknown as [Record<string, unknown>, typeof DesktopExtensionDockEntry]
    expect(dockOptions).toMatchObject({
      name: 'sidebar.footer.action',
      id: 'desktop-extension-dock',
      order: 100,
      locale: 'web-ui-plugins',
    })
    expect(DockComponent).toBe(DesktopExtensionDockEntry)
    expect(particleClient).toHaveBeenCalledTimes(1)
  })

  it('registers one bai card above the official Models section in the Dock', () => {
    window.history.replaceState({}, '', '/?desktop-dock-setting=models')
    const register = vi.fn((_entry: unknown, _component?: unknown) => () => {})
    const inject = vi.fn((_name: string, callback: () => unknown) => callback())
    const ctx = {
      effect: ownedEffect,
      inject: vi.fn(),
      locale: { register: vi.fn(() => () => {}), bind: vi.fn(() => (key: string) => key) },
      slots: { inject, register },
    }
    apply(ctx as never)
    expect(inject.mock.calls.map(([name]) => name)).toEqual(['settings.section', 'web-ui.plugin.item', 'sidebar.footer.action', 'sidebar.footer.action', 'sidebar.footer.action', 'root'])
    expect(register).toHaveBeenCalledTimes(6)
    expect(register.mock.calls[1]![0]).toMatchObject({ name: 'web-ui.plugin.item', id: 'relay', order: 1 })
    expect(register.mock.calls[1]![1]).toBe(RelayOnboardingCard)
  })

  it('renders the declared web-ui.plugin.item child slot on non-Desktop hosts', async () => {
    vi.spyOn(desktop, 'getDockEntryState').mockResolvedValue({ available: false, reason: 'unavailable' })
    const renderSlot = vi.fn(() => <li data-testid="family-card">Task board settings</li>)
    const props = {
      close: () => {},
      t: (key: 'title' | 'description') => key === 'title'
        ? 'Web UI Plugins'
        : key === 'description'
          ? 'Family configuration'
          : key,
      renderSlot: renderSlot as never,
    } as Parameters<typeof WebUIPluginsSection>[0]

    render(<WebUIPluginsSection {...props} />)

    expect(screen.getByRole('heading', { name: 'Web UI Plugins' })).toBeTruthy()
    expect(screen.getByText('Family configuration')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('family-card')).toBeTruthy())
    expect(renderSlot).toHaveBeenCalledWith('web-ui.plugin.item', {})
  })
})
