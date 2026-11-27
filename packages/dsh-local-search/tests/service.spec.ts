import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AccessScope } from '@ningbainb/dsh-user-scope'
import type { EmbeddingConfig } from '../src/host/embeddings.ts'
import { expect, test, vi } from 'vitest'
import { PrincipalIndex } from '../src/host/index-store.ts'
import { KnowledgeSources } from '../src/host/knowledge.ts'
import { LocalSearchService, SearchAccessError } from '../src/host/service.ts'

test('isolates index and knowledge source catalogs even when two principals share a workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-owner-'))
  const workspace = join(root, 'project')
  await mkdir(workspace)
  await writeFile(join(workspace, 'guide.md'), '# Guide\n\n本地量化向量')
  const a = { principalId: 'alpha', source: 'desktop' } as AccessScope
  const b = { principalId: 'bravo', source: 'desktop' } as AccessScope
  const ownership = [{ sessionId: 'session-a', workspaceId: 'workspace', createdByPrincipalId: 'alpha' },
    { sessionId: 'session-b', workspaceId: 'workspace', createdByPrincipalId: 'bravo' }]
  let current = a
  const service = new LocalSearchService(root, {
    desktopScope: () => current, currentScope: () => current,
    canAccess: () => ({ allowed: true, reason: 'allowed' }), snapshot: () => ({ sessions: ownership }), ready: async () => {},
  } as never, { listSessions: async () => [], readSession: vi.fn(), readTitle: vi.fn() } as never,
  { list: () => [{ id: 'workspace', title: 'Project', path: workspace, sessionIds: ['session-a', 'session-b'] }] } as never)
  const agentA = { session: { id: 'session-a', header: {} } } as never
  const agentB = { session: { id: 'session-b', header: {} } } as never
  try {
    await expect(service.changePath(a, 'workspace', 'guide.md', 'add')).resolves.toEqual({ chunks: 1 })
    const matches = await service.searchKnowledge(agentA, '量化向量')
    expect(matches[0]).toMatchObject({ path: 'guide.md', headings: ['Guide'] })
    expect(await service.readKnowledge(agentA, matches[0]!.id)).toMatchObject({ text: '本地量化向量' })
    current = b
    expect((await service.status(b, 'workspace')).sources).toEqual([])
    expect(await service.searchKnowledge(agentB, '量化向量')).toEqual([])
    await expect(service.readKnowledge(agentB, matches[0]!.id)).rejects.toBeInstanceOf(SearchAccessError)
    await expect(service.searchKnowledge(agentA, '量化向量')).rejects.toBeInstanceOf(SearchAccessError)
  } finally {
    service.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects and reconciles derived chunks after the authoritative source is removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-orphan-'))
  const workspace = join(root, 'project')
  const scope = { principalId: 'alpha', source: 'desktop' } as AccessScope
  const agent = { session: { id: 'session', header: {} } } as never
  const openService = (embedding?: EmbeddingConfig) => new LocalSearchService(root, {
    desktopScope: () => scope, currentScope: () => scope,
    canAccess: () => ({ allowed: true, reason: 'allowed' }), ready: async () => {},
    snapshot: () => ({ sessions: [{ sessionId: 'session', workspaceId: 'workspace', createdByPrincipalId: 'alpha' }] }),
  } as never, { listSessions: async () => [], readSession: vi.fn(), readTitle: vi.fn() } as never,
  { list: () => [{ id: 'workspace', title: 'Project', path: workspace, sessionIds: ['session'] }] } as never, embedding)
  let service = openService({ mode: 'api', baseUrl: 'https://embedding.example/v1', model: 'fixture' })
  vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
    const { input } = JSON.parse(String(init.body)) as { input: string[] }
    return Response.json({ data: input.map((_, index) => ({ index, embedding: [1, 2] })) })
  })
  try {
    await mkdir(workspace)
    await writeFile(join(workspace, 'retired.md'), '# Retired\n\nvolatileIndexFixture')
    await writeFile(join(workspace, 'current.md'), '# Current\n\nvolatileIndexFixture')
    await service.changePath(scope, 'workspace', 'retired.md', 'add')
    await service.changePath(scope, 'workspace', 'current.md', 'add')
    expect((await service.status(scope, 'workspace')).status.vectorCount).toBe(2)
    const before = await service.searchKnowledge(agent, 'volatileIndexFixture')
    expect(before.map(hit => hit.path).sort()).toEqual(['current.md', 'retired.md'])
    const orphan = before.find(hit => hit.path === 'retired.md')!
    const catalog = new KnowledgeSources(root)
    // Simulate interruption immediately after the catalog removal is committed.
    await catalog.change(scope.principalId, 'remove', { kind: 'path', workspaceId: 'workspace', path: 'retired.md' }, () => true)
    expect((await service.searchKnowledge(agent, 'volatileIndexFixture', 1)).map(hit => hit.path)).toEqual(['current.md'])
    await expect(service.readKnowledge(agent, orphan.id)).rejects.toBeInstanceOf(SearchAccessError)
    service.dispose()
    service = openService()
    expect((await service.searchKnowledge(agent, 'volatileIndexFixture')).map(hit => hit.path)).toEqual(['current.md'])
    await expect(service.readKnowledge(agent, orphan.id)).rejects.toBeInstanceOf(SearchAccessError)
    const derived = new PrincipalIndex(root, scope.principalId)
    try {
      expect(derived.get('knowledge', orphan.id)).toBeUndefined()
      expect(derived.sources('knowledge')).toHaveLength(1)
      expect(derived.status().vectorCount).toBe(0)
    } finally {
      derived.close()
    }
  } finally {
    vi.unstubAllGlobals()
    service.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('rechecks session ownership after reading the title and before sending indexed text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-revoked-'))
  const scope = { principalId: 'alpha', source: 'desktop' } as AccessScope
  let sessionAllowed = true
  const service = new LocalSearchService(root, {
    desktopScope: () => scope,
    canAccess: (_scope: AccessScope, resource: { kind: string }) => ({ allowed: resource.kind !== 'session' || sessionAllowed }),
    ready: async () => {}, snapshot: () => ({ sessions: [{ sessionId: 'session', createdByPrincipalId: 'alpha' }] }),
  } as never, {
    readSession: async () => ({ session: {}, events: [{ type: 'user/message', seq: 1, time: 1,
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'unpublished history' }] } }] }),
    readTitle: async () => { sessionAllowed = false; return { title: 'Original title' } },
  } as never, { list: () => [] } as never,
  { mode: 'api', baseUrl: 'https://embedding.example/v1', model: 'fixture' })
  const requests = vi.fn()
  vi.stubGlobal('fetch', requests)
  try {
    await service.updateSession(scope, 'session' as never)
    expect(requests).not.toHaveBeenCalled()
    expect((await service.status(scope)).status.counts.sessions).toBe(0)
  } finally {
    vi.unstubAllGlobals()
    service.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
