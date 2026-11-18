import assert from 'node:assert/strict'
import test from 'node:test'

import {
  communityMarketFailureMessage,
  communityMarketInstallPresentation,
  selectCommunityMarketPlugins,
} from '../src/ui/community-market-view.mjs'

const plugins = [
  { id: 'one', name: 'dsh-one', displayName: 'dsh-one', npm: 'dsh-one', category: 'tools', owner: 'Alice', description: { zh: '浏览器工具' }, downloads: 30, stars: 2, added: '2026-07-01' },
  { id: 'two', name: 'dsh-two', displayName: 'dsh-two', category: 'ui', owner: 'Bob', description: { en: 'Spotlight interface' }, downloads: 4, stars: 20, added: '2026-08-01' },
  { id: 'three', name: 'dsh-three', displayName: 'dsh-three', npm: '@scope/dsh-three', installSpec: '@scope/dsh-three@1.2.3', category: 'tools', owner: 'Carol', description: { zh: '终端助手' }, downloads: 12, stars: 8, added: '2026-06-01' },
]

test('market view searches localized fields, filters categories, and marks installed packages', () => {
  const result = selectCommunityMarketPlugins(plugins, {
    query: '浏览器',
    category: 'tools',
    sort: 'popular',
    page: 1,
    pageSize: 20,
    installed: new Set(['dsh-one']),
  })

  assert.equal(result.total, 1)
  assert.equal(result.items[0].id, 'one')
  assert.equal(result.items[0].installed, true)
})

test('market search matches a scoped package and the exact displayed version', () => {
  for (const query of ['@scope/dsh-three', '@scope/dsh-three@1.2.3', '1.2.3']) {
    assert.deepEqual(selectCommunityMarketPlugins(plugins, { query }).items.map((item) => item.id), ['three'])
  }
})

test('market failures keep source and recovery language accurate without exposing error payloads', () => {
  const proxy = new Error('Error invoking remote method: community market catalog unavailable: proxy')
  assert.match(communityMarketFailureMessage(proxy, 'curated'), /市场代理.*本版精选/u)
  assert.match(communityMarketFailureMessage(new Error('community market catalog unavailable: timeout'), 'cache'), /超时.*上次成功/u)
  const secret = communityMarketFailureMessage(new Error('https://user:secret@example.invalid'))
  assert.doesNotMatch(secret, /secret|example\.invalid/u)
  assert.match(secret, /已安装插件仍可管理/u)
})

test('market view supports deterministic sort and clamps pagination', () => {
  const newest = selectCommunityMarketPlugins(plugins, { sort: 'newest', page: 99, pageSize: 2 })
  assert.equal(newest.page, 2)
  assert.equal(newest.pages, 2)
  assert.deepEqual(newest.items.map((item) => item.id), ['three'])

  const popular = selectCommunityMarketPlugins(plugins, { sort: 'popular', page: 1, pageSize: 3 })
  assert.deepEqual(popular.items.map((item) => item.id), ['one', 'three', 'two'])
})

test('market install presentation gives immediate, durable progress and retry states', () => {
  assert.deepEqual(communityMarketInstallPresentation({ phase: 'installing' }), {
    kind: 'installing',
    label: '安装中…',
    status: '正在下载并安装；完成后会自动刷新。',
    disabled: true,
  })
  assert.deepEqual(communityMarketInstallPresentation({ phase: 'error' }), {
    kind: 'error',
    label: '重试',
    status: '安装失败，原配置已恢复。可重试或导出诊断。',
    disabled: false,
  })
  assert.deepEqual(communityMarketInstallPresentation({ installed: true, phase: 'installing' }), {
    kind: 'installed',
    label: '已安装',
    status: '插件已安装并通过启动检查。',
    disabled: true,
  })
})
