import assert from 'node:assert/strict'
import test from 'node:test'

import { selectCommunityMarketPlugins } from '../src/ui/community-market-view.mjs'

const plugins = [
  { id: 'one', name: 'dsh-one', displayName: 'dsh-one', npm: 'dsh-one', category: 'tools', owner: 'Alice', description: { zh: '浏览器工具' }, downloads: 30, stars: 2, added: '2026-07-01' },
  { id: 'two', name: 'dsh-two', displayName: 'dsh-two', category: 'ui', owner: 'Bob', description: { en: 'Spotlight interface' }, downloads: 4, stars: 20, added: '2026-08-01' },
  { id: 'three', name: 'dsh-three', displayName: 'dsh-three', npm: '@scope/dsh-three', category: 'tools', owner: 'Carol', description: { zh: '终端助手' }, downloads: 12, stars: 8, added: '2026-06-01' },
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

test('market view supports deterministic sort and clamps pagination', () => {
  const newest = selectCommunityMarketPlugins(plugins, { sort: 'newest', page: 99, pageSize: 2 })
  assert.equal(newest.page, 2)
  assert.equal(newest.pages, 2)
  assert.deepEqual(newest.items.map((item) => item.id), ['three'])

  const popular = selectCommunityMarketPlugins(plugins, { sort: 'popular', page: 1, pageSize: 3 })
  assert.deepEqual(popular.items.map((item) => item.id), ['one', 'three', 'two'])
})
