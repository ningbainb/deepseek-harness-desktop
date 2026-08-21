import { randomUUID } from 'node:crypto'

import {
  assertExternalPluginDescriptor,
  createExternalPluginSourceSummary,
} from './external-plugin-source.mjs'
import { freeModePermissionSourceFromDescriptor } from './free-mode-permission-store.mjs'

const TRUST_SCOPE_BY_RESPONSE = Object.freeze(['once', 'content', 'source'])
const PERSISTENT_TRUST_SCOPES = new Set(['content', 'source'])
const TRUST_SCOPES = new Set(TRUST_SCOPE_BY_RESPONSE)
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

function assertResolver(value) {
  if (!value || typeof value.resolve !== 'function') {
    throw new TypeError('free-mode plugin approval requires an external source resolver')
  }
  return value
}

function assertStore(value) {
  if (
    !value
    || typeof value.authorize !== 'function'
    || typeof value.approve !== 'function'
    || typeof value.clearSession !== 'function'
    || typeof value.load !== 'function'
    || typeof value.list !== 'function'
    || typeof value.revoke !== 'function'
  ) {
    throw new TypeError('free-mode plugin approval requires a permission store')
  }
  return value
}

function assertDialog(value) {
  if (!value || typeof value.showMessageBox !== 'function') {
    throw new TypeError('free-mode plugin approval requires a native dialog')
  }
  return value
}

function sessionIdFrom(value) {
  if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
    throw new TypeError('free-mode session ID is invalid')
  }
  return value
}

function approvalError(code, message, { revokedCount } = {}) {
  const error = new Error(message)
  error.name = 'FreeModePluginApprovalError'
  error.code = code
  if (Number.isSafeInteger(revokedCount) && revokedCount >= 0) error.revokedCount = revokedCount
  return error
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string' || value.length > 32) {
    throw new TypeError('free-mode plugin revocation time is invalid')
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new TypeError('free-mode plugin revocation time is invalid')
  }
  return value
}

/**
 * Treat a store list as an opaque main-process projection. The revocation
 * flow deliberately reads only the three fields needed to decide whether a
 * persistent grant is active; source identities, paths, and content hashes
 * are never copied into its result or error surface.
 */
function activePersistentGrantIds(value) {
  if (!Array.isArray(value)) throw new TypeError('free-mode permission store list is invalid')
  const ids = []
  const seen = new Set()
  for (const grant of value) {
    if (grant === null || typeof grant !== 'object' || Array.isArray(grant)) {
      throw new TypeError('free-mode permission store list is invalid')
    }
    if (typeof grant.grantId !== 'string' || !OPAQUE_ID_PATTERN.test(grant.grantId)) {
      throw new TypeError('free-mode permission store list is invalid')
    }
    if (!TRUST_SCOPES.has(grant.trustScope) || typeof grant.active !== 'boolean' || seen.has(grant.grantId)) {
      throw new TypeError('free-mode permission store list is invalid')
    }
    seen.add(grant.grantId)
    if (grant.active && PERSISTENT_TRUST_SCOPES.has(grant.trustScope)) ids.push(grant.grantId)
  }
  return Object.freeze(ids)
}

function callMessageBox(dialog, parentWindow, options) {
  return parentWindow === undefined || parentWindow?.isDestroyed?.()
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(parentWindow, options)
}

/**
 * Keep the user-consent flow in Electron main. This object never exposes a
 * source path, a grant, or a native confirmation result to renderer code.
 */
