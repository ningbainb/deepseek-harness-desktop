import { describe, expect, it, vi } from 'vitest'
import type { ValueModeConfig, ValueModeSettingsSnapshot } from '../src/core/config.ts'
import { zh } from '../src/client/locales.ts'
import { createValueModeSettingsWriter, type ValueModeWritableSettingsScope } from '../src/client/settings-write.ts'

function fixture(value: ValueModeConfig = {}, options: { base?: ValueModeConfig; user?: ValueModeConfig } = {}) {
  let snapshot: ValueModeSettingsSnapshot<ValueModeConfig> = {
    status: 'ready', writable: true, value, base: options.base ?? {}, user: Object.hasOwn(options, 'user') ? options.user : value, revision: 1, mode: 'host',
  }
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: vi.fn(async (field: string, next: unknown) => {
      const stored = JSON.parse(JSON.stringify(next)) as unknown
      const value = { ...snapshot.value, [field]: stored }
      const user = { ...snapshot.user as ValueModeConfig | undefined, [field]: stored }
      snapshot = { ...snapshot, value, user }
    }),
  } satisfies ValueModeWritableSettingsScope
  return { scope, write: createValueModeSettingsWriter(scope, key => zh[key]), readOnly: () => { snapshot = { ...snapshot, writable: false } } }
}

describe('Value Mode durable settings writer', () => {
  it('accepts cloned model routes whose undefined optional values were omitted on the wire', async () => {
    const { scope, write } = fixture()
    await write({ expert: { provider: 'relay', model: 'expert', reasoningEffort: undefined }, autoReviewKeywords: ['auth', 'migration'] })
    expect(scope.getSnapshot().value).toEqual({ expert: { provider: 'relay', model: 'expert' }, autoReviewKeywords: ['auth', 'migration'] })
  })

  it('rejects a refused write and stops the rest of an enabling patch', async () => {
    const { scope, write } = fixture({ enabled: false })
    scope.set.mockImplementationOnce(async () => {})
    await expect(write({ executor: { provider: 'relay', model: 'worker' }, enabled: true })).rejects.toThrow(zh.settingsSaveFailed)
    expect(scope.set).toHaveBeenCalledTimes(1)
    expect(scope.getSnapshot().value?.enabled).toBe(false)
    await expect(write({ enabled: true })).resolves.toBeUndefined()
    expect(scope.getSnapshot().value?.enabled).toBe(true)
  })

  it('reports read-only settings without attempting a write', async () => {
    const { scope, write, readOnly } = fixture()
    readOnly()
    await expect(write({ enabled: true })).rejects.toThrow(zh.settingsNotWritable)
    expect(scope.set).not.toHaveBeenCalled()
  })

  it.each([{}, undefined])('rejects an inherited matching value when the explicit override was not saved (%s)', async user => {
    const { scope, write } = fixture({ enabled: true }, { base: { enabled: true }, user })
    scope.set.mockImplementationOnce(async () => {})
    await expect(write({ enabled: true })).rejects.toThrow(zh.settingsSaveFailed)
    expect(scope.getSnapshot().value?.enabled).toBe(true)
    expect(scope.getSnapshot().user).toEqual(user)
    await expect(write({ enabled: true })).resolves.toBeUndefined()
    expect(scope.getSnapshot().user).toEqual({ enabled: true })
  })

  it('serializes rapid edits and snapshots queued model selections', async () => {
    const { scope, write } = fixture()
    const originalSet = scope.set.getMockImplementation()!
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    scope.set.mockImplementationOnce(async (field, value) => { await gate; await originalSet(field, value) })
    const first = write({ strategy: 'saver' })
    const selection = { provider: 'relay', model: 'worker' }
    const second = write({ strategy: 'powerful', executor: selection })
    selection.model = 'changed-after-click'
    await Promise.resolve()
    expect(scope.set).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])
    expect(scope.set.mock.calls.map(([field]) => field)).toEqual(['strategy', 'strategy', 'executor'])
    expect(scope.getSnapshot().value).toMatchObject({ strategy: 'powerful', executor: { model: 'worker' } })
  })
})
