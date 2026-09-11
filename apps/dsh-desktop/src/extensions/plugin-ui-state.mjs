const UI_STATUSES = new Set([
  'normal',
  'update-available',
  'update-incompatible',
  'disabled',
  'needs-attention',
])

const RESOLVED_INCIDENTS = new Set([
  'disabled-by-user',
  'legacy-false-positive-repaired',
  'restored-by-user',
  'restored-by-direct-start',
])

function boundedText(value, fallback = '', limit = 320) {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/gu, ' ').trim()
  return normalized === '' ? fallback : normalized.slice(0, limit)
}

function incidentByPlugin(incidents) {
  const result = new Map()
  for (const incident of Array.isArray(incidents) ? incidents : []) {
    if (RESOLVED_INCIDENTS.has(incident?.resolution)) continue
    const name = boundedText(incident?.pluginName, '', 214)
    if (name !== '' && !result.has(name)) result.set(name, incident)
  }
  return result
}

export function createPluginUIState(plugin, { incident } = {}) {
  if (plugin === null || typeof plugin !== 'object' || typeof plugin.name !== 'string') {
    throw new TypeError('plugin inventory row is invalid')
  }

  const compatibility = plugin.compatibility?.status ?? 'unknown'
  const updateCompatibility = plugin.updateCompatibility?.status ?? 'unknown'
  const runtimeRange = plugin.compatibility?.details?.requirements?.runtime
  const runtimeFailure = compatibility === 'incompatible'
  const pluginFailure = incident !== undefined
  const blockedUpdate = plugin.updateAvailable === true && updateCompatibility === 'incompatible'
  let status = 'normal'
  let statusLabel = ''
  let attention = ''

  if (pluginFailure) {
    status = 'needs-attention'
    statusLabel = '需要处理'
    attention = '插件未能正常启动'
  } else if (runtimeFailure) {
    status = 'needs-attention'
    statusLabel = '需要处理'
    attention = '当前插件版本暂不支持新版 DeepSeek Harness。你的插件数据已经保留。'
  } else if (blockedUpdate) {
    status = 'update-incompatible'
    statusLabel = '新版本暂不兼容'
    attention = '当前版本仍可继续使用。'
  } else if (plugin.enabled === false) {
    status = 'disabled'
    statusLabel = '已停用'
  } else if (plugin.updateAvailable === true) {
    status = 'update-available'
    statusLabel = '可更新'
  }

  if (!UI_STATUSES.has(status)) throw new Error('plugin UI status is invalid')
  return Object.freeze({
    ...plugin,
    displayName: boundedText(plugin.displayName, plugin.name, 160),
    description: boundedText(plugin.description, '此插件暂未提供说明。'),
    publisher: boundedText(plugin.publisher, '社区作者', 120),
    permissions: Object.freeze(Array.isArray(plugin.permissions)
      ? plugin.permissions.filter((item) => typeof item === 'string').slice(0, 12)
      : []),
    installed: true,
    health: pluginFailure ? 'failed' : 'healthy',
    attention,
    status,
    statusLabel,
    updateBlocked: blockedUpdate,
    advanced: Object.freeze({
      compatibility,
      runtimeRange: typeof runtimeRange === 'string' ? runtimeRange : '未声明',
      source: boundedText(plugin.requested, 'Desktop', 240),
      packageName: plugin.name,
      integrity: boundedText(plugin.integrity, '由安装事务校验', 120),
    }),
  })
}

export function createPluginUIStates(plugins, { incidents = [] } = {}) {
  if (!Array.isArray(plugins)) throw new TypeError('plugin inventory must be an array')
  const incidentMap = incidentByPlugin(incidents)
  return Object.freeze(plugins.map((plugin) => createPluginUIState(plugin, {
    incident: incidentMap.get(plugin.name),
  })))
}
