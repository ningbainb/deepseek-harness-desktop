import { describe, expect, it, vi } from 'vitest'
// The npm SDK's client half is a closure-factory bundle for the GUI's
// __ModuleLoader__ (not importable under vitest); provide the one value
// member the apply chain needs.
vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: (init: unknown) => ({
    get: () => init,
    set: () => {},
    subscribe: () => () => {},
  }),
}))
import { apply } from '../src/client/index.ts'

describe('live-stats client apply', () => {
  it('registers the plugin settings card and the TPS line into the composer dock', async () => {
    const injected: string[] = []
    const registrations: Array<{ name: string; locale?: string }> = []
    const serviceInjections: string[][] = []
    const ctx = {
      inject: (names: string[]) => { serviceInjections.push(names); return { dispose: async () => {} } },
      effect: (fn: () => unknown) => fn(),
      get: () => undefined,
      locale: { register: () => () => {}, bind: () => (key: string) => key },
      slots: {
        inject: (key: string, register: () => unknown) => { injected.push(key); register(); return () => {} },
        register: (spec: { name: string; locale?: string }) => { registrations.push(spec); return () => {} },
      },
      settingsScope: {
        bind: () => ({
          getSnapshot: () => ({ status: 'unavailable' as const, writable: false }),
          subscribe: () => () => {},
          set: async () => {},
          unset: async () => {},
        }),
      },
    }
    apply(ctx as never)
    // The card mounts into the Web UI plugin group; the TPS line mounts into
    // the composer dock (the shipped stats-line seat, whose standard kit
    // supplies useProjection) so the live throughput row actually renders.
    expect(injected).toEqual(['web-ui.plugin.item', 'conversation.composer.dock'])
    expect(registrations.find(spec => spec.name === 'conversation.composer.dock')?.locale).toBe('live-stats')
    expect(serviceInjections).toContainEqual(['sessions', 'modelDirectories', 'remote.session'])
  })
})
