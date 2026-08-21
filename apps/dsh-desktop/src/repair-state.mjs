import { createHash } from 'node:crypto'

export const REPAIR_STATE_SCHEMA_VERSION = 1

export const REPAIR_MODES = Object.freeze([
  'normal',
  'free-shell',
  'free-safe-workbench',
  'free-full-user',
])

export const REPAIR_CATEGORIES = Object.freeze([
  'startup-preparing',
  'external-tool-missing',
  'packaged-dependency-missing',
  'runtime-integrity-failed',
  'runtime-unavailable',
  'profile-loader-failure',
  'migration-blocked',
  'migration-interrupted',
  'plugin-incompatible',
  'plugin-startup-failure',
  'network-degraded',
  'unknown',
])

export const REPAIR_ACTION_IDS = Object.freeze([
  'enter-free-mode',
  'revoke-external-plugin-trust',
  'retry-runtime',
  'verify-installation',
  'install-managed-git',
  'enter-safe-mode',
  'restore-plugin-snapshot',
  'restore-baseline',
  'continue-migration',
  'rollback-migration',
  'export-diagnostics',
  'open-logs',
  'exit',
])

const CATEGORY_DETAILS = Object.freeze({
  'startup-preparing': Object.freeze({
    summary: '正在准备本地 Desktop 启动环境；此修复界面会保持可用。',
    // A fully isolated Free Mode session never rewrites the original Profile.
    // Once Electron main has prepared its callback, expose it even while a
    // slow preflight is still running so users are not left with wait/exit as
    // their only choices.
    actions: Object.freeze(['open-logs', 'enter-free-mode', 'exit']),
  }),
  'external-tool-missing': Object.freeze({
    summary: '一个可选的本地工具不可用；Desktop 本地界面仍可使用。',
    actions: Object.freeze(['install-managed-git', 'retry-runtime', 'export-diagnostics', 'open-logs', 'enter-free-mode', 'exit']),
  }),
  'packaged-dependency-missing': Object.freeze({
    summary: 'Desktop Runtime 的安装文件不完整，不能安全启动 Runtime。',
    actions: Object.freeze(['verify-installation', 'export-diagnostics', 'open-logs', 'enter-free-mode', 'exit']),
  }),
  'runtime-integrity-failed': Object.freeze({
    summary: 'Desktop Runtime 的完整性验证未通过，不能安全启动 Runtime。',
    actions: Object.freeze(['verify-installation', 'export-diagnostics', 'open-logs', 'enter-free-mode', 'exit']),
  }),
  'runtime-unavailable': Object.freeze({
    summary: 'Desktop Runtime 当前不可用；本地修复界面仍可使用。',
    actions: Object.freeze(['verify-installation', 'retry-runtime', 'export-diagnostics', 'open-logs', 'enter-free-mode', 'exit']),
  }),
  'profile-loader-failure': Object.freeze({
    summary: '用户 Profile 或插件加载失败；原始资料会先保留。',
    actions: Object.freeze(['enter-safe-mode', 'restore-baseline', 'enter-free-mode', 'retry-runtime', 'export-diagnostics', 'open-logs', 'exit']),
  }),
  'migration-blocked': Object.freeze({
    summary: '升级状态需要人工修复；Desktop 不会改写原始资料。',
    actions: Object.freeze(['enter-free-mode', 'rollback-migration', 'export-diagnostics', 'open-logs', 'exit']),
  }),
  'migration-interrupted': Object.freeze({
    summary: '检测到未完成的升级事务；可以继续或回滚。',
    actions: Object.freeze(['continue-migration', 'rollback-migration', 'enter-free-mode', 'export-diagnostics', 'open-logs', 'exit']),
  }),
  'plugin-incompatible': Object.freeze({
    summary: '一个插件声明与当前 Runtime 不兼容。',
    actions: Object.freeze(['enter-free-mode', 'enter-safe-mode', 'restore-plugin-snapshot', 'retry-runtime', 'export-diagnostics', 'open-logs', 'exit']),
  }),
  'plugin-startup-failure': Object.freeze({
    summary: '插件或加载配置导致 Runtime 未能就绪。',
    actions: Object.freeze(['enter-free-mode', 'enter-safe-mode', 'restore-plugin-snapshot', 'restore-baseline', 'retry-runtime', 'export-diagnostics', 'open-logs', 'exit']),
  }),
  'network-degraded': Object.freeze({
    summary: '网络服务暂时不可用；本地 Desktop 不受影响。',
    actions: Object.freeze(['retry-runtime', 'enter-free-mode', 'export-diagnostics', 'open-logs', 'exit']),
  }),
  unknown: Object.freeze({
    summary: 'Desktop 遇到未分类的启动问题；原始资料不会被自动改写。',
    actions: Object.freeze(['enter-free-mode', 'retry-runtime', 'export-diagnostics', 'open-logs', 'exit']),
  }),
})

// A local Recovery Shell can always be shown, but these categories mean the
// packaged Runtime itself has not passed the minimum admission checks. Do not
// advertise a full-user Runtime session that must immediately refuse to run;
// the shell remains available for logs, verification, and repair instead.
const FULL_USER_RUNTIME_BLOCKED_CATEGORIES = new Set([
  'packaged-dependency-missing',
  'runtime-integrity-failed',
  'runtime-unavailable',
])

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

function normalizeCategory(value) {
  return typeof value === 'string' && REPAIR_CATEGORIES.includes(value) ? value : 'unknown'
}

function normalizeMode(value) {
  return typeof value === 'string' && REPAIR_MODES.includes(value) ? value : 'free-shell'
}

function fingerprint(value) {
  const content = typeof value === 'string'
    ? value
    : value instanceof Error
      ? `${value.name}:${value.message}`
      : JSON.stringify(value ?? null)
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Convert an untrusted startup/runtime failure into a safe local repair view.
 * The returned projection intentionally never includes raw error text, paths,
 * prompt/session content, plugin source, or credentials.
 */
export function projectRepairState(input = {}) {
  assertPlainObject(input, 'repair state input')
  const category = normalizeCategory(input.category)
  const detail = CATEGORY_DETAILS[category]
  const mode = normalizeMode(input.mode)
  const runtimeAvailable = input.runtimeAvailable === true
  const fullUserModeAvailable = input.fullUserModeAvailable === true
    || (
      input.fullUserModeAvailable !== false
      && !FULL_USER_RUNTIME_BLOCKED_CATEGORIES.has(category)
    )
  const actions = detail.actions.filter((action) => (
    action !== 'enter-free-mode' || (input.freeModeAvailable !== false && fullUserModeAvailable)
  ))
  return Object.freeze({
    schemaVersion: REPAIR_STATE_SCHEMA_VERSION,
    mode,
    category,
    fingerprint: fingerprint(input.error ?? input.technicalDetails ?? input.fingerprintSource ?? category),
    summary: detail.summary,
    actions: Object.freeze(actions),
    runtimeAvailable,
    freeModeAvailable: input.freeModeAvailable !== false,
    fullUserModeAvailable,
  })
}
