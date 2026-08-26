const MARKET_SORTS = new Set(['popular', 'newest', 'name'])

export function communityMarketInstallPresentation({ installed = false, phase = 'idle' } = {}) {
  if (installed) {
    return Object.freeze({
      kind: 'installed',
      label: '已安装',
      status: '插件已安装并通过启动检查。',
      disabled: true,
    })
  }
  if (phase === 'installing') {
    return Object.freeze({
      kind: 'installing',
      label: '安装中…',
      status: '正在下载并安装；完成后会自动刷新。',
      disabled: true,
    })
  }
  if (phase === 'error') {
    return Object.freeze({
      kind: 'error',
      label: '重试',
      status: '安装失败，原配置已恢复。可重试或导出诊断。',
      disabled: false,
    })
  }
  return Object.freeze({ kind: 'idle', label: '安装', status: '', disabled: false })
}

function searchableText(plugin) {
  return [
    plugin.name,
    plugin.displayName,
    plugin.owner,
    plugin.category,
    plugin.description?.zh,
    plugin.description?.en,
  ].filter((value) => typeof value === 'string').join('\n').toLocaleLowerCase('zh-CN')
}

function numeric(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function compareName(left, right) {
  return String(left.displayName ?? left.name).localeCompare(String(right.displayName ?? right.name), 'en')
}

function isInstalled(plugin, installed) {
  return [plugin.npm, plugin.name, plugin.displayName, plugin.installSpec]
    .some((value) => typeof value === 'string' && installed.has(value))
}

export function selectCommunityMarketPlugins(plugins, {
  query = '',
  category = 'all',
  sort = 'popular',
  page = 1,
  pageSize = 20,
  installed = new Set(),
} = {}) {
  if (!Array.isArray(plugins)) throw new TypeError('community market plugins must be an array')
  if (!(installed instanceof Set)) throw new TypeError('installed community packages must be a Set')
  const normalizedQuery = typeof query === 'string' ? query.trim().toLocaleLowerCase('zh-CN').slice(0, 200) : ''
  const normalizedCategory = typeof category === 'string' ? category : 'all'
  const normalizedSort = MARKET_SORTS.has(sort) ? sort : 'popular'
  const normalizedPageSize = Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20

  const filtered = plugins.filter((plugin) => {
    if (plugin === null || typeof plugin !== 'object') return false
    if (normalizedCategory !== 'all' && plugin.category !== normalizedCategory) return false
    return normalizedQuery === '' || searchableText(plugin).includes(normalizedQuery)
  })
  filtered.sort((left, right) => {
    if (normalizedSort === 'newest') {
      return String(right.added ?? '').localeCompare(String(left.added ?? ''), 'en') || compareName(left, right)
    }
    if (normalizedSort === 'name') return compareName(left, right)
    return numeric(right.downloads) - numeric(left.downloads)
      || numeric(right.stars) - numeric(left.stars)
      || compareName(left, right)
  })

  const pages = Math.max(1, Math.ceil(filtered.length / normalizedPageSize))
  const requestedPage = Number.isSafeInteger(page) ? page : 1
  const normalizedPage = Math.min(Math.max(requestedPage, 1), pages)
  const start = (normalizedPage - 1) * normalizedPageSize
  const items = filtered.slice(start, start + normalizedPageSize).map((plugin) => Object.freeze({
    ...plugin,
    installed: isInstalled(plugin, installed),
  }))

  return Object.freeze({
    items: Object.freeze(items),
    total: filtered.length,
    page: normalizedPage,
    pages,
  })
}
