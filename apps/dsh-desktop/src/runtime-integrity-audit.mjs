import { validateProtectedRuntimeGraph } from './runtime-graph-validator.mjs'

const AUTOMATIC_REPAIR_CODES = new Set([
  'PROTECTED_PACKAGE_MISSING',
  'PROTECTED_PACKAGE_VERSION_CONFLICT',
  'PROTECTED_PACKAGE_SOURCE_CONFLICT',
])

function publicAudit(status, reasonCode, fingerprint) {
  return Object.freeze({
    status,
    ...(reasonCode === undefined ? {} : { reasonCode }),
    ...(fingerprint === undefined ? {} : { fingerprint }),
  })
}

/**
 * Read only the profile manifest, protected links, lock graph, and matching
 * pnpm virtual-store entries. Paths and raw error text never leave this API.
 */
export async function auditRuntimeIntegrity({
  profileDir,
  baseline,
  policy,
  managedPackageNames,
  validate = validateProtectedRuntimeGraph,
} = {}) {
  try {
    const result = await validate({ profileDir, baseline, policy, managedPackageNames })
    return publicAudit('healthy', undefined, result.fingerprint)
  } catch (error) {
    if (error?.code === 'ENOENT') return publicAudit('uninitialized', 'PROFILE_NOT_INITIALIZED')
    const reasonCode = typeof error?.code === 'string' && error.code.length > 0
      ? error.code
      : 'RUNTIME_INTEGRITY_UNAVAILABLE'
    return publicAudit(
      AUTOMATIC_REPAIR_CODES.has(reasonCode) ? 'repairable' : 'blocked',
      reasonCode,
    )
  }
}

function repairRequiredError(audit, cause) {
  const error = new Error('plugin environment requires repair', cause === undefined ? undefined : { cause })
  error.code = 'PLUGIN_ENVIRONMENT_REPAIR_REQUIRED'
  error.userMessage = '检测到旧版本留下的插件依赖异常。修复只会重建插件运行环境，不会删除聊天、设置或个人数据。'
  error.audit = audit
  return error
}

/**
 * Run the existing managed-link reconciliation, then prove the resulting
 * dependency graph against the immutable application baseline.
 */
export async function migrateLegacyRuntimeIntegrity({ audit, repair } = {}) {
  if (typeof audit !== 'function' || typeof repair !== 'function') {
    throw new TypeError('runtime integrity migration requires audit and repair callbacks')
  }
  const before = await audit()
  let repairResult
  try {
    repairResult = await repair()
  } catch (error) {
    throw repairRequiredError(before, error)
  }
  const after = await audit()
  if (after.status !== 'healthy') throw repairRequiredError(after)
  return Object.freeze({
    before,
    after,
    repairResult,
    repaired: before.status === 'repairable',
    initialized: before.status === 'uninitialized',
  })
}
