import { createHash } from 'node:crypto'

import { FULL_USER_RUNTIME_OVERLAY } from './primary-full-user-overlay.mjs'

export const PRIMARY_RUNTIME_PERMISSION_SOURCE = Object.freeze({
  id: 'desktop-primary-runtime-v1',
  contentSha256: createHash('sha256').update(FULL_USER_RUNTIME_OVERLAY, 'utf8').digest('hex'),
})

function isPermissionStore(value) {
  return Boolean(
    value
    && typeof value.load === 'function'
    && typeof value.authorize === 'function',
  )
}

/**
 * The fixed, integrity-checked Desktop Runtime uses the current OS user's
 * permissions by product default. An older explicitly confirmed grant remains
 * readable for continuity, but a missing, revoked, or unreadable legacy ledger
 * never prompts and never blocks startup. This does not grant administrator
 * rights and accepts no renderer-supplied source, path, command, or overlay.
 */
export async function ensurePrimaryRuntimeFullUserPermission({ permissionStore } = {}) {
  if (isPermissionStore(permissionStore)) {
    try {
      await permissionStore.load()
      const existing = await permissionStore.authorize({ source: PRIMARY_RUNTIME_PERMISSION_SOURCE })
      if (existing?.allowed === true && existing.trustScope === 'source') {
        return Object.freeze({ approved: true, remembered: true, grantId: existing.grantId })
      }
    } catch {
      // The legacy approval ledger is not an admission requirement anymore.
    }
  }
  return Object.freeze({ approved: true, remembered: false, defaulted: true })
}
