import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'

const moduleUrl = new URL('../src/runtime-community-index.mjs', import.meta.url)
const appRequire = createRequire(new URL('../package.json', import.meta.url))
const officialRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh/package.json'))
const { parseMarketIndex, marketInstallTarget } = await import(pathToFileURL(officialRequire.resolve('@deepseek-ai/dsh-plugin-market-index')).href)
const name = '@deepseek-ai/dsh-plugin-market'
const base = indexes => [{ insert: [{ id: 'plugin-market', name, config: { indexes, fetchTimeoutMs: 9000, cacheTtlMs: 111 }, disabled: false }] }]

test('Desktop community index exports its patch adapter', async () => {
  const module = await import(moduleUrl).catch(() => ({}))
  assert.equal(typeof module.adaptDesktopCommunityIndexPatches, 'function')
})

test('official format-1 validator accepts the named pinned catalog and retains license metadata', async () => {
  const { DESKTOP_COMMUNITY_INDEX_URL } = await import(moduleUrl)
  const raw = JSON.parse(await readFile(new URL('../runtime-support/community-plugin-index.json', import.meta.url), 'utf8'))
  const parsed = parseMarketIndex(raw, DESKTOP_COMMUNITY_INDEX_URL)
  assert.equal(parsed.format, 1)
  assert.match(parsed.title.en, /DSH Desktop/)
  assert.equal(parsed.title.zh, '创意工坊')
  assert.deepEqual(parsed.plugins.map(plugin => [plugin.name, plugin.versions[0].version]), [
    ['dsh-context', '0.85.1'],
    ['dsh-prompt-customizer', '2.2.0'],
    ['@michengai/dsh-im-connect', '1.0.44'],
  ])
  for (const plugin of parsed.plugins) {
    assert.ok(plugin.metadata.labels.some(label => label.startsWith('license-')))
    assert.ok(plugin.versions[0].publishTimestamp > 0)
    assert.equal(marketInstallTarget(plugin.name, plugin.versions[0]).spec, `${plugin.name}@${plugin.versions[0].version}`)
  }
  assert.match(parsed.description.en, /dsh-context-memory 1\.2\.0.*blocked/)
})

test('base empty indexes gains the community source and keeps other official Config fields', async () => {
  const { adaptDesktopCommunityIndexPatches, DESKTOP_COMMUNITY_INDEX_URL } = await import(moduleUrl)
  const patches = base([])
  const before = JSON.stringify(patches)
  const row = composeEntries(adaptDesktopCommunityIndexPatches(patches, { layers: [patches, [], [], []] }))[0]
  assert.deepEqual(row.config, { indexes: [DESKTOP_COMMUNITY_INDEX_URL], fetchTimeoutMs: 9000, cacheTtlMs: 111 })
  assert.equal(row.disabled, false)
  assert.equal(JSON.stringify(patches), before)
})

test('user explicit empty indexes in profile, Home or CLI layers stays disabled', async () => {
  const { adaptDesktopCommunityIndexPatches } = await import(moduleUrl)
  for (const layer of [1, 2, 3]) {
    const layers = [base(['https://example.com/official.json']), [], [], []]
    layers[layer] = [{ id: 'plugin-market', config: { indexes: [] } }]
    const row = composeEntries(adaptDesktopCommunityIndexPatches(layers.flat(), { layers }))[0]
    assert.deepEqual(row.config.indexes, [])
  }
})

test('existing index order, user configuration and disabled state survive idempotent adaptation', async () => {
  const { adaptDesktopCommunityIndexPatches, DESKTOP_COMMUNITY_INDEX_URL } = await import(moduleUrl)
  const userPatches = [{ id: 'plugin-market', config: { indexes: ['https://example.com/a.json', 'https://example.com/b.json'], fetchTimeoutMs: 7700 }, disabled: true }]
  const patches = [...base([]), ...userPatches]
  const first = adaptDesktopCommunityIndexPatches(patches, { userPatches })
  const row = composeEntries(first)[0]
  assert.deepEqual(row.config.indexes, ['https://example.com/a.json', 'https://example.com/b.json'])
  assert.equal(row.disabled, true)
  assert.equal(row.config.fetchTimeoutMs, 7700)
  assert.deepEqual(adaptDesktopCommunityIndexPatches(first, { userPatches }), first)
})

