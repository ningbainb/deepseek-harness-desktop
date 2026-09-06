import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asSessionId,
  UserScopeService,
  UserScopeUnavailableError,
  type AccessScope,
} from '../src/index.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-user-scope-service-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('UserScopeService', () => {
  it('bootstraps a profile identity and persists device/workspace/session ownership', async () => {
    const service = new UserScopeService(new Context(), { rootDir: root, now: () => 100 })
    await service.ready()
    expect(service.availabilityState()).toBe('ready')
    const local = service.localPrincipal()
    const bound = await service.bindDevice('device-service')
    await service.grantWorkspace(bound.principalId, 'workspace-service')
    await service.registerSession({
      sessionId: asSessionId('session-service')!,
      workspaceId: 'workspace-service',
      createdByPrincipalId: bound.principalId,
    })
    const remoteScope: AccessScope = { principalId: bound.principalId, deviceId: bound.deviceId, source: 'remote' }
    expect(service.canAccess(remoteScope, { kind: 'session', sessionId: asSessionId('session-service')! })).toEqual({ allowed: true, reason: 'allowed' })
    expect(service.run(remoteScope, () => service.currentScope())).toEqual(remoteScope)
    expect(service.canAccess({ principalId: local.id, source: 'desktop' }, { kind: 'session', sessionId: asSessionId('session-service')! })).toEqual({ allowed: true, reason: 'allowed' })
    await service.revokeDevice('device-service')
    expect(service.canAccess(remoteScope, { kind: 'session', sessionId: asSessionId('session-service')! })).toEqual({ allowed: false, reason: 'revoked-device' })

    const reopened = new UserScopeService(new Context(), { rootDir: root, now: () => 200 })
    await reopened.ready()
    expect(reopened.localPrincipal().id).toBe(local.id)
    expect(reopened.principalForDevice('device-service')).toBeUndefined()
  })

  it('fails closed when a future ownership schema is present', async () => {
    const service = new UserScopeService(new Context(), { rootDir: root, now: () => 100 })
    await service.ready()
    const filename = service.store.ownershipFilename
    const future = JSON.stringify({ version: 9, principals: [], devices: [], grants: [], sessions: [] })
    await writeFile(filename, future, 'utf8')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocked = new UserScopeService(new Context(), { rootDir: root, now: () => 200 })
    await blocked.ready()
    expect(blocked.availabilityState()).toBe('blocked')
    expect(blocked.canAccess({ principalId: blocked.localPrincipal().id, source: 'desktop' }, { kind: 'principal', principalId: blocked.localPrincipal().id })).toEqual({ allowed: false, reason: 'scope-unavailable' })
    await expect(blocked.bindDevice('device-blocked')).rejects.toBeInstanceOf(UserScopeUnavailableError)
    expect(await readFile(filename, 'utf8')).toBe(future)
    warning.mockRestore()
  })
})
