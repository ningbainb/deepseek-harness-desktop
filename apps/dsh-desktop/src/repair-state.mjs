export const REPAIR_STATE_SCHEMA_VERSION = 1

export const DIRECT_STARTUP_STATES = Object.freeze([
  'preparing',
  'starting-full',
  'retrying-full',
  'repairing',
  'verifying',
  'ready-full',
  'ready-builtins',
  'installation-repair-required',
])

const DIRECT_STARTUP_SUMMARIES = Object.freeze({
  preparing: '正在准备应用',
  'starting-full': '正在载入原有数据和全部插件',
  'retrying-full': '正在自动重试启动',
  repairing: '正在自动修复插件',
  verifying: '正在验证修复结果',
  'ready-full': '启动完成',
  'ready-builtins': '已使用内置插件启动',
  'installation-repair-required': '正在修复应用安装',
})

/** Project internal startup progress into a fixed, non-interactive view. */
export function projectDirectStartupState(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('direct startup state input must be an object')
  }
  if (!DIRECT_STARTUP_STATES.includes(input.state)) {
    throw new TypeError('invalid startup state')
  }
  return Object.freeze({
    schemaVersion: REPAIR_STATE_SCHEMA_VERSION,
    state: input.state,
    summary: DIRECT_STARTUP_SUMMARIES[input.state],
    interactive: false,
  })
}
