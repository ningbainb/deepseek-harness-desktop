import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMUNITY_MARKET_URL,
  DSHMARKET_CATALOG_BRIDGE,
  createCommunityMarketService,
} from '../src/extensions/community-market.mjs'

const catalog = {
  updated: '2026-08-21',
  count: 5,
  categories: {
    ui: { zh: '界面', en: 'Interface' },
    tools: { zh: '工具', en: 'Tools' },
  },
  plugins: [
    {
      name: 'dsh-status-rotator',
      owner: '01Virex',
      npm: 'dsh-status-rotator',
      url: 'https://github.com/01Virex/dsh-status-rotator',
      category: 'ui',
      description: { zh: '轮换状态栏内容。', en: 'Rotate status bar content.' },
      stars: 16,
      downloads: 92,
      added: '2026-07-01',
      install: 'ignored command text',
    },
    {
      name: 'dsh-spotlight',
      owner: '0xsline',
      url: 'https://github.com/0xsline/dsh-spotlight',
      category: 'ui',
      description: { zh: '快速启动。' },
      stars: 8,
      added: '2026-07-02',
      install: 'ignored command text',
    },
    {
      name: 'dshmarket',
      owner: 'dsh-market',
      npm: 'dshmarket',
      url: 'https://github.com/dsh-market/dsh-market',
      category: 'tools',
      description: { zh: '旧市场运行时。' },
      install: 'ignored command text',
    },
    {
      name: 'dsh-web-ui#packages/dsh-web-ui-all',
      owner: 'linxin666',
      url: 'https://github.com/linxin666/dsh-web-ui/tree/main/packages/dsh-web-ui-all',
      category: 'tools',
      description: { en: 'Aggregate UI package.' },
      added: '2026-07-03',
      install: 'ignored command text',
    },
    {
      name: 'dsh-spotlight',
      owner: 'another-author',
      npm: '@another/dsh-spotlight',
      url: 'https://github.com/another-author/dsh-spotlight',
      category: 'tools',
      description: { en: 'A distinct plugin with the same catalog name.' },
      deprecated: true,
      replacement: 'better-spotlight',
      added: '2026-07-04',
      install: 'ignored command text',
    },
  ],
}

