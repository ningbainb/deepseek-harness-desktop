import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_PREFERENCES,
  assertModelPreferences,
  modelKeyFromOptionId,
  modelOptionId,
  moveProvider,
  normalizeModelPreferences,
  providerIdsInOrder,
  recordRecentModel,
  selectionForModel,
  sortModelCatalog,
  type ModelCatalogSnapshot,
  type ModelPreferencesConfig,
} from '../src/core/config.ts'

const snapshot: ModelCatalogSnapshot = {
  current: { provider: 'alpha', model: 'a2', reasoningEffort: 'deep' },
  groups: [
    {
      id: 'alpha',
      name: 'Alpha',
      models: [
        {
          id: 'a1',
          name: 'Alpha One',
          reasoning: {
            defaultEffort: 'balanced',
            efforts: [{ id: 'balanced', name: 'Balanced' }, { id: 'deep', name: 'Deep' }],
          },
        },
        { id: 'a2', name: 'Alpha Two' },
      ],
    },
    {
      id: 'beta',
      name: 'Beta',
      models: [{ id: 'b:one', name: 'Beta One' }],
    },
    {
      id: 'gamma',
      name: 'Gamma',
      models: [{ id: 'g1', name: 'Gamma One' }],
    },
  ],
  failures: [{ id: 'broken', name: 'Broken', message: 'temporarily unavailable' }],
}

const config: ModelPreferencesConfig = {
  version: 1,
  pinnedModels: [
    { provider: 'beta', model: 'b:one' },
    { provider: 'alpha', model: 'a1' },
  ],
  providerOrder: ['beta', 'alpha'],
  disabledProviders: [],
  recentModels: [],
}

describe('model preference projection', () => {
  it('keeps structured pin identity and uses configured provider order before official order', () => {
    const result = sortModelCatalog(snapshot, config)

    expect(result.pinned.map(option => [option.provider, option.model.id])).toEqual([
      ['beta', 'b:one'],
      ['alpha', 'a1'],
    ])
    expect(result.groups.map(group => group.id)).toEqual(['beta', 'alpha', 'gamma'])
    expect(result.groups[1]?.models.map(option => option.model.id)).toEqual(['a2'])
    expect(result.failures).toEqual(snapshot.failures)
    expect(modelKeyFromOptionId(modelOptionId({ provider: 'beta', model: 'b:one' }))).toEqual({
      provider: 'beta',
      model: 'b:one',
    })
  })

  it('hides disabled providers but keeps the active route visible with a warning', () => {
    const disabledSnapshot: ModelCatalogSnapshot = {
      ...snapshot,
      current: { provider: 'beta', model: 'b:one' },
    }
    const result = sortModelCatalog(disabledSnapshot, {
      ...DEFAULT_MODEL_PREFERENCES,
      disabledProviders: ['beta'],
    })

    expect(result.groups.map(group => group.id)).toEqual(['alpha', 'beta', 'gamma'])
    const currentGroup = result.groups.find(group => group.id === 'beta')
    expect(currentGroup?.providerDisabled).toBe(true)
    expect(currentGroup?.models.map(option => option.model.id)).toEqual(['b:one'])
    expect(currentGroup?.models[0]?.current).toBe(true)

    const pinnedCurrent = sortModelCatalog(disabledSnapshot, {
      ...DEFAULT_MODEL_PREFERENCES,
      pinnedModels: [{ provider: 'beta', model: 'b:one' }],
      disabledProviders: ['beta'],
    })
    expect(pinnedCurrent.pinned.map(option => option.model.id)).toEqual(['b:one'])
    expect(pinnedCurrent.groups.find(group => group.id === 'beta')?.models).toHaveLength(0)
  })

  it('retains effort only for the same route and uses the new route default otherwise', () => {
    const sameRoute = selectionForModel({
      provider: 'alpha',
      model: snapshot.groups[0]!.models[1]!,
    }, snapshot.current)
    expect(sameRoute).toEqual({ provider: 'alpha', model: 'a2', reasoningEffort: 'deep' })

    const differentModel = selectionForModel({
      provider: 'alpha',
      model: snapshot.groups[0]!.models[0]!,
    }, snapshot.current)
    expect(differentModel).toEqual({ provider: 'alpha', model: 'a1', reasoningEffort: 'balanced' })

    const newRoute = selectionForModel({
      provider: 'alpha',
      model: snapshot.groups[0]!.models[0]!,
    }, { provider: 'beta', model: 'b:one', reasoningEffort: 'deep' })
    expect(newRoute).toEqual({ provider: 'alpha', model: 'a1', reasoningEffort: 'balanced' })
  })

  it('normalizes bounded preferences, recent history, and provider movement', () => {
    const normalized = normalizeModelPreferences({
      version: 1,
      pinnedModels: [
        { provider: 'alpha', model: 'a1' },
        { provider: 'alpha', model: 'a1' },
        { provider: 'beta', model: 'b:one' },
      ],
      providerOrder: ['beta', 'beta', 'alpha'],
      disabledProviders: ['gamma', 'gamma'],
      recentModels: Array.from({ length: 10 }, (_, index) => ({ provider: 'p', model: `m${index}` })),
    })
    expect(normalized.pinnedModels).toEqual([{ provider: 'alpha', model: 'a1' }, { provider: 'beta', model: 'b:one' }])
    expect(normalized.providerOrder).toEqual(['beta', 'alpha'])
    expect(normalized.disabledProviders).toEqual(['gamma'])
    expect(normalized.recentModels).toHaveLength(8)

    const recent = recordRecentModel(normalized, { provider: 'alpha', model: 'a1' })
    expect(recent.recentModels[0]).toEqual({ provider: 'alpha', model: 'a1' })
    expect(recent.recentModels).toHaveLength(8)

    expect(providerIdsInOrder([
      { id: 'alpha', name: 'Alpha', models: [] },
      { id: 'alpha', name: 'Duplicate', models: [] },
      { id: 'gamma', name: 'Gamma', models: [] },
    ], normalized)).toEqual(['alpha', 'gamma'])
    expect(moveProvider(normalized, 'gamma', -1, ['alpha', 'gamma']).providerOrder).toEqual(['gamma', 'alpha'])
    expect(() => assertModelPreferences({ ...normalized, providerOrder: ['alpha', 'alpha'] })).toThrow()
  })
})
