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

  it('does not hold model selection busy while recent history is slow, and serializes rapid choices', async () => {
    let finish!: () => void
    const firstWrite = new Promise<void>(resolve => { finish = resolve })
    const set = vi.fn().mockReturnValueOnce(firstWrite).mockResolvedValue(undefined)
    const scope = { getSnapshot: () => ({ value: config }), set } as any
    const directory = { select: vi.fn(async () => {}), store: { getSnapshot: () => state } }
    let accepted = false
    const first = selectModelWithPreferences(directory, scope, { provider: 'beta', model: 'b:two' }).then(() => { accepted = true })
    await Promise.resolve()
    await Promise.resolve()
    expect(accepted).toBe(true)
    await first
    for (let index = 0; index < 12; index += 1) {
      await selectModelWithPreferences(directory, scope, { provider: 'beta', model: `m${index}` })
    }
    expect(set).toHaveBeenCalledTimes(1)
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(set).toHaveBeenCalledTimes(2)
    expect(set.mock.calls[1]![1]).toEqual(Array.from({ length: 8 }, (_, index) => ({ provider: 'beta', model: `m${11 - index}` })))
  })

  it('does not persist a rejected selection or convert a preference failure into a model failure', async () => {
    const set = vi.fn().mockRejectedValue(new Error('settings unavailable'))
    const scope = { getSnapshot: () => ({ value: config }), set } as any
    const directory = { select: vi.fn().mockRejectedValueOnce(new Error('route rejected')).mockResolvedValue(undefined), store: { getSnapshot: () => state } }
    await expect(selectModelWithPreferences(directory, scope, { provider: 'beta', model: 'b:two' })).rejects.toThrow('route rejected')
    expect(set).not.toHaveBeenCalled()
    await expect(selectModelWithPreferences(directory, scope, { provider: 'beta', model: 'b:two' })).resolves.toBeUndefined()
    await Promise.resolve()
    expect(set).toHaveBeenCalledTimes(1)
  })
})
