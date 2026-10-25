import assert from 'node:assert/strict'

export function createModelPreferencesFixture() {
  return {
    settings: {
      'ui-model-preferences': {
        version: 1,
        pinnedModels: [],
        providerOrder: ['project-relay', 'openai-codex', 'deepseek-official'],
        disabledProviders: [],
        recentModels: [],
      },
      'llm-deepseek': {
        apiKeyEnv: 'DSH_MODEL_PREFS_DEEPSEEK_KEY',
        baseURL: 'http://127.0.0.1:9/anthropic',
      },
      'llm-pi-ai': {
        providers: {
          'project-relay': {
            baseURL: 'https://api.1521003.xyz/v1',
            apiKeyEnv: 'PROJECT_RELAY_API_KEY',
            api: 'openai-completions',
            displayName: 'bai供应商',
            models: [{ id: 'model-preferences-test', name: 'bai 测试模型' }],
          },
        },
      },
    },
    environment: {
      PROJECT_RELAY_API_KEY: 'model-preferences-test-key',
      DSH_MODEL_PREFS_DEEPSEEK_KEY: 'synthetic-model-preferences-key',
    },
  }
}

export function assertModelCatalogProjection(modelIds, group) {
  assert.ok(group && typeof group.id === 'string' && Array.isArray(group.models), 'the native provider catalog must be available')
  const expectedIds = group.models.map(model => model.id)
  assert.ok(expectedIds.length >= 2, 'the catalog must support the two-model pinning acceptance')
  assert.ok(expectedIds.every(identifier => typeof identifier === 'string' && identifier.length > 0), 'native model identifiers must be non-empty strings')
  assert.equal(new Set(expectedIds).size, expectedIds.length, 'the native provider catalog must not contain duplicate identifiers')
  assert.deepEqual(modelIds.toSorted(), expectedIds.toSorted(), 'preferences must render every native model exactly once without unknown rows')
}