export function createFreeModePluginApproval({
  resolver,
  permissionStore,
  dialog,
  getWindow = () => undefined,
  now = () => new Date().toISOString(),
  idFactory = randomUUID,
  sessionIdFactory = () => `free-plugin-install:${randomUUID()}`,
  forceOnce = false,
} = {}) {
  const sourceResolver = assertResolver(resolver)
  const store = assertStore(permissionStore)
  const nativeDialog = assertDialog(dialog)
  if (
    typeof getWindow !== 'function'
    || typeof now !== 'function'
    || typeof idFactory !== 'function'
    || typeof sessionIdFactory !== 'function'
    || typeof forceOnce !== 'boolean'
  ) {
    throw new TypeError('free-mode plugin approval callbacks are invalid')
  }
  const sessions = new WeakMap()
  const approvals = new WeakMap()
  let persistentTrustRevocationQueue = Promise.resolve()

  const enqueuePersistentTrustRevocation = (operation) => {
    const result = persistentTrustRevocationQueue.then(operation, operation)
    // A rejected revocation must not poison the next explicit user action.
    persistentTrustRevocationQueue = result.catch(() => {})
    return result
  }

  const resolve = async ({ spec } = {}) => {
    if (typeof spec !== 'string' || spec.length === 0 || spec.length > 8_192) {
      throw new TypeError('full access plugin source is invalid')
    }
    const descriptor = await sourceResolver.resolve(spec)
    sessions.set(descriptor, sessionIdFrom(sessionIdFactory()))
    return descriptor
  }

  const confirm = async (descriptor, { mode } = {}) => {
    if (mode !== undefined && mode !== 'market') throw new TypeError('free-mode plugin confirmation mode is invalid')
    const source = freeModePermissionSourceFromDescriptor(descriptor)
    const sessionId = sessions.get(descriptor)
    if (sessionId === undefined) throw new Error('full access plugin descriptor was not resolved by this Desktop session')
    const summary = createExternalPluginSourceSummary(descriptor)
    // A damaged durable approval ledger is allowed to recover into a freshly
    // native-confirmed *once* session. Do not turn that emergency path into a
    // new persistent trust store: it can load arbitrary user-approved code,
    // but expires with the isolated session just like a remote reference.
    const oneTimeOnly = forceOnce || summary.approval.maximumTrustScope === 'once'
    // A remote descriptor has only a reference fingerprint. Do not reuse an
    // old content/source grant even if one was written by an earlier build:
    // it says nothing about the bytes pnpm will fetch today.
    const existing = oneTimeOnly
      ? Object.freeze({ allowed: false, reason: 'remote-confirmation-required' })
      : await store.authorize({ source, sessionId })
    if (existing.allowed) {
      approvals.set(descriptor, Object.freeze({
        trustScope: existing.trustScope,
        persistent: existing.trustScope === 'content' || existing.trustScope === 'source',
      }))
      return true
    }

    const marketInstall = mode === 'market'
    const buttons = marketInstall
      ? ['安装', '取消']
      : oneTimeOnly
        ? ['仅本次加载', '取消']
        : ['仅本次加载', '信任当前内容', '始终信任此来源', '取消']
    const result = await callMessageBox(nativeDialog, getWindow(), {
      type: marketInstall ? 'question' : 'warning',
      title: marketInstall ? '安装社区插件' : '开启全权限自由模式',
      message: marketInstall
        ? `安装 ${summary.displayName}？`
        : `允许加载 ${summary.displayName} 并授予当前用户完整权限？`,
      detail: marketInstall
        ? `来源类型：${summary.sourceType}\n安装由扩展坞完成；失败时自动恢复原配置。`
        : [
            '插件可按当前 Windows 用户权限访问文件、网络、终端、Agent、工具和后台调度。',
            'Desktop 不会再根据来源、兼容性或手改状态阻止它加载；加载失败可从插件恢复中回滚。',
            `来源类型：${summary.sourceType}；${summary.fingerprintKind === 'content' ? '内容' : '来源引用'}指纹：${summary.contentFingerprint.slice(0, 23)}…`,
            ...(summary.fingerprintKind === 'reference'
              ? ['此来源包含链接或远程引用，Desktop 不把它当作已封存字节；只会在本次隔离会话中加载。']
              : []),
            ...(oneTimeOnly ? ['下次加载需要再次由你确认。'] : []),
          ].join('\n'),
      buttons,
      // The focused action must be cancellation: pressing Enter or closing
      // the native dialog can never accidentally grant full user access.
      defaultId: buttons.length - 1,
      cancelId: buttons.length - 1,
      noLink: true,
    })
    const trustScope = oneTimeOnly
      ? result?.response === 0 ? 'once' : undefined
      : TRUST_SCOPE_BY_RESPONSE[result?.response]
    if (trustScope === undefined) return false
    await store.approve({
      trustScope,
      source,
      sessionId,
      approval: {
        method: 'native-user-confirmation',
        userConfirmed: true,
        confirmationId: idFactory(),
        approvedAt: now(),
      },
    })
    const decision = await store.authorize({ source, sessionId })
    if (decision.allowed) {
      approvals.set(descriptor, Object.freeze({
        trustScope,
        persistent: trustScope === 'content' || trustScope === 'source',
      }))
    }
    return decision.allowed
  }

  /**
   * Main-process-only metadata for a descriptor that this instance confirmed.
   * It is intentionally not returned through IPC; Electron uses it after a
   * successful transaction to decide whether a package-name authorization can
   * survive the current process.
   */
  const approvalFor = (descriptor) => approvals.get(descriptor)

  /**
   * Return the opaque session binding for an approval that Electron main has
   * already completed. This is never exposed through IPC. Passing the same
   * binding into FreeModeLauncher lets a once grant authorize the Runtime
   * directly instead of showing a second, redundant native dialog.
   */
  const launchSessionIdFor = (descriptor) => {
    const value = assertExternalPluginDescriptor(descriptor)
    const sessionId = sessions.get(value)
    if (sessionId === undefined || approvals.get(value) === undefined) {
      throw new Error('full access plugin source was not approved by this Desktop session')
    }
    return sessionId
  }

  /**
   * A local directory or tarball can change between the native confirmation
   * and pnpm installation. Re-resolve it in Electron main immediately before
   * the mutation and require the exact source/candidate/content identities
   * the user saw. Remote references intentionally remain one-time reference
   * approvals: Desktop cannot truthfully claim it knows their fetched bytes.
   */
  const revalidate = async (descriptor) => {
    const original = assertExternalPluginDescriptor(descriptor)
    const sessionId = sessions.get(original)
    const approval = approvals.get(original)
    if (sessionId === undefined || approval === undefined) {
      throw new Error('full access plugin source was not approved by this Desktop session')
    }
    // v1 local descriptors did not need to spell this field; their compatible
    // default is still a content fingerprint.
    if ((original.fingerprintKind ?? 'content') !== 'content') return original

    let refreshed
    try {
      refreshed = assertExternalPluginDescriptor(await sourceResolver.resolve(original.installSpec))
    } catch (error) {
      throw new Error('full access plugin source could not be revalidated before installation', { cause: error })
    }
    if (
      refreshed.sourceId !== original.sourceId
      || refreshed.candidateId !== original.candidateId
      || refreshed.contentFingerprint !== original.contentFingerprint
      || refreshed.sourceType !== original.sourceType
      || refreshed.package.name !== original.package.name
    ) {
      throw new Error('full access plugin source changed after native confirmation')
    }
    sessions.set(refreshed, sessionId)
    approvals.set(refreshed, approval)
    return refreshed
  }

  /**
   * Consume only an ephemeral remote approval after its isolated-session
   * launch settles. Persistent local content/source grants remain in the
   * store and are still bound to their descriptor on the next explicit use.
   */
  const complete = async (descriptor) => {
    const value = assertExternalPluginDescriptor(descriptor)
    const approval = approvals.get(value)
    const sessionId = sessions.get(value)
    if (approval === undefined || sessionId === undefined) {
      throw new Error('full access plugin source was not approved by this Desktop session')
    }
    if (approval.trustScope === 'once') await store.clearSession(sessionId)
    approvals.delete(value)
    sessions.delete(value)
    return true
  }

  /**
   * Revoke every currently active persistent external-plugin trust grant.
   * This is intentionally a zero-argument Electron-main API: a renderer
   * cannot choose which grant, source, path, or content identity gets
   * revoked. One-time grants are session scoped and are deliberately left for
   * their normal `complete()` / session cleanup path.
   *
   * Revocations are serialized per approval service. A durable store failure
   * stops the batch immediately and rejects with a path/content-free error;
   * grants already revoked before that error remain revoked, and retrying the
   * same zero-argument action safely targets the remaining active grants.
   */
  const revokeAllPersistentTrust = (...argumentsFromCaller) => {
    if (argumentsFromCaller.length !== 0) {
      return Promise.reject(new TypeError('free-mode persistent trust revocation does not accept renderer arguments'))
    }
    return enqueuePersistentTrustRevocation(async () => {
      let listed
      try {
        await store.load()
        listed = await store.list()
      } catch {
        throw approvalError(
          'free-mode-plugin-persistent-trust-list-failed',
          'Persistent external-plugin trust could not be listed for revocation.',
        )
      }

      let grantIds
      try {
        grantIds = activePersistentGrantIds(listed)
      } catch {
        throw approvalError(
          'free-mode-plugin-persistent-trust-store-invalid',
          'Persistent external-plugin trust storage is invalid.',
        )
      }
      if (grantIds.length === 0) return Object.freeze({ revokedCount: 0 })

      let revokedAt
      try {
        revokedAt = canonicalTimestamp(now())
      } catch {
        throw approvalError(
          'free-mode-plugin-persistent-trust-clock-invalid',
          'Persistent external-plugin trust could not be revoked at this time.',
        )
      }

      let revokedCount = 0
      for (const grantId of grantIds) {
        let changed
        try {
          changed = await store.revoke(grantId, { revokedAt })
        } catch {
          throw approvalError(
            'free-mode-plugin-persistent-trust-revoke-failed',
            'Persistent external-plugin trust revocation did not complete.',
            { revokedCount },
          )
        }
        if (typeof changed !== 'boolean') {
          throw approvalError(
            'free-mode-plugin-persistent-trust-store-invalid',
            'Persistent external-plugin trust storage is invalid.',
            { revokedCount },
          )
        }
        if (changed) revokedCount += 1
      }
      return Object.freeze({ revokedCount })
    })
  }

  return Object.freeze({
    resolve,
    confirm,
    revalidate,
    complete,
    approvalFor,
    launchSessionIdFor,
    revokeAllPersistentTrust,
  })
}
