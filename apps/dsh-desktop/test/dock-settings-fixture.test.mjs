import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { useChineseFixtureLocale } from '../scripts/dock-settings-fixture.mjs'

test('fixture locale registration and document replay are idempotent', async () => {
  const callbacks = []
  const context = { addInitScript: async callback => { callbacks.push(callback) } }
  const app = { context: () => context }
  await useChineseFixtureLocale(app)
  await useChineseFixtureLocale(app)
  assert.equal(callbacks.length, 1)
  const navigator = {}
  const source = `(${callbacks[0].toString()})()`
  runInNewContext(source, { navigator })
  runInNewContext(source, { navigator })
  assert.equal(navigator.language, 'zh-CN')
  assert.deepEqual(Array.from(navigator.languages), ['zh-CN', 'zh'])
})

test('fixture locale replay respects an immutable existing descriptor', async () => {
  let callback
  await useChineseFixtureLocale({ context: () => ({ addInitScript: async value => { callback = value } }) })
  const navigator = {}
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] })
  runInNewContext(`(${callback.toString()})()`, { navigator })
  assert.equal(navigator.language, 'zh-CN')
  assert.deepEqual(navigator.languages, ['zh-CN', 'zh'])
})
