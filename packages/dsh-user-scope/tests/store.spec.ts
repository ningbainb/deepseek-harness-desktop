import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asPrincipalId, asSessionId } from '../src/core/ids.ts'
import { emptyOwnershipSnapshot, parseOwnershipSnapshot, type Principal } from '../src/core/schema.ts'
import {
  CorruptUserScopeError,
  UnsupportedSchemaVersionError,
  UserScopeStore,
} from '../src/store.ts'

let root: string

const local: Principal = {
  id: asPrincipalId('principal-local-store')!,
  kind: 'local-profile',
  createdAt: 1,
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-user-scope-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('UserScopeStore', () => {
  it('persists one local principal and private ownership documents', async () => {
    const store = new UserScopeStore({ rootDir: root })
    expect(await store.ensureLocalPrincipal(() => local)).toEqual(local)
    expect(await store.ensureLocalPrincipal(() => ({ ...local, id: asPrincipalId('principal-other')! }))).toEqual(local)
    await store.saveOwnership(emptyOwnershipSnapshot(local))
    const loaded = await store.loadOwnership()
    expect(loaded?.principals).toEqual([local])
    const principalDocument = JSON.parse(await readFile(store.principalFilename, 'utf8')) as { version: number }
    expect(principalDocument.version).toBe(1)
    if (process.platform !== 'win32') {
      expect((await stat(store.rootDir)).mode & 0o777).toBe(0o700)
      expect((await stat(store.principalFilename)).mode & 0o777).toBe(0o600)
    }
  })

  it('serializes read-modify-write updates under the official file lock', async () => {
    const store = new UserScopeStore({ rootDir: root })
    const initial = emptyOwnershipSnapshot(local)
    await store.saveOwnership(initial)
    const updates = await Promise.all([
      store.updateOwnership(async current => {
        await new Promise(resolve => setTimeout(resolve, 20))
        return { ...current!, sessions: [...current!.sessions] }
      }),
      store.updateOwnership(current => ({ ...current!, grants: [...current!.grants] })),
    ])
    expect(updates).toHaveLength(2)
    expect(await store.loadOwnership()).toEqual(initial)
  })

  it('waits for the official lock during a direct ownership save', async () => {
    const store = new UserScopeStore({ rootDir: root, lockWaitMs: 1_000 })
    const initial = emptyOwnershipSnapshot(local)
    await store.saveOwnership(initial)
    const lockFilename = store.ownershipFilename + '.lock'
    await writeFile(lockFilename, 'test lock', 'utf8')
    const next = {
      ...initial,
      sessions: [{
        sessionId: asSessionId('session-direct-save')!,
        createdByPrincipalId: local.id,
        createdAt: 1,
        updatedAt: 1,
      }],
    }
    try {
      const pending = store.saveOwnership(next)
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(JSON.parse(await readFile(store.ownershipFilename, 'utf8'))).toEqual(initial)
      await rm(lockFilename, { force: true })
      await pending
      expect((await store.loadOwnership())?.sessions).toHaveLength(1)
    } finally {
      await rm(lockFilename, { force: true })
    }
  })

  it('does not overwrite an unknown newer schema', async () => {
    const store = new UserScopeStore({ rootDir: root })
    const future = JSON.stringify({ version: 2, principals: [], devices: [], grants: [], sessions: [] })
    await store.saveOwnership(emptyOwnershipSnapshot(local))
    await writeFile(store.ownershipFilename, future, 'utf8')
    await expect(store.loadOwnership()).rejects.toBeInstanceOf(UnsupportedSchemaVersionError)
    expect(await readFile(store.ownershipFilename, 'utf8')).toBe(future)
  })

  it('blocks malformed state instead of dropping it', async () => {
    const store = new UserScopeStore({ rootDir: root })
    const invalid = '{"version":1,"principals":null}'
    await writeFile(store.ownershipFilename, invalid, 'utf8')
    await expect(store.loadOwnership()).rejects.toBeInstanceOf(CorruptUserScopeError)
    expect(await readFile(store.ownershipFilename, 'utf8')).toBe(invalid)
    expect(await readFile(store.ownershipFilename + '.corrupt', 'utf8')).toBe(invalid)
  })

  it('rejects session grants that reference an unknown principal', () => {
    const parsed = parseOwnershipSnapshot({
      ...emptyOwnershipSnapshot(local),
      sessions: [{
        sessionId: asSessionId('session-dangling-grant')!,
        createdByPrincipalId: local.id,
        createdAt: 1,
        updatedAt: 1,
        grantedPrincipalIds: [asPrincipalId('principal-missing')!],
      }],
    })
    expect(parsed).toEqual({ ok: false, kind: 'invalid' })
  })
})
