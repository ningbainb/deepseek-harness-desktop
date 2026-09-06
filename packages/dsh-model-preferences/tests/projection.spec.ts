import { describe, expect, it, vi } from 'vitest'
import { commandOptions, selectionFromOptionId, selectModelWithPreferences } from '../src/client/model-projection.ts'
import { modelKeyFromOptionId, type ModelPreferencesConfig } from '../src/core/config.ts'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

const config: ModelPreferencesConfig = {
  version: 1,
  pinnedModels: [{ provider: 'alpha', model: 'a:one' }],
  providerOrder: ['beta', 'alpha'],
  disabledProviders: [],
  recentModels: [],
}

const state: ModelDirectoryState = {
  current: { provider: 'alpha', model: 'a:one', reasoningEffort: 'deep' },
  routable: true,
  status: 'ready',
  error: null,
  groups: [
    { id: 'alpha', name: 'Alpha', models: [{ id: 'a:one', name: 'Alpha One' }] },
    { id: 'beta', name: 'Beta', models: [{ id: 'b:two', name: 'Beta Two' }] },
  ],
  failures: [{ id: 'gamma', name: 'Gamma', message: 'failed' }],
}

describe('model preference client projection', () => {
  it('uses opaque structured ids and exposes failures without changing official catalog fields', () => {
    const options = commandOptions(state, config, key => key)
    expect(modelKeyFromOptionId(options[0]!.id)).toEqual({ provider: 'alpha', model: 'a:one' })
    expect(options[0]!.active).toBe(true)
    expect(options.at(-1)).toMatchObject({ id: 'failure:gamma' })
    expect(options.map(option => option.label)).toEqual(['Alpha One', 'Beta Two', 'Gamma'])
  })

  it('resolves a command row back to a complete selection with the current effort', () => {
    const options = commandOptions(state, config, key => key)
    expect(selectionFromOptionId(state, options[0]!.id, config)).toEqual({
      provider: 'alpha',
      model: 'a:one',
      reasoningEffort: 'deep',
    })
  })

  it('rejects a stale command row from a disabled provider while retaining the active route', () => {
    const disabledConfig: ModelPreferencesConfig = {
      ...config,
      disabledProviders: ['beta'],
    }
    expect(selectionFromOptionId(state, JSON.stringify(['beta', 'b:two']), disabledConfig)).toBeUndefined()

    const activeBeta = {
      ...state,
      current: { provider: 'beta', model: 'b:two', reasoningEffort: 'fast' },
    }
    expect(selectionFromOptionId(activeBeta, JSON.stringify(['beta', 'b:two']), disabledConfig)).toEqual({
      provider: 'beta',
      model: 'b:two',
      reasoningEffort: 'fast',
    })
  })

  it('persists a successful selection as recent history after the official directory accepts it', async () => {
    const select = vi.fn(async () => {})
    const set = vi.fn(async () => {})
    const directory = { select, store: { getSnapshot: () => state } }
    const settingsScope = {
      getSnapshot: () => ({ value: config }),
      set,
    } as any

    await selectModelWithPreferences(directory, settingsScope, { provider: 'beta', model: 'b:two' })
    expect(select).toHaveBeenCalledWith({ provider: 'beta', model: 'b:two' })
    expect(set).toHaveBeenCalledWith('recentModels', [{ provider: 'beta', model: 'b:two' }])
  })
})
