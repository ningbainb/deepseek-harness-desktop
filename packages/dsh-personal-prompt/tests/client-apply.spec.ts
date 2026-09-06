import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

describe('personal prompt client registration', () => {
  it('binds the personal-prompt namespace and registers one settings card', () => {
    const settingsScope = {
      getSnapshot: () => ({ value: { version: 1 as const, enabled: false, profiles: [] }, revision: 0, writable: true }),
      subscribe: () => () => {},
      set: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
    }
    const locale = { register: vi.fn() }
    const registration: { contribution: any; component: unknown }[] = []
    const slots = {
      register: vi.fn((contribution: any, component: unknown) => {
        registration.push({ contribution, component })
        return contribution
      }),
      inject: vi.fn((_name: string, factory: () => unknown) => factory()),
    }
    const ctx: any = {
      locale,
      settingsScope,
      get: vi.fn(() => ({ bind: vi.fn(() => settingsScope) })),
      effect: (effect: () => unknown) => effect(),
      inject: (_dependencies: string[], callback: (scope: unknown) => unknown) => callback({ slots }),
    }

    apply(ctx)

    expect(locale.register).toHaveBeenCalledWith('personal-prompt', expect.any(Object))
    expect(registration).toHaveLength(1)
    expect(registration[0]?.contribution).toMatchObject({
      name: 'web-ui.plugin.item',
      id: 'personal-prompt',
      order: 117,
      locale: 'personal-prompt',
    })
    expect(registration[0]?.component).toBeTypeOf('function')
  })
})
