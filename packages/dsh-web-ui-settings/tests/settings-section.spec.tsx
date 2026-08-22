/** @vitest-environment jsdom */

/**
 * rc.7 treats settings.plugin.item as keyed, so the group itself must be a
 * list-style settings.section entry with an id. Exercise both the actual
 * registration and its section component's child-slot render contract.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const particleClient = vi.hoisted(() => vi.fn())

vi.mock('@linxin666/dsh-particle-theme/src/client/index.ts', () => ({
  installParticleThemeClient: particleClient,
}))

vi.mock('../src/client/compat-settings-scope.ts', () => ({
  WebUiSettingsBinder: class WebUiSettingsBinder {},
}))

import { apply } from '../src/client/index.ts'
import { WebUIPluginsSection } from '../src/client/WebUIPluginsCard.tsx'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Web UI settings section', () => {
  it('registers a list-style rc.7 settings.section and declares the family child slot', () => {
    const register = vi.fn(() => () => {})
    const inject = vi.fn((_name: string, callback: () => unknown) => callback())
    const localeRegister = vi.fn(() => () => {})
    const bind = vi.fn(() => (key: string) => key === 'title' ? 'Web UI Plugins' : key)
    const ctx = {
      effect: (callback: () => unknown) => callback(),
      locale: { register: localeRegister, bind },
      slots: { inject, register },
    }

    apply(ctx as never)

    expect(localeRegister).toHaveBeenCalledWith('web-ui-plugins', expect.any(Object))
    expect(inject.mock.calls.map(([name]) => name)).toEqual(['settings.section'])
    expect(register).toHaveBeenCalledTimes(1)
    const [options, Component] = register.mock.calls[0] as unknown as [Record<string, unknown>, typeof WebUIPluginsSection]
    expect(options).toMatchObject({
      name: 'settings.section',
      id: 'web-ui-plugins',
      order: 110,
      locale: 'web-ui-plugins',
      children: { 'web-ui.plugin.item': { kind: 'list', scope: 'root' } },
    })
    expect(options).not.toHaveProperty('key')
    expect(Component).toBe(WebUIPluginsSection)
    expect(particleClient).toHaveBeenCalledTimes(1)
  })

  it('renders the declared web-ui.plugin.item child slot under the static section heading', () => {
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
    expect(screen.getByTestId('family-card')).toBeTruthy()
    expect(renderSlot).toHaveBeenCalledWith('web-ui.plugin.item', {})
  })
})
