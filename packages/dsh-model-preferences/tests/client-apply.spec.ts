import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

function fakeSettingsScope() {
  const value = {
    version: 1 as const,
    pinnedModels: [],
    providerOrder: [],
    disabledProviders: [],
    recentModels: [],
  }
  return {
    getSnapshot: () => ({ value, revision: 0, writable: true }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
  }
}

describe('model preference client registration', () => {
  it('uses the public /model decoration, the official Models page extension, and a lower-priority composer seat', () => {
    const settingsScope = fakeSettingsScope()
    const locale = {
      register: vi.fn(),
      bind: vi.fn(() => (key: string) => key),
    }
    const command = {
      register: vi.fn(() => () => {}),
      decorate: vi.fn(() => () => {}),
    }
    const directory = {
      store: {
        getSnapshot: () => ({
          current: null,
          routable: null,
          groups: [],
          failures: [],
          status: 'idle' as const,
          error: null,
        }),
      },
      load: vi.fn(async () => ({ groups: [], failures: [] })),
      select: vi.fn(async () => {}),
    }
    const models = { directoryFor: vi.fn(() => directory) }
    const sessions = { subagentAddress: vi.fn(() => undefined) }
    const slotRegistrations: Array<{ contribution: any; component: unknown }> = []
    const slots = {
      register: vi.fn((contribution: any, component: unknown) => {
        slotRegistrations.push({ contribution, component })
        return contribution
      }),
      inject: vi.fn((_name: string, factory: () => unknown) => factory()),
    }
    const scopeFor = (dependencies: string[]) => {
      if (dependencies.includes('commandUi')) {
        return {
          get: (name: string) => name === 'commandUi' ? command : models,
          sessions,
          effect: (effect: () => unknown) => effect(),
        }
      }
      return { slots, get: (name: string) => name === 'modelDirectories' ? models : undefined }
    }
    const ctx: any = {
      locale,
      settingsScope,
      effect: (effect: () => unknown) => effect(),
      get: (name: string) => name === 'webUiSettings' ? { bind: vi.fn(() => settingsScope) } : undefined,
      inject: (dependencies: string[], callback: (scope: unknown) => unknown) => callback(scopeFor(dependencies)),
    }

    apply(ctx)

    expect(inject).toContain('sessions')
    expect(locale.register).toHaveBeenCalledWith('model-preferences', expect.any(Object))
    expect(command.register).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'model' }))
    expect(command.decorate).toHaveBeenCalledWith(expect.objectContaining({ name: 'model' }))
    expect(slotRegistrations.map(entry => entry.contribution.name)).not.toContain('settings.section')
    expect(slotRegistrations.map(entry => entry.contribution.name)).not.toContain('web-ui.plugin.item')
    expect(slotRegistrations.map(entry => entry.contribution.name)).toContain('settings.models.content')
    expect(slotRegistrations.find(entry => entry.contribution.name === 'settings.models.content')?.contribution).toMatchObject({ id: 'model-preferences', order: 10, children: { 'model-preferences.onboarding': { kind: 'list', scope: 'root' } } })
    expect(slotRegistrations.map(entry => entry.contribution.name)).toContain('conversation.input.model')
    expect(slotRegistrations.find(entry => entry.contribution.name === 'conversation.input.model')?.contribution.priority).toBe(-10)
  })
})
