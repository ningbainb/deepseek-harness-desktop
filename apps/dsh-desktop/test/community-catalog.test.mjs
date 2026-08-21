import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMUNITY_PLUGIN_CATALOG,
  resolveCommunityPluginUrl,
} from '../src/extensions/community-catalog.mjs'

test('community highlights retain only repository links outside the native market', () => {
  assert.deepEqual(COMMUNITY_PLUGIN_CATALOG, [
    {
      id: 'dsh-taffy-pet',
      name: 'dsh-taffy-pet',
      author: 'zq123123667',
      description: '桌面宠物社区插件。请前往作者仓库查看功能、素材条款与安装说明。',
      repository: 'https://github.com/zq123123667/dsh-taffy-pet',
      enabled: false,
      installable: false,
    },
  ])
})

test('community repository resolution accepts only catalog identifiers', () => {
  assert.equal(
    resolveCommunityPluginUrl('dsh-taffy-pet'),
    'https://github.com/zq123123667/dsh-taffy-pet',
  )
  for (const invalid of ['', 'unknown', 'https://example.com', '../dsh-taffy-pet']) {
    assert.throws(() => resolveCommunityPluginUrl(invalid), /community plugin identifier/u)
  }
})
