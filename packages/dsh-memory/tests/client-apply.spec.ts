import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

describe('memory client registration', () => {
  it('keeps memory management in settings without adding a main conversation action', () => {
    const settingsScope = {
      getSnapshot: () => ({ value: { version: 1 as const, enabled: false }, revision: 0, writable: true }),
      subscribe: () => () => {},
      set: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
    }
    const commands: Array<{ name: string }> = []
    const locale = { register: vi.fn(), bind: () => (key: string) => key }
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
      inject: (deps: string[], callback: (scope: unknown) => unknown) => {
        if (deps[0] === 'commandUi') {
          return callback({
            effect: (effect: () => unknown) => effect(),
            get: () => ({ register: (cmd: { name: string }) => { commands.push(cmd); return () => {} } }),
          })
        }
        return callback({ slots })
      },
    }

    apply(ctx)

    expect(locale.register).toHaveBeenCalledWith('memory', expect.any(Object))
    expect(registration).toHaveLength(5)
    expect(registration.some(item => item.contribution.name === 'conversation.session.header.actions')).toBe(false)
    expect(registration.some(item => item.contribution.name === 'sidebar.footer.action')).toBe(false)
    expect(registration.map(item => item.contribution.name)).toEqual([
      'web-ui.plugin.item',
      'shell.overlay',
      'conversation.session.panel.section',
      'conversation.session.panel.section.actions',
      'sidebar.right.tab.files.actions',
    ])
    expect(registration[0]?.contribution).toMatchObject({
      name: 'web-ui.plugin.item',
      id: 'memory',
      order: 118,
    })
    expect(commands.map(cmd => cmd.name)).toEqual(['search'])
    expect(registration[0]?.component).toBeTypeOf('function')
  })
})

