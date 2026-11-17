export const CONTEXT_MEMORY_ISOLATION_BLOCK = 'DSH_CONTEXT_MEMORY_PRINCIPAL_ISOLATION_UNVERIFIED'
const PACKAGE = 'dsh-context-memory'
const REASON = 'dsh-context-memory 1.2.0 的项目记忆在隔离验收中进入了另一用户的模型输入；本轮保持待验收。已有配置与记忆文件保留，核心聊天仍可使用。'

function packageOf(name) {
  if (typeof name !== 'string') return undefined
  if (name === PACKAGE || name.startsWith(`${PACKAGE}/`)) return PACKAGE
  let path = name
  if (name.startsWith('file:')) {
    try { path = decodeURIComponent(new URL(name).pathname) } catch { return undefined }
  }
  return /(?:^|[\\/])node_modules[\\/]dsh-context-memory(?:[\\/]|$)/u.test(path) ? PACKAGE : undefined
}

/** Activation policy remains independent of user-saved enabled intent. */
export function getOptionalContextPluginStatus(name) {
  if (packageOf(name) !== PACKAGE) return undefined
  return Object.freeze({ packageName: PACKAGE, version: '1.2.0', state: 'blocked', code: CONTEXT_MEMORY_ISOLATION_BLOCK, reason: REASON })
}

export function assertOptionalContextPluginActivation(name) {
  const status = getOptionalContextPluginStatus(name)
  if (status === undefined) return
  const error = new Error(status.reason)
  error.code = status.code
  error.packageName = status.packageName
  throw error
}

/** Apply after official patch composition, including every live reload. Never persist these rows. */
export function adaptRuntimeOptionalContextSafety(patches, { onBlocked = status => process.stderr.write(`[desktop] ${status.code}: ${status.reason}\n`) } = {}) {
  const reported = new Set()
  const row = entry => {
    if (entry === null || typeof entry !== 'object') return entry
    const status = getOptionalContextPluginStatus(entry.name)
    if (status !== undefined) {
      if (entry.disabled !== true && !reported.has(status.packageName)) {
        reported.add(status.packageName)
        onBlocked(status)
      }
      return { ...entry, disabled: true, ...(entry.group === true ? { group: false } : {}) }
    }
    if ((entry.group === true || entry.name === 'cordis:group' || entry.name === '@deepseek-ai/cordis-plugin-group') && Array.isArray(entry.config)) {
      return { ...entry, config: entry.config.map(row) }
    }
    return entry
  }
  return patches.map(patch => Array.isArray(patch?.insert) ? { ...patch, insert: patch.insert.map(row) } : row(patch))
}
