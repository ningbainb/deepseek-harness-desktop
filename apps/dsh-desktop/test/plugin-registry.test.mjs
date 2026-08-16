import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NPM_REGISTRY_ORIGIN,
  PluginRegistry,
  registryManifestUrl,
} from '../src/extensions/plugin-registry.mjs'

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 404, json: async () => body }
}

test('registry URLs stay on the fixed npm origin and encode scoped names', () => {
  assert.equal(NPM_REGISTRY_ORIGIN, 'https://registry.npmjs.org')
  assert.equal(
    registryManifestUrl('@community/example', 'latest'),
    'https://registry.npmjs.org/%40community%2Fexample/latest',
  )
  assert.throws(() => registryManifestUrl('../escape', 'latest'), /package name/u)
  assert.throws(() => registryManifestUrl('example', '../../metadata'), /package version/u)
})

test('registry validates returned package identity and exact semantic version', async () => {
  const registry = new PluginRegistry({
    fetchImpl: async () => response({ name: '@community/other', version: '1.2.3' }),
  })
  await assert.rejects(registry.fetchManifest('@community/example'), /identity/u)

  const invalid = new PluginRegistry({
    fetchImpl: async () => response({ name: '@community/example', version: 'latest' }),
  })
  await assert.rejects(invalid.fetchManifest('@community/example'), /version/u)
})

test('registry caches successful manifests until the bounded TTL expires', async () => {
  let now = 1_000
  let calls = 0
  const registry = new PluginRegistry({
    now: () => now,
    cacheTtlMs: 500,
    fetchImpl: async () => {
      calls += 1
      return response({ name: '@community/example', version: '1.2.3' })
    },
  })
  assert.equal((await registry.fetchManifest('@community/example')).version, '1.2.3')
  await registry.fetchManifest('@community/example')
  assert.equal(calls, 1)
  now += 501
  await registry.fetchManifest('@community/example')
  assert.equal(calls, 2)
})

test('multi-package checks preserve order and cap registry concurrency at four', async () => {
  let active = 0
  let maxActive = 0
  const registry = new PluginRegistry({
    concurrency: 4,
    fetchImpl: async (url) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 8))
      active -= 1
      const encoded = new URL(url).pathname.split('/')[1]
      const name = decodeURIComponent(encoded)
      return response({ name, version: '2.0.0' })
    },
  })
  const names = Array.from({ length: 11 }, (_, index) => `plugin-${index}`)
  const results = await registry.check(names)
  assert.deepEqual(results.map((item) => item.name), names)
  assert.equal(results.every((item) => item.manifest?.version === '2.0.0'), true)
  assert.equal(maxActive, 4)
})

test('registry failures become bounded per-package unavailable results', async () => {
  const registry = new PluginRegistry({
    fetchImpl: async () => { throw new Error('network failed with secret diagnostic') },
  })
  assert.deepEqual(await registry.check(['example']), [{ name: 'example', error: 'unavailable' }])

  const missing = new PluginRegistry({ fetchImpl: async () => response({}, false) })
  await assert.rejects(missing.fetchManifest('example'), /HTTP 404/u)
})
