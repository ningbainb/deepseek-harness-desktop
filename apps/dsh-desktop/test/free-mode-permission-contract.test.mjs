import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FREE_MODE_FULL_PERMISSION,
  FREE_MODE_TRUST_SCOPES,
  authorizeFreeModeFullPermission,
  isMainProcessFreeModePermissionGrant,
  issueFreeModeFullPermissionGrant,
  restoreFreeModeFullPermissionGrant,
  revokeFreeModeFullPermissionGrant,
  serializeFreeModeFullPermissionGrant,
} from '../src/free-mode-permission-contract.mjs'

const SOURCE_A = Object.freeze({
  id: 'external-plugin:source-a',
  contentSha256: 'a'.repeat(64),
})
const SOURCE_A_CHANGED = Object.freeze({
  id: SOURCE_A.id,
  contentSha256: 'b'.repeat(64),
})
const SOURCE_B = Object.freeze({
  id: 'external-plugin:source-b',
  contentSha256: SOURCE_A.contentSha256,
})
const APPROVAL = Object.freeze({
  method: 'native-user-confirmation',
  userConfirmed: true,
  confirmationId: 'native-confirmation-001',
  approvedAt: '2026-08-20T12:00:00.000Z',
})

function issue(trustScope, options = {}) {
  return issueFreeModeFullPermissionGrant({
    grantId: `grant-${trustScope}`,
    trustScope,
    source: SOURCE_A,
    approval: APPROVAL,
    ...options,
  })
}

test('full-permission grants require explicit native user confirmation and have a JSON-safe main-process model', () => {
  const grant = issue('once', { sessionId: 'free-session-001' })
  assert.equal(isMainProcessFreeModePermissionGrant(grant), true)

  const serialized = serializeFreeModeFullPermissionGrant(grant)
  assert.deepEqual(serialized, {
    schemaVersion: 1,
    kind: 'free-mode-full-permission-grant',
    issuer: 'desktop-main',
    grantId: 'grant-once',
    permissionLevel: 'full-user',
    trustScope: 'once',
    source: SOURCE_A,
    sessionId: 'free-session-001',
    approval: APPROVAL,
    state: 'active',
  })
  assert.equal(isMainProcessFreeModePermissionGrant(JSON.parse(JSON.stringify(serialized))), false)
  assert.equal(isMainProcessFreeModePermissionGrant(restoreFreeModeFullPermissionGrant(serialized)), true)

  assert.throws(() => issueFreeModeFullPermissionGrant({
    grantId: 'grant-without-consent',
    trustScope: 'source',
    source: SOURCE_A,
    approval: { ...APPROVAL, userConfirmed: false },
  }), /explicit native user confirmation/u)
})

test('once trust authorizes one exact source and content in one exact free session', () => {
  const grant = issue('once', { sessionId: 'free-session-001' })
  assert.deepEqual(authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_A,
    sessionId: 'free-session-001',
  }), {
    allowed: true,
    reason: 'approved-once',
    permission: FREE_MODE_FULL_PERMISSION,
    grantId: 'grant-once',
    trustScope: 'once',
  })
  assert.equal(authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_A,
    sessionId: 'free-session-002',
  }).reason, 'session-mismatch')
  assert.equal(authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_A_CHANGED,
    sessionId: 'free-session-001',
  }).reason, 'content-mismatch')
  assert.equal(authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_B,
    sessionId: 'free-session-001',
  }).reason, 'source-mismatch')
})

test('content trust survives a new session but not changed bytes or a different source', () => {
  const grant = issue('content')
  const allowed = authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_A,
    sessionId: 'new-free-session',
  })
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.reason, 'approved-content')
  assert.deepEqual(allowed.permission, FREE_MODE_FULL_PERMISSION)
  assert.equal(authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_A_CHANGED,
    sessionId: 'new-free-session',
  }).reason, 'content-mismatch')
  assert.equal(authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_B,
    sessionId: 'new-free-session',
  }).reason, 'source-mismatch')
})

test('source trust accepts future content from the approved source with full current-user permissions', () => {
  const grant = issue('source')
  const decision = authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_A_CHANGED,
    sessionId: 'new-free-session',
  })
  assert.equal(decision.allowed, true)
  assert.equal(decision.reason, 'approved-source')
  assert.deepEqual(decision.permission, {
    level: 'full-user',
    boundary: 'current-os-user',
  })
  assert.equal(authorizeFreeModeFullPermission({
    grant,
    source: SOURCE_B,
    sessionId: 'new-free-session',
  }).reason, 'source-mismatch')
})

test('plain renderer-shaped JSON cannot authorize and revocation denies future sessions', () => {
  const grant = issue('source')
  const forgedGrant = serializeFreeModeFullPermissionGrant(grant)
  assert.deepEqual(authorizeFreeModeFullPermission({
    grant: forgedGrant,
    source: SOURCE_A,
  }), {
    allowed: false,
    reason: 'grant-not-issued-by-main',
    permission: 'none',
  })

  const revoked = revokeFreeModeFullPermissionGrant(grant, {
    revokedAt: '2026-08-20T12:05:00.000Z',
  })
  assert.equal(authorizeFreeModeFullPermission({
    grant: revoked,
    source: SOURCE_A,
  }).reason, 'grant-revoked')
  assert.equal(serializeFreeModeFullPermissionGrant(revoked).state, 'revoked')
  assert.equal(serializeFreeModeFullPermissionGrant(revoked).revokedAt, '2026-08-20T12:05:00.000Z')
})

test('the contract exposes exactly once, content, and source trust scopes', () => {
  assert.deepEqual(FREE_MODE_TRUST_SCOPES, ['once', 'content', 'source'])
  assert.equal(Object.isFrozen(FREE_MODE_TRUST_SCOPES), true)
})
