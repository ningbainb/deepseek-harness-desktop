const TAFFY_PET_REPOSITORY = 'https://github.com/zq123123667/dsh-taffy-pet'

export const COMMUNITY_PLUGIN_CATALOG = Object.freeze([
  Object.freeze({
    id: 'dsh-taffy-pet',
    name: 'dsh-taffy-pet',
    author: 'zq123123667',
    description: '桌面宠物社区插件。请前往作者仓库查看功能、素材条款与安装说明。',
    repository: TAFFY_PET_REPOSITORY,
    enabled: false,
    installable: false,
  }),
])

const COMMUNITY_PLUGIN_URLS = new Map(
  COMMUNITY_PLUGIN_CATALOG.map(({ id, repository }) => [id, repository]),
)

export function resolveCommunityPluginUrl(id) {
  if (typeof id !== 'string' || !COMMUNITY_PLUGIN_URLS.has(id)) {
    throw new TypeError('invalid community plugin identifier')
  }
  return COMMUNITY_PLUGIN_URLS.get(id)
}


