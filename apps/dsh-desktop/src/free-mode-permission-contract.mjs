/**
 * The free-mode permission contract deliberately grants a selected source all
 * permissions available to the current operating-system user. It does not
 * elevate that user or grant Desktop repair privileges; those remain separate
 * main-process operations.
 *
 * This module is pure and has no IPC registration. Main-process code issues or
 * restores grants, keeps the branded object private, and passes only an
 * authorization decision to the Runtime launcher. The serializable projection
 * is for Desktop-owned persistence and audit records, never a renderer input.
 */

export const FREE_MODE_PERMISSION_SCHEMA_VERSION = 1
export const FREE_MODE_PERMISSION_GRANT_KIND = 'free-mode-full-permission-grant'
export const FREE_MODE_PERMISSION_LEVEL = 'full-user'
export const FREE_MODE_TRUST_SCOPES = Object.freeze(['once', 'content', 'source'])
export const FREE_MODE_FULL_PERMISSION = Object.freeze({
  level: FREE_MODE_PERMISSION_LEVEL,
  boundary: 'current-os-user',
})

const TRUST_SCOPE_SET = new Set(FREE_MODE_TRUST_SCOPES)
const MAIN_PROCESS_GRANTS = new WeakSet()
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const APPROVAL_METHOD = 'native-user-confirmation'
const GRANT_ISSUER = 'desktop-main'
const ACTIVE_STATE = 'active'
const REVOKED_STATE = 'revoked'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function onlyKeys(value, keys, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains an unknown field: ${key}`)
  }
}

function opaqueId(value, label) {
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) {
    throw new TypeError(`${label} must be a non-path opaque identifier`)
  }
  return value
}

function timestamp(value, label) {
  if (typeof value !== 'string' || value.length > 32) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp`)
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO-8601 timestamp`)
  }
  return value
}

function normalizeSource(value, label = 'free-mode source') {
  onlyKeys(value, ['id', 'contentSha256'], label)
  if (typeof value.contentSha256 !== 'string' || !SHA256.test(value.contentSha256)) {
    throw new TypeError(`${label} contentSha256 must be a lowercase SHA-256 digest`)
  }
  return Object.freeze({
    id: opaqueId(value.id, `${label} id`),
    contentSha256: value.contentSha256,
  })
}

function normalizeApproval(value) {
  onlyKeys(value, ['method', 'userConfirmed', 'confirmationId', 'approvedAt'], 'free-mode approval')
  if (value.method !== APPROVAL_METHOD || value.userConfirmed !== true) {
    throw new TypeError('free-mode full permission requires explicit native user confirmation')
  }
  return Object.freeze({
    method: APPROVAL_METHOD,
    userConfirmed: true,
    confirmationId: opaqueId(value.confirmationId, 'free-mode approval confirmationId'),
    approvedAt: timestamp(value.approvedAt, 'free-mode approval approvedAt'),
  })
}

function normalizeSerializedGrant(value) {
  onlyKeys(value, [
    'schemaVersion',
    'kind',
    'issuer',
    'grantId',
    'permissionLevel',
    'trustScope',
    'source',
    'sessionId',
    'approval',
    'state',
    'revokedAt',
  ], 'free-mode permission grant')
  if (value.schemaVersion !== FREE_MODE_PERMISSION_SCHEMA_VERSION || value.kind !== FREE_MODE_PERMISSION_GRANT_KIND) {
    throw new TypeError('free-mode permission grant schema is invalid')
  }
  if (value.issuer !== GRANT_ISSUER || value.permissionLevel !== FREE_MODE_PERMISSION_LEVEL) {
    throw new TypeError('free-mode permission grant is not a Desktop full-permission grant')
  }
  if (!TRUST_SCOPE_SET.has(value.trustScope)) {
    throw new TypeError('free-mode permission grant trustScope is invalid')
  }
  const trustScope = value.trustScope
  const hasSessionId = Object.hasOwn(value, 'sessionId') && value.sessionId !== undefined
  if (trustScope === 'once') {
    if (!hasSessionId) throw new TypeError('once free-mode permission grants require a sessionId')
  } else if (hasSessionId) {
    throw new TypeError('only once free-mode permission grants may contain a sessionId')
  }

  if (value.state !== ACTIVE_STATE && value.state !== REVOKED_STATE) {
    throw new TypeError('free-mode permission grant state is invalid')
  }
  const hasRevokedAt = Object.hasOwn(value, 'revokedAt') && value.revokedAt !== undefined
  if (value.state === ACTIVE_STATE && hasRevokedAt) {
    throw new TypeError('active free-mode permission grants cannot contain revokedAt')
  }
  if (value.state === REVOKED_STATE && !hasRevokedAt) {
    throw new TypeError('revoked free-mode permission grants require revokedAt')
  }

  return Object.freeze({
    schemaVersion: FREE_MODE_PERMISSION_SCHEMA_VERSION,
    kind: FREE_MODE_PERMISSION_GRANT_KIND,
    issuer: GRANT_ISSUER,
    grantId: opaqueId(value.grantId, 'free-mode permission grant grantId'),
    permissionLevel: FREE_MODE_PERMISSION_LEVEL,
    trustScope,
    source: normalizeSource(value.source),
    ...(hasSessionId ? { sessionId: opaqueId(value.sessionId, 'free-mode permission grant sessionId') } : {}),
    approval: normalizeApproval(value.approval),
    state: value.state,
    ...(hasRevokedAt ? { revokedAt: timestamp(value.revokedAt, 'free-mode permission grant revokedAt') } : {}),
  })
}

function brandAsMainProcessGrant(grant) {
  MAIN_PROCESS_GRANTS.add(grant)
  return grant
}

function denied(reason) {
  return Object.freeze({
    allowed: false,
    reason,
    permission: 'none',
  })
}

function allowed(grant, reason) {
  return Object.freeze({
    allowed: true,
    reason,
    permission: FREE_MODE_FULL_PERMISSION,
    grantId: grant.grantId,
    trustScope: grant.trustScope,
  })
}

/**
 * Issue a full-permission grant only after the main process has completed its
 * native confirmation flow. A grant is intentionally branded in memory, so a
 * renderer-created object with matching JSON cannot authorize a session.
 */
export function issueFreeModeFullPermissionGrant({
  grantId,
  trustScope,
  source,
  sessionId,
  approval,
} = {}) {
  return brandAsMainProcessGrant(normalizeSerializedGrant({
    schemaVersion: FREE_MODE_PERMISSION_SCHEMA_VERSION,
    kind: FREE_MODE_PERMISSION_GRANT_KIND,
    issuer: GRANT_ISSUER,
    grantId,
    permissionLevel: FREE_MODE_PERMISSION_LEVEL,
    trustScope,
    source,
    ...(sessionId === undefined ? {} : { sessionId }),
    approval,
    state: ACTIVE_STATE,
  }))
}

/**
 * Restore a previously persisted Desktop-owned grant. This function must only
 * be called from main-process trust-store code after reading its own storage.
 */
export function restoreFreeModeFullPermissionGrant(serializedGrant) {
  return brandAsMainProcessGrant(normalizeSerializedGrant(serializedGrant))
}

/** Return a JSON-safe persistence projection without exposing the in-memory brand. */
export function serializeFreeModeFullPermissionGrant(grant) {
  if (!isMainProcessFreeModePermissionGrant(grant)) {
    throw new TypeError('free-mode permission grant was not issued by the Desktop main process')
  }
  return JSON.parse(JSON.stringify(grant))
}

/** Main-process type guard. Parsed JSON is deliberately not a usable grant. */
export function isMainProcessFreeModePermissionGrant(value) {
  return isRecord(value) && MAIN_PROCESS_GRANTS.has(value)
}

/**
 * Revoke an active grant. The caller should replace the stored record with the
 * serialized return value before starting another free-mode session.
 */
export function revokeFreeModeFullPermissionGrant(grant, { revokedAt } = {}) {
  if (!isMainProcessFreeModePermissionGrant(grant)) {
    throw new TypeError('free-mode permission grant was not issued by the Desktop main process')
  }
  if (grant.state === REVOKED_STATE) return grant
  return brandAsMainProcessGrant(normalizeSerializedGrant({
    ...serializeFreeModeFullPermissionGrant(grant),
    state: REVOKED_STATE,
    revokedAt,
  }))
}

/**
 * Decide whether a source may start a free-mode session with all permissions
 * available to the current OS user. Authorization is session-wide rather than
 * capability-by-capability: a successful decision has no hidden capability
 * deny-list.
 */
export function authorizeFreeModeFullPermission({
  grant,
  source,
  sessionId,
} = {}) {
  if (!isMainProcessFreeModePermissionGrant(grant)) return denied('grant-not-issued-by-main')
  if (grant.state === REVOKED_STATE) return denied('grant-revoked')

  let requestedSource
  try {
    requestedSource = normalizeSource(source, 'free-mode authorization source')
  } catch {
    return denied('invalid-source')
  }

  if (requestedSource.id !== grant.source.id) return denied('source-mismatch')
  if (grant.trustScope === 'source') return allowed(grant, 'approved-source')
  if (requestedSource.contentSha256 !== grant.source.contentSha256) return denied('content-mismatch')
  if (grant.trustScope === 'content') return allowed(grant, 'approved-content')

  if (typeof sessionId !== 'string' || !OPAQUE_ID.test(sessionId)) return denied('session-required')
  if (sessionId !== grant.sessionId) return denied('session-mismatch')
  return allowed(grant, 'approved-once')
}
