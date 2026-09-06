import { describe, expect, it } from 'vitest'
import {
  asDeviceId,
  asPrincipalId,
  asSessionId,
  asWorkspaceId,
  decideAccess,
  UserScopeRegistry,
  type DeviceBinding,
  type Principal,
} from '../src/index.ts'

const principal = (id: string, kind: Principal['kind']): Principal => ({
  id: asPrincipalId(id)!,
  kind,
  createdAt: 1,
})

describe('user-scope authorization', () => {
  it('rejects path-like and whitespace-bearing identifiers', () => {
    expect(asPrincipalId('../other-user')).toBeUndefined()
    expect(asDeviceId('device/one')).toBeUndefined()
    expect(asWorkspaceId('workspace one')).toBeUndefined()
    expect(asSessionId('')).toBeUndefined()
  })

  it('isolates remote principals by device, workspace, and session owner', () => {
    const local = principal('principal-local-test', 'local-profile')
    const alice = principal('principal-device-alice', 'paired-device')
    const bob = principal('principal-device-bob', 'paired-device')
    const registry = new UserScopeRegistry(local)
    registry.addPrincipal(alice)
    registry.addPrincipal(bob)
    const aliceDevice: DeviceBinding = {
      deviceId: asDeviceId('device-alice')!,
      principalId: alice.id,
      createdAt: 1,
      lastSeenAt: 1,
    }
    const bobDevice: DeviceBinding = {
      deviceId: asDeviceId('device-bob')!,
      principalId: bob.id,
      createdAt: 1,
      lastSeenAt: 1,
    }
    registry.registerDevice(aliceDevice)
    registry.registerDevice(bobDevice)
    registry.grantWorkspace({
      principalId: alice.id,
      workspaceId: asWorkspaceId('workspace-a')!,
      permission: 'use',
      createdAt: 1,
    })
    registry.grantWorkspace({
      principalId: bob.id,
      workspaceId: asWorkspaceId('workspace-b')!,
      permission: 'use',
      createdAt: 1,
    })
    registry.registerSession({
      sessionId: asSessionId('session-alice')!,
      workspaceId: asWorkspaceId('workspace-a')!,
      createdByPrincipalId: alice.id,
      createdAt: 1,
      updatedAt: 1,
    })

    const aliceScope = { principalId: alice.id, deviceId: aliceDevice.deviceId, source: 'remote' as const }
    const bobScope = { principalId: bob.id, deviceId: bobDevice.deviceId, source: 'remote' as const }
    expect(registry.access(aliceScope, { kind: 'workspace', workspaceId: asWorkspaceId('workspace-a')! }).allowed).toBe(true)
    expect(registry.access(aliceScope, { kind: 'session', sessionId: asSessionId('session-alice')! }).allowed).toBe(true)
    expect(registry.access(bobScope, { kind: 'workspace', workspaceId: asWorkspaceId('workspace-a')! }).allowed).toBe(false)
    expect(registry.access(bobScope, { kind: 'session', sessionId: asSessionId('session-alice')! }).allowed).toBe(false)
    expect(registry.visibleSessions(aliceScope).map(item => item.sessionId)).toEqual([asSessionId('session-alice')!])
    expect(registry.visibleSessions(bobScope)).toEqual([])
  })

  it('revocation and principal/device mismatch fail closed', () => {
    const local = principal('principal-local-revoke', 'local-profile')
    const remote = principal('principal-device-revoke', 'paired-device')
    const other = principal('principal-device-other', 'paired-device')
    const registry = new UserScopeRegistry(local)
    registry.addPrincipal(remote)
    registry.addPrincipal(other)
    registry.registerDevice({
      deviceId: asDeviceId('device-revoke')!,
      principalId: remote.id,
      createdAt: 1,
      lastSeenAt: 1,
    })
    const resource = { kind: 'principal' as const, principalId: remote.id }
    expect(registry.access({ principalId: remote.id, deviceId: asDeviceId('device-revoke')!, source: 'remote' }, resource)).toEqual({ allowed: true, reason: 'allowed' })
    expect(registry.access({ principalId: other.id, deviceId: asDeviceId('device-revoke')!, source: 'remote' }, resource)).toEqual({ allowed: false, reason: 'device-principal-mismatch' })
    registry.revokeDevice(asDeviceId('device-revoke')!, 2)
    expect(registry.access({ principalId: remote.id, deviceId: asDeviceId('device-revoke')!, source: 'remote' }, resource)).toEqual({ allowed: false, reason: 'revoked-device' })
    expect(decideAccess(registry.snapshot(), local.id, { principalId: remote.id, source: 'remote' }, resource)).toEqual({ allowed: false, reason: 'missing-device' })
  })

  it('keeps the local desktop profile as the administrative view', () => {
    const local = principal('principal-local-admin', 'local-profile')
    const remote = principal('principal-device-admin', 'paired-device')
    const registry = new UserScopeRegistry(local)
    registry.addPrincipal(remote)
    registry.registerDevice({ deviceId: asDeviceId('device-admin')!, principalId: remote.id, createdAt: 1, lastSeenAt: 1 })
    registry.registerSession({ sessionId: asSessionId('session-admin')!, createdByPrincipalId: remote.id, createdAt: 1, updatedAt: 1 })
    expect(registry.access({ principalId: local.id, source: 'desktop' }, { kind: 'session', sessionId: asSessionId('session-admin')! })).toEqual({ allowed: true, reason: 'allowed' })
    expect(registry.access({ principalId: remote.id, deviceId: asDeviceId('device-admin')!, source: 'remote' }, { kind: 'session', sessionId: asSessionId('session-admin')! })).toEqual({ allowed: true, reason: 'allowed' })
  })

  it('does not expose mutable authorization arrays through snapshots', () => {
    const local = principal('principal-local-clone', 'local-profile')
    const remote = principal('principal-device-clone', 'paired-device')
    const other = principal('principal-device-clone-other', 'paired-device')
    const registry = new UserScopeRegistry(local)
    registry.addPrincipal(remote)
    registry.addPrincipal(other)
    registry.registerDevice({ deviceId: asDeviceId('device-clone')!, principalId: remote.id, createdAt: 1, lastSeenAt: 1 })
    registry.registerDevice({ deviceId: asDeviceId('device-clone-other')!, principalId: other.id, createdAt: 1, lastSeenAt: 1 })
    const sessionId = asSessionId('session-clone')!
    registry.registerSession({
      sessionId,
      createdByPrincipalId: remote.id,
      createdAt: 1,
      updatedAt: 1,
      grantedPrincipalIds: [remote.id],
    })
    const otherScope = { principalId: other.id, deviceId: asDeviceId('device-clone-other')!, source: 'remote' as const }
    const snapshot = registry.snapshot()
    snapshot.sessions[0]!.grantedPrincipalIds!.push(other.id)
    expect(registry.access(otherScope, { kind: 'session', sessionId }).allowed).toBe(false)

    const visible = registry.visibleSessions({ principalId: remote.id, deviceId: asDeviceId('device-clone')!, source: 'remote' })
    visible[0]!.grantedPrincipalIds!.push(other.id)
    expect(registry.access(otherScope, { kind: 'session', sessionId }).allowed).toBe(false)
  })
})