test('a saved custom source is restored beside Workshop when Desktop supplies the market rows', async () => {
  const { adaptDesktopCommunityIndexPatches, DESKTOP_COMMUNITY_INDEX_URL } = await import(moduleUrl)
  const custom = 'https://example.invalid/custom-plugin-index.json'
  const userPatches = [{ id: 'plugin-market', config: { indexes: [custom], fetchTimeoutMs: 200 } }]
  const options = { enableWorkshop: true, userPatches }
  const effective = adaptDesktopCommunityIndexPatches(userPatches, options)
  const row = composeEntries(effective).find(entry => entry.id === 'plugin-market')
  assert.deepEqual(row.config, { indexes: [custom, DESKTOP_COMMUNITY_INDEX_URL], fetchTimeoutMs: 200 })
  assert.deepEqual(adaptDesktopCommunityIndexPatches(effective, options), effective)
  assert.deepEqual(userPatches[0].config.indexes, [custom])
  for (const indexes of [[], [custom, DESKTOP_COMMUNITY_INDEX_URL]]) {
    const overrides = [{ id: 'plugin-market', config: { indexes } }]
    const configured = composeEntries(adaptDesktopCommunityIndexPatches(overrides, { enableWorkshop: true, userPatches: overrides }))
    assert.deepEqual(configured.find(entry => entry.id === 'plugin-market').config.indexes, indexes)
  }
})

test('Desktop enables the official Discover source once and uses the bundled Workshop without network', async () => {
  const { adaptDesktopCommunityIndexPatches, DESKTOP_COMMUNITY_INDEX_URL, installDesktopWorkshopIndexFetch } = await import(moduleUrl)
  const options = { enableWorkshop: true }
  const first = adaptDesktopCommunityIndexPatches([], options)
  assert.deepEqual(adaptDesktopCommunityIndexPatches(first, options), first)
  assert.deepEqual(composeEntries(first).map(row => row.id), ['plugin-market', 'ui-plugin-market'])
  const calls = []
  const original = async input => { calls.push(input); return new Response('ordinary fetch') }
  const target = { fetch: original }
  const dispose = installDesktopWorkshopIndexFetch(target)
  try {
    const response = await target.fetch(DESKTOP_COMMUNITY_INDEX_URL)
    assert.equal(parseMarketIndex(await response.json(), DESKTOP_COMMUNITY_INDEX_URL).title.zh, '创意工坊')
    assert.deepEqual(calls, [])
    assert.equal(await (await target.fetch('https://example.com/index.json')).text(), 'ordinary fetch')
    assert.deepEqual(calls, ['https://example.com/index.json'])
  } finally { dispose() }
  assert.equal(target.fetch, original)
})

test('foreign market replacements and independent Web profiles remain untouched', async () => {
  const { adaptDesktopCommunityIndexPatches } = await import(moduleUrl)
  const patches = [...base([]), { id: 'plugin-market', name: 'third-party-market' }]
  assert.deepEqual(adaptDesktopCommunityIndexPatches(patches), patches)
  assert.deepEqual(adaptDesktopCommunityIndexPatches(base([]), { profileName: 'web' }), base([]))
  assert.deepEqual(adaptDesktopCommunityIndexPatches([]), [])
})

test('nested group configuration and disabled carrier are retained by official composition', async () => {
  const { adaptDesktopCommunityIndexPatches, DESKTOP_COMMUNITY_INDEX_URL } = await import(moduleUrl)
  const patches = [{ insert: [{ id: 'optional-group', group: true, disabled: true, config: [{ id: 'plugin-market', name, config: { indexes: [], maxBytes: 98765 } }] }] }]
  const result = composeEntries(adaptDesktopCommunityIndexPatches(patches, { layers: [patches, [], [], []] }))
  assert.equal(result[0].disabled, true)
  assert.equal(result[0].config[0].config.maxBytes, 98765)
  assert.deepEqual(result[0].config[0].config.indexes, [DESKTOP_COMMUNITY_INDEX_URL])
})
