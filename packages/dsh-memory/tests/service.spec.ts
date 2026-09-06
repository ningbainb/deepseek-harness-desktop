import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AccessScope, PrincipalId, SessionId } from '@ningbainb/dsh-user-scope'
import {
  MemoryService,
  MemoryValidationError,
  MemoryStore,
  type MemoryRequestContext,
} from '../src/index.ts'

const principalA = 'principal-service-a' as PrincipalId
const principalB = 'principal-service-b' as PrincipalId
const sessionA = 'session-service-a' as SessionId

function authority(local: PrincipalId, sessions: readonly { sessionId: string; createdByPrincipalId: string; workspaceId?: string }[] = []) {
  return {
    availabilityState: () => 'ready',
    localPrincipal: () => ({ id: local }),
    currentScope: () => undefined,
    snapshot: () => ({ sessions }),
    canAccess: (scope: AccessScope, resource: { kind: string }) => ({
      allowed: scope.source === 'desktop'
        ? scope.principalId === local
        : resource.kind === 'principal' && scope.principalId === local,
    }),
  }
}

async function serviceFor(local: PrincipalId, root: string, sessions: readonly { sessionId: string; createdByPrincipalId: string; workspaceId?: string }[] = []) {
  return new MemoryService({
    userScope: authority(local, sessions),
    store: new MemoryStore({ rootDir: root }),
    now: () => 100,
  })
}

describe('memory service', () => {
  it('keeps each principal in a separate cache and file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const a = await serviceFor(principalA, root)
    const b = await serviceFor(principalB, root)
    const contextA = a.localContext()
    expect(contextA).toBeDefined()
    await a.save(contextA!, { scope: 'global', content: 'private A' })
    expect((await b.list(b.localContext()!)).ok).toBe(true)
    if (b.list) expect((await b.list(b.localContext()!)).value).toEqual([])
  })

  it('requires owner-confirmed session scope and keeps suggestions pending', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const service = await serviceFor(principalA, root, [{ sessionId: sessionA, createdByPrincipalId: principalA }])
    const context = service.contextFor({ principalId: principalA, source: 'desktop' }, { sessionId: sessionA })
    expect(context).toBeDefined()
    const pending = service.suggest(context!, { scope: 'session', sessionId: sessionA, content: 'session fact' })
    expect((await service.store.load(principalA)).items).toEqual([])
    await service.confirm(context!, pending.id)
    expect((await service.store.load(principalA)).items).toHaveLength(1)
    const foreign = service.contextFor({ principalId: principalA, source: 'desktop' }, { sessionId: 'foreign-session' })
    expect(foreign).toBeUndefined()
  })

  it('checks the live owner scope before consulting a pending suggestion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    let available = true
    const authorityValue = authority(principalA, [])
    const service = new MemoryService({
      userScope: {
        ...authorityValue,
        availabilityState: () => available ? 'ready' : 'blocked',
      },
      store: new MemoryStore({ rootDir: root }),
      now: () => 100,
    })
    const context = service.localContext()
    expect(context).toBeDefined()
    const pending = service.suggest(context!, { scope: 'global', content: 'owner-confirmed fact' })
    available = false
    await expect(service.confirm(context!, pending.id)).rejects.toMatchObject({ code: 'access-denied' })
    expect((await service.store.load(principalA)).items).toEqual([])
  })

  it('rejects sensitive suggestions with a generic validation message', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const service = await serviceFor(principalA, root)
    const context = service.localContext() as MemoryRequestContext
    expect(() => service.suggest(context, { scope: 'global', content: 'password: long-secret-value-123456' }))
      .toThrowError(MemoryValidationError)
    expect((await service.store.load(principalA)).items).toEqual([])
  })

  it('does not accept an arbitrary workspace when session workspace resolution is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const service = new MemoryService({
      userScope: authority(principalA, [{ sessionId: sessionA, createdByPrincipalId: principalA }]),
      store: new MemoryStore({ rootDir: root }),
      resolveWorkspaceForSession: () => { throw new Error('workspace registry unavailable') },
    })
    const base = { principalId: principalA, source: 'desktop' as const }
    expect(service.contextFor(base, { sessionId: sessionA })).toMatchObject({ sessionId: sessionA })
    expect(service.contextFor(base, { sessionId: sessionA, workspaceId: 'workspace-arbitrary' })).toBeUndefined()
  })
})