function jsonResponse(value, { status = 200, headers = {} } = {}) {
  return new Response(status === 304 ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

test('community market projects bounded catalog data and derives install sources', async () => {
  const requests = []
  const service = createCommunityMarketService({
    fetch: async (url, options) => {
      requests.push([url, options])
      return jsonResponse(catalog, { headers: { etag: '"catalog-1"' } })
    },
  })

  const result = await service.list()
  assert.equal(requests[0][0], COMMUNITY_MARKET_URL)
  assert.equal(result.updated, '2026-08-21')
  assert.equal(result.count, 5)
  assert.deepEqual(result.bridge, DSHMARKET_CATALOG_BRIDGE)
  assert.deepEqual(result.bridge, {
    provider: 'dshmarket',
    catalog: 'awesome-dsh-plugin',
    installation: 'desktop-managed',
  })
  assert.deepEqual(result.categories, [
    { id: 'notify', label: { zh: '消息通知', en: 'Notifications' } },
    { id: 'tools', label: { zh: '工具', en: 'Tools' } },
    { id: 'ui', label: { zh: '界面', en: 'Interface' } },
  ])
  assert.equal(result.plugins[0].installSpec, 'dsh-status-rotator')
  assert.equal(result.plugins[0].sourceKind, 'npm')
  assert.equal(result.plugins[0].verification, 'registry')
  assert.equal(result.plugins[1].installSpec, 'github:0xsline/dsh-spotlight')
  assert.equal(result.plugins[1].sourceKind, 'github')
  assert.equal(result.plugins[1].verification, 'required')
  assert.equal(
    result.plugins[2].installSpec,
    'github:linxin666/dsh-web-ui#path:/packages/dsh-web-ui-all',
  )
  assert.equal(result.plugins[2].displayName, 'dsh-web-ui-all')
  assert.equal(result.plugins[3].deprecated, true)
  assert.equal(result.plugins[3].replacement, 'better-spotlight')
  assert.equal(result.plugins.some((plugin) => plugin.npm === 'dshmarket'), false)
  assert.notEqual(result.plugins[1].id, result.plugins[3].id)
  assert.equal(await service.resolveInstall(result.plugins[2].id), result.plugins[2].installSpec)
  assert.deepEqual(await service.resolveInstallEntry(result.plugins[1].id), {
    id: result.plugins[1].id,
    name: result.plugins[1].name,
    sourceKind: 'github',
    installSpec: result.plugins[1].installSpec,
  })
  service.recordVerification(result.plugins[1].id, {
    verification: 'incompatible',
    failureCategory: 'legacy-sdk-incompatible',
  })
  const verified = await service.list()
  assert.equal(verified.plugins[1].verification, 'incompatible')
  assert.equal(verified.plugins[1].failureCategory, 'legacy-sdk-incompatible')
  await assert.rejects(service.resolveInstall('unknown-entry'), /community market plugin identifier/u)
})

test('market discovery retains one pinned IM Connect trial and stages its exact npm release', async () => {
  const service = createCommunityMarketService({
    fetch: async () => jsonResponse({
      ...catalog,
      plugins: [
        ...catalog.plugins,
        { name: 'dsh-im-connect', npm: '@michengai/dsh-im-connect', url: 'https://github.com/MichengAI/dsh-im-connect', downloads: 25 },
        { name: 'im-connect-github', url: 'https://github.com/michengai/dsh-im-connect' },
      ],
    }),
  })
  const result = await service.list()
  const cards = result.plugins.filter((plugin) => plugin.repository?.toLowerCase() === 'michengai/dsh-im-connect')
  assert.equal(cards.length, 1)
  const [plugin] = cards
  assert.equal(plugin.npm, '@michengai/dsh-im-connect')
  assert.match(plugin.description.zh, /飞书.*需/u)
  assert.equal(plugin.downloads, 25)
  assert.equal(plugin.verification, 'registry')
  assert.deepEqual(await service.resolveInstallEntry(plugin.id), {
    id: plugin.id,
    name: '@michengai/dsh-im-connect',
    sourceKind: 'npm',
    installSpec: '@michengai/dsh-im-connect@1.0.53',
  })
})

test('packaged discovery is available and resolves its exact pin before any remote request', async () => {
  let calls = 0
  const service = createCommunityMarketService({
    fetch: async () => {
      calls += 1
      throw new Error('net::ERR_PROXY_CONNECTION_FAILED')
    },
  })

  const curated = service.listAvailable()
  assert.equal(curated.source, 'curated')
  assert.equal(curated.count, 1)
  assert.ok(curated.plugins.every((plugin) => plugin.sourceKind === 'npm'))
  assert.equal(await service.resolveInstall(curated.plugins[0].id), '@michengai/dsh-im-connect@1.0.53')
  assert.equal(calls, 0)
  await assert.rejects(service.list(), /community market catalog unavailable: proxy/u)
  assert.deepEqual(service.listAvailable(), curated)
  assert.equal(calls, 1)
})

test('last successfully validated catalog remains available when refreshing fails', async () => {
  let fail = false
  const service = createCommunityMarketService({
    fetch: async () => {
      if (fail) throw new Error('offline: https://user:private-password@example.invalid')
      return jsonResponse(catalog)
    },
  })

  const first = await service.list()
  assert.equal(first.source, 'community')
  fail = true
  await assert.rejects(service.list({ force: true }), (error) => {
    assert.match(error.message, /community market catalog unavailable: network/u)
    assert.doesNotMatch(error.message, /private-password/u)
    return true
  })
  assert.deepEqual(service.listAvailable(), { ...first, source: 'cache' })
})

test('community market serves a bounded cache and force-revalidates with its ETag', async () => {
  const headers = []
  let calls = 0
  const service = createCommunityMarketService({
    fetch: async (_url, options) => {
      headers.push(options.headers)
      calls += 1
      return calls === 1
        ? jsonResponse(catalog, { headers: { etag: '"catalog-1"' } })
        : jsonResponse(undefined, { status: 304 })
    },
  })

  const first = await service.list()
  const second = await service.list()
  assert.equal(calls, 1)
  const revalidated = await service.list({ force: true })
  assert.equal(headers[0]['if-none-match'], undefined)
  assert.equal(headers[1]['if-none-match'], '"catalog-1"')
  assert.deepEqual(second, first)
  assert.deepEqual(revalidated, first)
})

test('community market deduplicates concurrent reads', async () => {
  let calls = 0
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const service = createCommunityMarketService({
    fetch: async () => {
      calls += 1
      await pending
      return jsonResponse(catalog)
    },
  })

  const first = service.list()
  const second = service.list()
  assert.equal(calls, 1)
  release()
  assert.deepEqual(await second, await first)
  assert.equal(calls, 1)
})

test('community market rejects empty, malformed, and oversized catalogs', async () => {
  const empty = createCommunityMarketService({
    fetch: async () => jsonResponse({ updated: '2026-08-21', count: 1, categories: {}, plugins: [{ name: '../bad' }] }),
  })
  await assert.rejects(empty.list(), /catalog contains no installable plugins/u)

  const malformed = createCommunityMarketService({
    fetch: async () => new Response('{', { status: 200 }),
  })
  await assert.rejects(malformed.list(), /catalog JSON is invalid/u)

  const oversized = createCommunityMarketService({
    maxBytes: 32,
    fetch: async () => jsonResponse(catalog, { headers: { 'content-length': '200' } }),
  })
  await assert.rejects(oversized.list(), /catalog response is too large/u)
})

test('community market accepts the current catalog size and cancels oversized streams', async () => {
  const currentSize = createCommunityMarketService({
    fetch: async () => jsonResponse(catalog, { headers: { 'content-length': '16544482' } }),
  })
  assert.equal((await currentSize.list()).count, 5)

  let cancelled = false
  let chunks = 0
  const oversized = createCommunityMarketService({
    maxBytes: 32,
    fetch: async () => new Response(new ReadableStream({
      pull(controller) {
        if (chunks < 3) controller.enqueue(new Uint8Array(33))
        else controller.close()
        chunks += 1
      },
      cancel() { cancelled = true },
    })),
  })
  await assert.rejects(oversized.list(), /catalog response is too large/u)
  assert.equal(cancelled, true)
})

test('community market does not substitute stale data after a network failure', async () => {
  let fail = false
  const service = createCommunityMarketService({
    fetch: async () => {
      if (fail) throw new Error('offline')
      return jsonResponse(catalog, { headers: { etag: '"catalog-1"' } })
    },
  })

  await service.list()
  fail = true
  await assert.rejects(service.list({ force: true }), /community market catalog unavailable: network/u)
})
