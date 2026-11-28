import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
import {
  WinControlMenuOption,
  WinControlPill,
  shouldShowWinControlMenuOption,
  shouldShowWinControlPill,
} from '../src/client/WinControlPill.tsx'

describe('WinControlPill & WinControlMenuOption visibility and registration', () => {
  it('hides the composer pill when session control is not granted while keeping the model menu switch available', () => {
    expect(shouldShowWinControlPill(null)).toBe(false)
    expect(shouldShowWinControlPill({ bridgedToolCount: 0, sessionGranted: true })).toBe(false)
    expect(shouldShowWinControlPill({ bridgedToolCount: 18, sessionGranted: false })).toBe(false)
    expect(shouldShowWinControlPill({ bridgedToolCount: 18, sessionGranted: true })).toBe(true)

    expect(shouldShowWinControlMenuOption(null)).toBe(false)
    expect(shouldShowWinControlMenuOption({ bridgedToolCount: 0 })).toBe(false)
    expect(shouldShowWinControlMenuOption({ bridgedToolCount: 18 })).toBe(true)
  })

  it('registers the composer pill, model menu option, and settings card', () => {
    const registered: Array<{ contribution: Record<string, unknown>; component: unknown }> = []
    const ctx: any = {
      get: (name: string) => {
        if (name === 'locale') return { register: vi.fn(() => () => {}) }
        if (name === 'slots') {
          return {
            inject: (_slot: string, factory: () => unknown) => factory(),
            register: (contribution: Record<string, unknown>, component: unknown) => {
              registered.push({ contribution, component })
              return () => {}
            },
          }
        }
        return undefined
      },
      effect: (cb: () => unknown) => cb(),
    }

    apply(ctx)

    expect(registered.map(item => item.contribution.name)).toEqual([
      'conversation.input.left',
      'conversation.input.model.options',
      'model-preferences.menu.options',
      'web-ui.plugin.item',
    ])
    expect(registered[0]?.component).toBe(WinControlPill)
    expect(registered[1]?.component).toBe(WinControlMenuOption)
    expect(registered[2]?.component).toBe(WinControlMenuOption)
  })
})
