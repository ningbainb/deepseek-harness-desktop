import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: (initial: unknown) => {
    let value = initial
    return { get: () => value, set: (next: unknown) => { value = next }, subscribe: () => () => {} }
  },
}))

import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ParticleThemeSettingsCardController, type ParticleThemeSettings } from '../src/client/ParticleThemeSettingsCard.tsx'

describe('particle theme settings card', () => {
  it('projects every live tuning field and stages the master switch', async () => {
    let snapshot = {
      status: 'ready',
      writable: true,
      value: { enabled: true, density: 1, opacity: 0.26, speed: 1 },
      base: { enabled: true, density: 1, opacity: 0.26, speed: 1 },
      user: {},
    } as SettingsScopeSnapshot<ParticleThemeSettings>
    let publish = () => {}
    const writes: Array<[string, unknown]> = []
    const controller = new ParticleThemeSettingsCardController({
      getSnapshot: () => snapshot,
      subscribe: (listener) => { publish = listener; return () => {} },
      set: async (field, value) => {
        writes.push([field, value])
        snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value }, user: { [field]: value } }
        publish()
      },
      unset: async () => {},
    })
    const face = controller.inject()
    expect(face.hooks.particleThemeSettingsCard.get()).toMatchObject({
      enabled: { text: 'true' },
      density: { text: '1' },
      opacity: { text: '0.26' },
      speed: { text: '1' },
    })
    face.edit('enabled', 'false')
    expect(face.hooks.particleThemeSettingsCard.get().dirty).toBe(true)
    face.save()
    await vi.waitFor(() => { expect(writes).toEqual([['enabled', false]]) })
  })
})
