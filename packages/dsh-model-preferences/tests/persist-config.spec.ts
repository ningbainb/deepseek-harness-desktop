import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MODEL_PREFERENCES } from '../src/core/config.ts'
import { persistModelPreferencesConfig } from '../src/client/persist-config.ts'

describe('model preference atomic settings persistence', () => {
  it('writes only preference fields through one fenced mutation', async () => {
    const form = { mutate: vi.fn(async () => true) }
    expect(await persistModelPreferencesConfig(form, DEFAULT_MODEL_PREFERENCES, 9)).toBe(true)
    expect(form.mutate).toHaveBeenCalledExactlyOnceWith([
      { op: 'set', path: ['pinnedModels'], value: DEFAULT_MODEL_PREFERENCES.pinnedModels },
      { op: 'set', path: ['providerOrder'], value: DEFAULT_MODEL_PREFERENCES.providerOrder },
      { op: 'set', path: ['disabledProviders'], value: DEFAULT_MODEL_PREFERENCES.disabledProviders },
      { op: 'set', path: ['recentModels'], value: DEFAULT_MODEL_PREFERENCES.recentModels },
    ], 9)
  })

  it('preserves refusal without issuing subsequent partial field writes', async () => {
    const form = { mutate: vi.fn(async () => false) }
    expect(await persistModelPreferencesConfig(form, DEFAULT_MODEL_PREFERENCES)).toBe(false)
    expect(form.mutate).toHaveBeenCalledTimes(1)
  })

  it('propagates transport errors to the editor', async () => {
    const failure = new Error('synthetic transport failure')
    const form = { mutate: vi.fn(async () => { throw failure }) }
    await expect(persistModelPreferencesConfig(form, DEFAULT_MODEL_PREFERENCES)).rejects.toBe(failure)
  })
})
