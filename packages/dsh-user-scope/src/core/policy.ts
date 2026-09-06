import type { DeviceId, PrincipalId, SessionId, WorkspaceId } from './ids.ts'
import type { AccessScope, OwnershipSnapshot } from './schema.ts'

export type AccessResource =
  | { kind: 'principal'; principalId: PrincipalId }
  | { kind: 'workspace'; workspaceId: WorkspaceId }
  | { kind: 'session'; sessionId: SessionId }

export type AccessDeniedReason =
  | 'scope-unavailable'
  | 'unknown-principal'
  | 'missing-device'
  | 'unknown-device'
  | 'revoked-device'
  | 'device-principal-mismatch'
  | 'unknown-resource'
  | 'other-principal'
  | 'missing-workspace-grant'

export type AccessDecision =
  | { allowed: true; reason: 'allowed' }
  | { allowed: false; reason: AccessDeniedReason }

const deny = (reason: AccessDeniedReason): AccessDecision => ({ allowed: false, reason })

function workspaceExists(snapshot: OwnershipSnapshot, workspaceId: WorkspaceId): boolean {
  return snapshot.grants.some(item => item.workspaceId === workspaceId) || snapshot.sessions.some(item => item.workspaceId === workspaceId)
}

function hasWorkspaceGrant(snapshot: OwnershipSnapshot, principalId: PrincipalId, workspaceId: WorkspaceId): boolean {
  return snapshot.grants.some(item => item.principalId === principalId && item.workspaceId === workspaceId && item.permission === 'use')
}

function hasSessionGrant(session: { grantedPrincipalIds?: PrincipalId[] }, principalId: PrincipalId): boolean {
  return session.grantedPrincipalIds?.includes(principalId) === true
}

function activeDevice(snapshot: OwnershipSnapshot, scope: AccessScope) {
  if (scope.deviceId === undefined) return { ok: false as const, reason: 'missing-device' as const }
  const binding = snapshot.devices.find(item => item.deviceId === scope.deviceId)
  if (binding === undefined) return { ok: false as const, reason: 'unknown-device' as const }
  if (binding.revokedAt !== undefined) return { ok: false as const, reason: 'revoked-device' as const }
  if (binding.principalId !== scope.principalId) return { ok: false as const, reason: 'device-principal-mismatch' as const }
  return { ok: true as const }
}

/** Central authorization decision used by desktop and remote consumers. */
export function decideAccess(
  snapshot: OwnershipSnapshot,
  localPrincipalId: PrincipalId,
  scope: AccessScope,
  resource: AccessResource,
): AccessDecision {
  if (!snapshot.principals.some(item => item.id === scope.principalId)) return deny('unknown-principal')

  if (scope.source === 'desktop') {
    if (scope.principalId !== localPrincipalId) return deny('other-principal')
    if (resource.kind === 'principal') return resource.principalId === localPrincipalId ? { allowed: true, reason: 'allowed' } : deny('other-principal')
    if (resource.kind === 'workspace') return workspaceExists(snapshot, resource.workspaceId) ? { allowed: true, reason: 'allowed' } : deny('unknown-resource')
    return snapshot.sessions.some(item => item.sessionId === resource.sessionId) ? { allowed: true, reason: 'allowed' } : deny('unknown-resource')
  }

  const device = activeDevice(snapshot, scope)
  if (!device.ok) return deny(device.reason)
  if (resource.kind === 'principal') return resource.principalId === scope.principalId ? { allowed: true, reason: 'allowed' } : deny('other-principal')
  if (resource.kind === 'workspace') {
    if (!workspaceExists(snapshot, resource.workspaceId)) return deny('unknown-resource')
    return hasWorkspaceGrant(snapshot, scope.principalId, resource.workspaceId) ? { allowed: true, reason: 'allowed' } : deny('missing-workspace-grant')
  }
  const session = snapshot.sessions.find(item => item.sessionId === resource.sessionId)
  if (session === undefined) return deny('unknown-resource')
  if (session.createdByPrincipalId !== scope.principalId && !hasSessionGrant(session, scope.principalId)) return deny('other-principal')
  if (session.workspaceId !== undefined && !hasWorkspaceGrant(snapshot, scope.principalId, session.workspaceId)) return deny('missing-workspace-grant')
  return { allowed: true, reason: 'allowed' }
}
