import {
  decideAccess,
  type AccessDecision,
  type AccessResource,
} from './policy.ts'
import type {
  AccessScope,
  DeviceBinding,
  Principal,
  SessionOwnership,
  WorkspaceGrant,
  OwnershipSnapshot,
} from './schema.ts'
import type { PrincipalId, DeviceId, SessionId, WorkspaceId } from './ids.ts'
import { emptyOwnershipSnapshot } from './schema.ts'

export { decideAccess }
export type { AccessDecision, AccessResource }

function clonePrincipal(value: Principal): Principal {
  return { ...value }
}

function cloneDevice(value: DeviceBinding): DeviceBinding {
  return { ...value }
}

function cloneSession(value: SessionOwnership): SessionOwnership {
  return {
    ...value,
    ...(value.grantedPrincipalIds === undefined
      ? {}
      : { grantedPrincipalIds: [...value.grantedPrincipalIds] }),
  }
}

function cloneSnapshot(value: OwnershipSnapshot): OwnershipSnapshot {
  return {
    version: value.version,
    principals: value.principals.map(clonePrincipal),
    devices: value.devices.map(cloneDevice),
    grants: value.grants.map(value => ({ ...value })),
    sessions: value.sessions.map(cloneSession),
  }
}

/** In-memory ownership registry; persistence is supplied by UserScopeStore. */
export class UserScopeRegistry {
  private state: OwnershipSnapshot

  constructor(
    readonly localPrincipal: Principal,
    initial: OwnershipSnapshot = emptyOwnershipSnapshot(localPrincipal),
  ) {
    this.state = cloneSnapshot(initial)
    if (!this.state.principals.some(item => item.id === localPrincipal.id)) {
      this.state.principals.unshift(clonePrincipal(localPrincipal))
    }
  }

  snapshot(): OwnershipSnapshot {
    return cloneSnapshot(this.state)
  }

  replace(next: OwnershipSnapshot): void {
    this.state = cloneSnapshot(next)
  }

  principal(principalId: PrincipalId): Principal | undefined {
    const found = this.state.principals.find(item => item.id === principalId)
    return found === undefined ? undefined : clonePrincipal(found)
  }

  principalForDevice(deviceId: DeviceId): PrincipalId | undefined {
    return this.state.devices.find(item => item.deviceId === deviceId && item.revokedAt === undefined)?.principalId
  }

  device(deviceId: DeviceId): DeviceBinding | undefined {
    const found = this.state.devices.find(item => item.deviceId === deviceId)
    return found === undefined ? undefined : cloneDevice(found)
  }

  addPrincipal(principal: Principal): void {
    const existing = this.state.principals.find(item => item.id === principal.id)
    if (existing !== undefined) {
      if (existing.kind !== principal.kind) throw new Error('principal id collision')
      return
    }
    this.state.principals.push(clonePrincipal(principal))
  }

  registerDevice(binding: DeviceBinding): void {
    if (!this.state.principals.some(item => item.id === binding.principalId)) throw new Error('device principal is not registered')
    const existing = this.state.devices.find(item => item.deviceId === binding.deviceId)
    if (existing !== undefined && existing.principalId !== binding.principalId) throw new Error('device id collision')
    if (existing === undefined) {
      this.state.devices.push(cloneDevice(binding))
      return
    }
    Object.assign(existing, cloneDevice(binding))
  }

  touchDevice(deviceId: DeviceId, now: number): boolean {
    const binding = this.state.devices.find(item => item.deviceId === deviceId)
    if (binding === undefined || binding.revokedAt !== undefined) return false
    binding.lastSeenAt = now
    return true
  }

  revokeDevice(deviceId: DeviceId, revokedAt: number): boolean {
    const binding = this.state.devices.find(item => item.deviceId === deviceId)
    if (binding === undefined || binding.revokedAt !== undefined) return false
    binding.revokedAt = revokedAt
    return true
  }

  grantWorkspace(grant: WorkspaceGrant): void {
    if (!this.state.principals.some(item => item.id === grant.principalId)) throw new Error('grant principal is not registered')
    const existing = this.state.grants.find(item => item.principalId === grant.principalId && item.workspaceId === grant.workspaceId)
    if (existing === undefined) this.state.grants.push({ ...grant })
  }

  revokeWorkspace(principalId: PrincipalId, workspaceId: WorkspaceId): boolean {
    const before = this.state.grants.length
    this.state.grants = this.state.grants.filter(item => !(item.principalId === principalId && item.workspaceId === workspaceId))
    return this.state.grants.length !== before
  }

  registerSession(ownership: SessionOwnership): void {
    if (!this.state.principals.some(item => item.id === ownership.createdByPrincipalId)) throw new Error('session principal is not registered')
    const existing = this.state.sessions.find(item => item.sessionId === ownership.sessionId)
    if (existing !== undefined && existing.createdByPrincipalId !== ownership.createdByPrincipalId) throw new Error('session ownership collision')
    if (existing === undefined) this.state.sessions.push(cloneSession(ownership))
    else Object.assign(existing, cloneSession(ownership))
  }

  grantSession(principalId: PrincipalId, sessionId: SessionId): void {
    if (!this.state.principals.some(item => item.id === principalId)) throw new Error('session grant principal is not registered')
    const session = this.state.sessions.find(item => item.sessionId === sessionId)
    if (session === undefined) throw new Error('session grant target is not registered')
    const grants = session.grantedPrincipalIds ?? []
    if (!grants.includes(principalId)) session.grantedPrincipalIds = [...grants, principalId]
  }

  revokeSession(principalId: PrincipalId, sessionId: SessionId): boolean {
    const session = this.state.sessions.find(item => item.sessionId === sessionId)
    if (session === undefined || session.grantedPrincipalIds === undefined) return false
    const next = session.grantedPrincipalIds.filter(item => item !== principalId)
    if (next.length === session.grantedPrincipalIds.length) return false
    if (next.length === 0) delete session.grantedPrincipalIds
    else session.grantedPrincipalIds = next
    return true
  }

  removeSession(sessionId: SessionId): boolean {
    const before = this.state.sessions.length
    this.state.sessions = this.state.sessions.filter(item => item.sessionId !== sessionId)
    return this.state.sessions.length !== before
  }

  access(scope: AccessScope, resource: AccessResource): AccessDecision {
    return decideAccess(this.state, this.localPrincipal.id, scope, resource)
  }

  visibleSessions(scope: AccessScope): SessionOwnership[] {
    return this.state.sessions
      .filter(session => this.access(scope, { kind: 'session', sessionId: session.sessionId }).allowed)
      .map(cloneSession)
  }
}
