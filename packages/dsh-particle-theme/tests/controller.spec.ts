import { describe, expect, it, vi } from 'vitest'

import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { ParticleThemeController } from '../src/client/controller.ts'
import { ParticleThemeRegistry, type ParticleThemeDefinition, type ParticleThemeSettings } from '../src/client/theme.ts'

function scopeHarness(initial: ParticleThemeSettings) {
  let value = initial
  let listener = () => {}
  return {
    scope: {
      getSnapshot: () => ({ status: 'ready', writable: true, value, base: value, user: {} }) as SettingsScopeSnapshot<ParticleThemeSettings>,
      subscribe: (next: () => void) => { listener = next; return () => { listener = () => {} } },
      set: async () => {},
      unset: async () => {},
    },
    publish(next: ParticleThemeSettings) { value = next; listener() },
  }
}

describe('ParticleThemeController', () => {
  it('mounts one pointer-transparent canvas, follows settings, and disposes cleanly', () => {
    const harness = scopeHarness({ enabled: true })
    const updates: string[] = []
    const dispose = vi.fn()
    const registry = new ParticleThemeRegistry()
    registry.register({
      id: 'whale',
      create: ({ canvas }) => {
        expect(canvas.getAttribute('aria-hidden')).toBe('true')
        return { update: state => updates.push(state.mode), dispose }
      },
    } satisfies ParticleThemeDefinition)
    const controller = new ParticleThemeController({ scope: harness.scope, registry, document, window })
    controller.start()
    expect(document.querySelectorAll('canvas[data-dsh-particle-theme="whale"]')).toHaveLength(1)
    expect(updates.at(-1)).toBe('normal')
    window.dispatchEvent(new CustomEvent('dsh:window-motion', { detail: true }))
    expect(updates.at(-1)).toBe('hidden')
    window.dispatchEvent(new CustomEvent('dsh:window-motion', { detail: false }))
    expect(updates.at(-1)).toBe('normal')

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.getBoundingClientRect = () => ({ x: 0, y: 0, width: 400, height: 300, top: 0, right: 400, bottom: 300, left: 0, toJSON: () => ({}) })
    document.body.append(dialog)
    controller.refreshPageMode()
    expect(updates.at(-1)).toBe('dialog')

    harness.publish({ enabled: false })
    expect(document.querySelector('canvas[data-dsh-particle-theme]')).toBeNull()
    expect(dispose).toHaveBeenCalledOnce()
    controller.dispose()
  })
})
