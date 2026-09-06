import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PrincipalId } from '@ningbainb/dsh-user-scope'
import { MemoryStore, MemoryStoreError, createMemoryItem } from '../src/index.ts'

const principalA = 'principal-store-a' as PrincipalId
const principalB = 'principal-store-b' as PrincipalId

function item(id: string, content: string) {
  return createMemoryItem({
    id,
    principalId: principalA,
    scope: 'global',
    content,
    source: 'explicit',
    createdAt: 1,
    updatedAt: 1,
  })
}

describe('memory store', () => {
  it('uses one owner directory and keeps principals isolated across reloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const store = new MemoryStore({ rootDir: root })
    await store.save(principalA, { version: 1, items: [item('one', 'one')] })
    expect((await store.load(principalA)).items[0]?.content).toBe('one')
    expect((await store.load(principalB)).items).toEqual([])
    expect(store.filenameForPrincipal(principalA)).toContain(join(root, principalA, 'memories.json'))
  })

  it('serializes concurrent read-modify-write updates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const store = new MemoryStore({ rootDir: root })
    await Promise.all([
      store.update(principalA, current => ({ version: 1, items: [...current.items, item('one', 'one')] })),
      store.update(principalA, current => ({ version: 1, items: [...current.items, item('two', 'two')] })),
    ])
    expect((await store.load(principalA)).items.map(value => value.id).sort()).toEqual(['one', 'two'])
  })

  it('keeps drive-relative principal IDs inside the memory root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const store = new MemoryStore({ rootDir: root })
    const principal = 'A:outside' as PrincipalId
    if (process.platform === 'win32') {
      expect(() => store.filenameForPrincipal(principal)).toThrow(/invalid memory principal id/u)
      return
    }
    const filename = store.filenameForPrincipal(principal)
    const ownerRelative = relative(root, filename)
    expect(ownerRelative === '..' || ownerRelative.startsWith(`..${sep}`)).toBe(false)
  })

  it('waits for the official lock during a direct save', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const store = new MemoryStore({ rootDir: root, lockWaitMs: 1_000 })
    const initial = { version: 1 as const, items: [item('one', 'one')] }
    await store.save(principalA, initial)
    const filename = store.filenameForPrincipal(principalA)
    const lockFilename = filename + '.lock'
    await writeFile(lockFilename, 'test lock', 'utf8')
    const next = { version: 1 as const, items: [item('two', 'two')] }
    try {
      const pending = store.save(principalA, next)
      await new Promise(resolve => setTimeout(resolve, 50))
      const current = JSON.parse(await readFile(filename, 'utf8')) as { items: { id: string }[] }
      expect(current.items.map(value => value.id)).toEqual(['one'])
      await rm(lockFilename, { force: true })
      await pending
      expect((await store.load(principalA)).items.map(value => value.id)).toEqual(['two'])
    } finally {
      await rm(lockFilename, { force: true })
    }
  })

  it('fails closed on corrupt and future-version files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const store = new MemoryStore({ rootDir: root })
    const filename = store.filenameForPrincipal(principalA)
    await writeFile(filename, '{not-json', 'utf8').catch(async () => {
      await store.save(principalA, { version: 1, items: [] })
      await writeFile(filename, '{not-json', 'utf8')
    })
    await expect(store.load(principalA)).rejects.toMatchObject<Partial<MemoryStoreError>>({ code: 'corrupt' })
    expect(await readFile(filename + '.corrupt', 'utf8')).toBe('{not-json')
    await writeFile(filename, JSON.stringify({ version: 999, items: [] }), 'utf8')
    await expect(store.load(principalA)).rejects.toMatchObject<Partial<MemoryStoreError>>({ code: 'unsupported-version' })
    expect(await readFile(filename, 'utf8')).toBe(JSON.stringify({ version: 999, items: [] }))
    await expect(store.save(principalA, { version: 1, items: [item('replacement', 'must not overwrite future data')] }))
      .rejects.toMatchObject<Partial<MemoryStoreError>>({ code: 'unsupported-version' })
    expect(await readFile(filename, 'utf8')).toBe(JSON.stringify({ version: 999, items: [] }))
  })
})

