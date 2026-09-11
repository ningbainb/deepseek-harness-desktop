import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: (initial: unknown) => {
    let value = initial
    return { get: () => value, set: (next: unknown) => { value = next }, subscribe: () => () => {} }
  },
}))

import { apply } from '../src/client/index.ts'

describe('particle theme client apply', () => {
  it('mounts the runtime lifecycle and contributes its settings card', () => {
    const slots: string[] = []
    const disposers: Array<() => void> = []
    const scope = {
      getSnapshot: () => ({ status: 'ready' as const, writable: true, value: { enabled: false }, base: {}, user: {} }),
      subscribe: () => () => {},
      set: async () => {},
      unset: async () => {},
    }
    const ctx = {
      effect: (factory: () => unknown) => {
        const result = factory()
        if (typeof result === 'function') disposers.push(result as () => void)
        return result
      },
      get: () => undefined,
      locale: { register: () => () => {} },
      settingsScope: { bind: () => scope },
      slots: {
        inject: (name: string, factory: () => unknown) => { slots.push(name); factory(); return () => {} },
        register: () => () => {},
      },
    }
    apply(ctx as never)
    apply(ctx as never)
    expect(slots).toEqual(['web-ui.plugin.item'])
    expect(document.querySelector('canvas[data-dsh-particle-theme]')).toBeNull()
    for (const dispose of disposers.reverse()) dispose()
  })
})
