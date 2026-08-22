import { createHash, randomUUID } from 'node:crypto'

import { FULL_USER_RUNTIME_OVERLAY } from './primary-full-user-overlay.mjs'

export const PRIMARY_RUNTIME_PERMISSION_SOURCE = Object.freeze({
  id: 'desktop-primary-runtime-v1',
  contentSha256: createHash('sha256').update(FULL_USER_RUNTIME_OVERLAY, 'utf8').digest('hex'),
})

function assertPermissionStore(value) {
  if (
    !value
    || typeof value.load !== 'function'
    || typeof value.authorize !== 'function'
    || typeof value.approve !== 'function'
  ) {
    throw new TypeError('primary Runtime permission store is unavailable')
  }
  return value
}

function assertDialog(value) {
  if (!value || typeof value.showMessageBox !== 'function') {
    throw new TypeError('primary Runtime permission confirmation requires a native dialog')
  }
  return value
}

function showMessageBox(dialog, parentWindow, options) {
  if (parentWindow && !parentWindow.isDestroyed?.()) return dialog.showMessageBox(parentWindow, options)
  return dialog.showMessageBox(options)
}

/**
 * Authorize the persistent primary Runtime from a fixed main-process source.
 * This function accepts no renderer data, command, path, environment, Runtime
 * URL, or overlay content. A saved grant avoids repeated prompts but never
 * performs or bypasses Runtime admission and integrity checks.
 */
export async function ensurePrimaryRuntimeFullUserPermission({
  permissionStore,
  dialog,
  parentWindow,
  confirmationIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  const store = assertPermissionStore(permissionStore)
  const nativeDialog = assertDialog(dialog)
  if (typeof confirmationIdFactory !== 'function' || typeof now !== 'function') {
    throw new TypeError('primary Runtime permission identity providers are invalid')
  }
  await store.load()
  const existing = await store.authorize({ source: PRIMARY_RUNTIME_PERMISSION_SOURCE })
  if (existing?.allowed === true && existing.trustScope === 'source') {
    return Object.freeze({ approved: true, remembered: true, grantId: existing.grantId })
  }

  const response = await showMessageBox(nativeDialog, parentWindow, {
    type: 'warning',
    title: '启用 Desktop 完整权限模式',
    message: '允许 DeepSeek Harness 主 Runtime 按当前 Windows 用户权限运行？',
    detail: [
      '主 Runtime、Agent、终端、文件、网络、工具、插件和后台调度将使用当前 Windows 用户已有的权限。',
      'Desktop 不会申请管理员权限或 UAC，不会修改系统 PATH、注册表或系统权限。',
      '授权会保存在 Desktop 自有状态中；撤销后，下次启动会重新确认。',
      '每次启动仍会独立校验官方 Runtime，损坏、缺失或被篡改的 Runtime 不会因为授权而运行。',
    ].join('\n'),
    buttons: ['启用并记住', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (response?.response !== 0) return Object.freeze({ approved: false, remembered: false })

  const approvedAt = now()
  const confirmationId = confirmationIdFactory()
  const grant = await store.approve({
    trustScope: 'source',
    source: PRIMARY_RUNTIME_PERMISSION_SOURCE,
    approval: {
      method: 'native-user-confirmation',
      userConfirmed: true,
      confirmationId,
      approvedAt,
    },
  })
  const verified = await store.authorize({ source: PRIMARY_RUNTIME_PERMISSION_SOURCE })
  if (verified?.allowed !== true || verified.trustScope !== 'source' || verified.grantId !== grant.grantId) {
    throw new Error('primary Runtime full-user permission did not verify after persistence')
  }
  return Object.freeze({ approved: true, remembered: false, grantId: grant.grantId })
}
