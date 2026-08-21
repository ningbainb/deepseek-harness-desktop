import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMUNITY_MARKET_URL,
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
  assert.equal(result.count, 4)
  assert.deepEqual(result.categories, [
    { id: 'tools', label: { zh: '工具', en: 'Tools' } },
    { id: 'ui', label: { zh: '界面', en: 'Interface' } },
  ])
  assert.equal(result.plugins[0].installSpec, 'dsh-status-rotator')
  assert.equal(result.plugins[0].sourceKind, 'npm')
  assert.equal(result.plugins[1].installSpec, 'github:0xsline/dsh-spotlight')
  assert.equal(result.plugins[1].sourceKind, 'github')
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
  await assert.rejects(service.resolveInstall('unknown-entry'), /community market plugin identifier/u)
})

test('community market revalidates a successful response with its ETag', async () => {
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
  assert.equal(headers[0]['if-none-match'], undefined)
  assert.equal(headers[1]['if-none-match'], '"catalog-1"')
  assert.deepEqual(second, first)
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
  await assert.rejects(service.list(), /community market catalog unavailable: offline/u)
})
