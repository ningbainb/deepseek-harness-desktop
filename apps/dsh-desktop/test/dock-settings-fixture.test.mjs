import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { openDockSetting, useChineseFixtureLocale } from '../scripts/dock-settings-fixture.mjs'

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

test('market acceptance opens its retained Skills group before clicking the nested market tab after restart', async () => {
  const clicked = []
  const locator = selector => ({
    first() { return this },
    async waitFor() {},
    async click() {
      if (selector === '#skill-market-tab') assert.ok(clicked.includes('#skills-tab'), 'nested market tab is initially outside the selected group')
      clicked.push(selector)
    },
  })
  const dock = { url: () => 'file:///fixture/extensions.html', locator }
  const settings = { url: () => 'dsh-runtime://app/?desktop-dock-setting=skill-market', locator, async waitForFunction() {} }
  const app = { windows: () => [dock, settings], context: () => ({ async addInitScript() {} }) }
  assert.deepEqual(await openDockSetting(app, {}, 'skill-market'), { dock, settings })
  assert.deepEqual(clicked, ['#skills-tab', '#skill-market-tab'])
})
