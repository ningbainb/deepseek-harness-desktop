import { describe, expect, it, vi } from 'vitest'

const settingsMocks = vi.hoisted(() => ({
  install: vi.fn(),
  namespace: vi.fn((value: string) => value),
}))

vi.mock('@deepseek-ai/dsh-settings', () => ({
  installSettingsSection: settingsMocks.install,
  settingsNamespace: settingsMocks.namespace,
}))

import { apply } from '../src/index.ts'

describe('memory host plugin', () => {
  it('registers section, variable, local route and model tool', () => {
    const sections: unknown[] = []
    const variables: unknown[] = []
    const listeners = new Map<string, (this: unknown, ...args: any[]) => void>()
    const registrations: unknown[] = []
    const ctx: any = {
      userScope: {
        availabilityState: () => 'ready',
        localPrincipal: () => ({ id: 'principal-host' }),
        currentScope: () => undefined,
        snapshot: () => ({ sessions: [] }),
        canAccess: () => ({ allowed: true }),
      },
      sessions: { list: () => [] },
      tools: { register: vi.fn((definition: unknown) => { registrations.push(definition); return vi.fn() }) },
      systemPrompt: {
        section: vi.fn((spec: unknown) => { sections.push(spec); return vi.fn() }),
        variable: vi.fn((name: string, provider: unknown) => { variables.push({ name, provider }); return vi.fn() }),
      },
      on: vi.fn((name: string, listener: (this: unknown, ...args: any[]) => void) => { listeners.set(name, listener) }),
      effect: (effect: () => unknown) => effect(),
      inject: vi.fn((dependencies: string[], callback: (scope: unknown) => unknown) => {
        if (dependencies.includes('workspaceRegistry')) return callback({ workspaceRegistry: { list: () => [] } })
        if (dependencies.includes('webServer')) return callback({ webServer: { register: vi.fn(() => vi.fn()) } })
        return undefined
      }),
    }

    apply(ctx)

    expect(settingsMocks.install).toHaveBeenCalled()
    expect(sections).toHaveLength(1)
    expect(variables).toHaveLength(1)
    expect(variables[0]).toMatchObject({ name: 'dsh_memory' })
    expect(registrations).toHaveLength(1)
    expect(ctx.inject).toHaveBeenCalledWith(['webServer'], expect.any(Function))
  })
})

