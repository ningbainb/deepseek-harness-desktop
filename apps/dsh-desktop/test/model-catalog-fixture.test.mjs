import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { assertModelCatalogProjection, createModelPreferencesFixture } from '../scripts/model-catalog-fixture.mjs'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const baseRequire = createRequire(desktopRequire.resolve('@deepseek-ai/dsh-base/package.json'))
const adapterEntry = baseRequire.resolve('@deepseek-ai/dsh-llm-deepseek-api-key')
const adapterRequire = createRequire(adapterEntry)
const deepseek = await import(pathToFileURL(adapterEntry).href)
const { Context } = await import(pathToFileURL(adapterRequire.resolve('@deepseek-ai/cordis')).href)
const { ModelListingCache } = await import(pathToFileURL(adapterRequire.resolve('@deepseek-ai/dsh-llm-deepseek')).href)

async function discoverDeepseekModels(context, fixture, withCredential = true) {
  const offlineFetch = context.mock.method(globalThis, 'fetch', () => { throw new Error('fixture catalog discovery must stay offline') })
  // No replacement implementation: Node's mock calls the real SDK disposer.
  const disposal = context.mock.method(ModelListingCache.prototype, 'dispose')
  let adapter
  const environment = withCredential ? fixture.environment : {}
  const credentials = { resolve: async reference => environment[reference] === undefined
    ? undefined : { value: environment[reference], source: 'env' } }
  const ctx = new Context()
  ctx.provide('credentials', credentials)
  ctx.provide('llm', {
    registerConfigurableProviders: () => {},
    registerAdapter: (providers, registered) => {
      assert.deepEqual(providers, ['deepseek-official'])
      adapter = registered
      return { replace: () => {} }
    },
  })
  let activated = false
  try {
    deepseek.apply(ctx, deepseek.Config(fixture.settings['llm-deepseek'] ?? {}))
    activated = true
    assert.equal(disposal.mock.callCount(), 0, 'Keep the real listing cache alive until discovery settles')
    return await adapter.listModels('deepseek-official')
  } finally {
    await ctx.fiber.dispose()
    if (activated) {
      assert.equal(disposal.mock.callCount(), 1, 'Real Context teardown must execute the SDK listing disposer')
      const listing = disposal.mock.calls[0].this
      assert.ok(listing instanceof ModelListingCache)
      const before = listing.current()
      await ctx.fiber.dispose()
      assert.equal(disposal.mock.callCount(), 1, 'Repeated teardown must not replay the disposer')
      assert.deepEqual(await listing.view({ url: 'http://127.0.0.1:9/models', timeoutMs: 100, maxAgeMs: 0 }), before,
        'A disposed cache must not load or change its last published view')
      assert.equal(offlineFetch.mock.callCount(), 0, 'Discovery and post-disposal access must remain offline')
    }
  }
}

const catalog = count => ({ id: 'openai-codex', models: Array.from({ length: count }, (_, index) => ({ id: `model-${index}` })) })

for (const count of [8, 9]) {
  test(`model preferences renders every model from the authoritative ${count}-model catalog`, () => {
    const group = catalog(count)
    assert.doesNotThrow(() => assertModelCatalogProjection(group.models.map(model => model.id), group))
  })
}

test('a nine-model SDK catalog cannot silently lose one preference row', () => {
  const group = catalog(9)
  assert.throws(() => assertModelCatalogProjection(group.models.slice(0, 8).map(model => model.id), group))
})

test('equal row counts cannot conceal an unknown or duplicate model', () => {
  const group = catalog(8)
  const modelIds = group.models.map(model => model.id)
  assert.throws(() => assertModelCatalogProjection([...modelIds.slice(0, 7), 'unregistered-model'], group))
  assert.throws(() => assertModelCatalogProjection([...modelIds.slice(0, 7), modelIds[0]], group))
})

test('missing, empty and ambiguous backend catalogs cannot establish a passing projection', () => {
  assert.throws(() => assertModelCatalogProjection([], undefined))
  assert.throws(() => assertModelCatalogProjection([], catalog(0)))
  assert.throws(() => assertModelCatalogProjection(Array(8).fill('duplicate'), { id: 'openai-codex', models: Array.from({ length: 8 }, () => ({ id: 'duplicate' })) }))
})

test('model-preference fixture retains relay and supplies an isolated DeepSeek credential reference', () => {
  const fixture = createModelPreferencesFixture()
  assert.deepEqual(fixture.settings['llm-deepseek'], {
    apiKeyEnv: 'DSH_MODEL_PREFS_DEEPSEEK_KEY', baseURL: 'http://127.0.0.1:9/anthropic',
  })
  assert.equal(fixture.environment.DSH_MODEL_PREFS_DEEPSEEK_KEY, 'synthetic-model-preferences-key')
  assert.equal(fixture.environment.PROJECT_RELAY_API_KEY, 'model-preferences-test-key')
  assert.equal(fixture.settings['llm-pi-ai'].providers['project-relay'].apiKeyEnv, 'PROJECT_RELAY_API_KEY')
  assert.deepEqual(fixture.settings['llm-pi-ai'].providers['project-relay'].models,
    [{ id: 'model-preferences-test', name: 'bai 测试模型' }])
})

test('the official API-key schema accepts the fixture reference and loopback endpoint', () => {
  const fixture = createModelPreferencesFixture()
  const config = deepseek.Config(fixture.settings['llm-deepseek'] ?? {})
  const options = deepseek.resolveAdapterOptions(deepseek.plainOptions(config), { get: () => undefined })
  assert.equal(options.apiKeyEnv, 'DSH_MODEL_PREFS_DEEPSEEK_KEY')
  assert.equal(options.baseURL, 'http://127.0.0.1:9/anthropic')
  assert.ok(options.models.length > 0)
  assert.equal(Object.hasOwn(fixture.settings['llm-deepseek'] ?? {}, 'apiKey'), false)
})

test('the fixture declares the initial provider order while preserving fresh preference controls', () => {
  assert.deepEqual(createModelPreferencesFixture().settings['ui-model-preferences'], {
    version: 1,
    pinnedModels: [],
    providerOrder: ['project-relay', 'openai-codex', 'deepseek-official'],
    disabledProviders: [],
    recentModels: [],
  })
})

test('the official adapter advertises DeepSeek models with only the synthetic fixture credential', async context => {
  const models = await discoverDeepseekModels(context, createModelPreferencesFixture())
  assert.ok(models.length > 0, 'the isolated fixture must expose DeepSeek for provider ordering and disabling')
  assert.ok(models.every(model => typeof model.id === 'string' && model.id.length > 0))
})

test('without the fixture credential the official adapter still advertises no DeepSeek models', async context => {
  assert.deepEqual(await discoverDeepseekModels(context, createModelPreferencesFixture(), false), [])
})
