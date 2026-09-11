import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryService, MemoryStore, createMemoryItem, rankMemories, extractCurrentUserQuery } from '../src/index.ts'
import type { PrincipalId, SessionId, WorkspaceId } from '@ningbainb/dsh-user-scope'

const owner = 'optimization-owner' as PrincipalId
const sessionId = 'session-a' as SessionId
const workspaceId = 'workspace-a' as WorkspaceId
const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-optimization-')); dirs.push(root)
  const store = new MemoryStore({ rootDir: root })
  const authority = {
    availabilityState: () => 'ready', localPrincipal: () => ({ id: owner }), currentScope: () => undefined,
    snapshot: () => ({ sessions: [{ sessionId, workspaceId, createdByPrincipalId: owner }] }),
    canAccess: (scope: { principalId: string }) => ({ allowed: scope.principalId === owner }),
  }
  let now = 100
  const service = new MemoryService({ userScope: authority, store, now: () => now })
  const context = service.localContext()!
  const session = service.contextFor(context.scope, { sessionId })!
  return { service, context, session, store, tick: () => { now += 11_000 } }
}

describe('memory reliability and visible controls', () => {
  it('blocks empty direct-user queries, including subagent extraction, at search and prompt boundaries', async () => {
    const { service, context, session } = await fixture()
    await service.save(context, { scope: 'global', content: 'typescript preference' })
    const query = extractCurrentUserQuery({ header: { origin: 'subagent' }, snapshotEvents: () => [] } as any)
    expect(service.searchCached(session, query)).toEqual([])
    expect(await service.search(session, query)).toEqual({ ok: true, value: [] })
    expect(service.prepare(session, query, true)).toBe('')
    expect(service.recentActivity(session, true).status).toBe('empty-query')
  })

  it('management lists all authorized scopes and expired items without broadening model retrieval', async () => {
    const { service, context, session } = await fixture()
    await service.save(context, { scope: 'global', content: 'global' })
    await service.save(context, { scope: 'workspace', workspaceId, content: 'workspace' })
    await service.save(context, { scope: 'session', sessionId, content: 'session', expiresAt: 50 })
    expect((await service.listManaged(context)).value?.map(item => item.scope).sort()).toEqual(['global', 'session', 'workspace'])
    expect((await service.list(context)).value?.map(item => item.scope)).toEqual(['global'])
    expect((await service.list(session)).value?.map(item => item.scope)).toEqual(['workspace', 'global'])
    expect((await service.listManaged({ ...context, scope: { ...context.scope, source: 'remote' as any } })).ok).toBe(false)
  })

  it('explicit refresh sees another process and a corrupt file clears cached injection', async () => {
    const { service, context, session, store } = await fixture()
    await service.save(context, { scope: 'global', content: 'typescript first' })
    const other = createMemoryItem({ id: 'external', principalId: owner, scope: 'global', content: 'typescript external', source: 'explicit', createdAt: 1, updatedAt: 1 })
    await store.update(owner, current => ({ ...current, items: [...current.items, other] }))
    expect((await service.listManaged(context, true)).value).toHaveLength(2)
    await writeFile(store.filenameForPrincipal(owner), '{broken')
    expect((await service.listManaged(context, true)).ok).toBe(false)
    expect(service.searchCached(session, 'typescript')).toBeUndefined()
    await service.preload(context)
  })

  it('stale caches refresh before participating in prompt construction', async () => {
    const { service, context, session, tick } = await fixture()
    await service.save(context, { scope: 'global', content: 'typescript' })
    tick()
    expect(service.prepare(session, 'typescript', true)).toBe('')
    await service.preload(context)
    expect(service.prepare(session, 'typescript', true)).toContain('typescript')
  })

  it('rejects stale edits/deletes and clears only the reviewed set', async () => {
    const { service, context } = await fixture()
    const first = await service.save(context, { scope: 'global', content: 'first' })
    const workspace = await service.save(context, { scope: 'workspace', workspaceId, content: 'workspace' })
    const edited = await service.save(context, { ...first, content: 'new', expectedUpdatedAt: first.updatedAt })
    expect(edited.updatedAt).toBeGreaterThan(first.updatedAt)
    await expect(service.save(context, { ...first, content: 'stale', expectedUpdatedAt: first.updatedAt })).rejects.toMatchObject({ code: 'conflict' })
    await expect(service.remove(context, first.id, first.updatedAt)).rejects.toMatchObject({ code: 'conflict' })
    await service.clearSelected(context, [{ id: edited.id, updatedAt: edited.updatedAt }])
    expect((await service.listManaged(context)).value?.map(item => item.id)).toEqual([workspace.id])
  })

  it('deduplicates suggestions and makes replacement an explicit version-checked action', async () => {
    const { service, context, store } = await fixture()
    const existing = await service.save(context, { scope: 'global', content: 'Prefer JavaScript' })
    const suggestion = service.suggest(context, { scope: 'global', content: 'Prefer TypeScript' })
    expect(service.suggest(context, { scope: 'global', content: ' Prefer TypeScript ' }).id).toBe(suggestion.id)
    expect((await store.load(owner)).items).toHaveLength(1)
    await service.confirm(context, suggestion.id, { id: existing.id, updatedAt: existing.updatedAt })
    const items = (await store.load(owner)).items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: existing.id, content: 'Prefer TypeScript', source: 'confirmed-suggestion' })
    await expect(service.save(context, { scope: 'global', content: 'Prefer TypeScript' })).rejects.toMatchObject({ code: 'duplicate' })
  })

  it('explains prepared context and ignores only the selected session without deleting data', async () => {
    const { service, context, session } = await fixture()
    const item = await service.save(context, { scope: 'global', content: '项目使用严格模式', tags: ['typescript'] })
    expect(service.prepare(session, 'typescript', true)).toContain(item.content)
    expect(service.recentActivity(session, true).items[0]?.reason).toBe('tag')
    service.ignoreForSession(session, item.id)
    expect(service.prepare(session, 'typescript', true)).toBe('')
    expect((await service.search(session, 'typescript')).value).toEqual([])
    expect((await service.listManaged(context)).value).toHaveLength(1)
    service.ignoreForSession(session, null)
    expect(service.prepare(session, 'typescript', true)).toContain(item.content)
    expect(service.prepare(session, 'typescript', false)).toBe('')
    expect(service.recentActivity(session, false).items).toEqual([])
  })

  it('ranks useful tag/phrase matches and avoids unrelated single-character Chinese matches', () => {
    const item = createMemoryItem({ id: 'rank', principalId: owner, scope: 'global', content: '喜欢简短回复', tags: ['typescript'], source: 'explicit', createdAt: 1, updatedAt: 1 })
    expect(rankMemories([item], { principalId: owner, query: 'typescript', now: 2 })[0]?.reason).toBe('tag')
    expect(rankMemories([item], { principalId: owner, query: '请回复', now: 2 })).toHaveLength(1)
    expect(rankMemories([item], { principalId: owner, query: '修复回调', now: 2 })).toEqual([])
    const strong = { ...item, id: 'strong', content: 'typescript react components', tags: [] }
    const weak = { ...item, id: 'weak', scope: 'session' as const, sessionId, content: 'typescript', tags: [] }
    expect(rankMemories([weak, strong], { principalId: owner, sessionId, query: 'typescript react components', now: 2 })[0]?.item.id).toBe('strong')
  })
})
