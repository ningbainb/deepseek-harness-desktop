import type { SessionId as OfficialSessionId } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { AccessScope, SessionId, UserScopeService, WorkspaceId } from '@ningbainb/dsh-user-scope'
import { setImmediate as yieldToRuntime } from 'node:timers/promises'
import type { SearchDocument, SearchHit } from '../core/search.ts'
import { tokenize } from '../core/search.ts'
import { Embeddings, type EmbeddingConfig } from './embeddings.ts'
import { digest, PrincipalIndex } from './index-store.ts'
import { buildKnowledgeSource, currentKnowledgeRevision, deleteSource, KnowledgeSources, resolveSource, sourceKey, type KnowledgeSource } from './knowledge.ts'
import { sessionDocuments } from './session-content.ts'

export interface SessionSearchRequest {
  query: string
  workspaceId?: string
  after?: number
  before?: number
  limit?: number
}

interface MemoryFilter {
  workspaceId?: string
  sessionId?: string
  now: number
  limit: number
  exclude?: ReadonlySet<string>
}

type MemorySource = (scope: AccessScope) => Promise<{ revision: string; docs: SearchDocument[] }>
type Agent = NonNullable<ToolRunContext['agent']>
type Authority = Pick<UserScopeService, 'desktopScope' | 'currentScope' | 'canAccess' | 'snapshot' | 'ready'>
type Query = Pick<SessionQueryEngine, 'listSessions' | 'readSession' | 'readTitle'>
type Workspaces = Pick<WorkspaceRegistry, 'list'>

interface ScopeIndex {
  index: PrincipalIndex
  loading?: Promise<void>
  sessionRefresh?: Promise<void>
  lastSessionRefresh?: number
  changes?: Promise<unknown>
  memoryWork?: { revision: string; pending: Promise<void> }
}

export class SearchAccessError extends Error {
  constructor() { super('Local search access is unavailable') }
}

export class LocalSearchService {
  private readonly indexes = new Map<string, ScopeIndex>()
  private readonly owners: KnowledgeSources
  private readonly embeddings: Embeddings
  private readonly queryVectors = new Map<string, { vector: number[]; time: number }>()
  private readonly sessionWrites = new Map<string, symbol>()
  private readonly abort = new AbortController()
  private memorySource?: MemorySource

  constructor(
    private readonly home: string,
    private readonly authority: Authority,
    private readonly sessions: Query,
    private readonly workspaces: Workspaces,
    embedding?: EmbeddingConfig,
  ) {
    this.owners = new KnowledgeSources(home)
    this.embeddings = new Embeddings(home, embedding)
  }

  dispose(): void {
    this.abort.abort()
    for (const { index } of this.indexes.values()) index.close()
    this.indexes.clear()
    this.queryVectors.clear()
    this.sessionWrites.clear()
  }

  desktopScope(): AccessScope | undefined {
    return this.authority.desktopScope()
  }

  desktopRequestScope(): AccessScope | undefined {
    const current = this.authority.currentScope()
    return current?.source === 'remote' ? undefined : this.desktopScope()
  }

  async warmDesktop(): Promise<void> {
    await this.authority.ready()
    await yieldToRuntime()
    const scope = this.desktopScope()
    if (scope && !this.abort.signal.aborted) this.refreshSessions(scope)
  }

  private admitted(scope: AccessScope): boolean {
    return !this.abort.signal.aborted
      && this.authority.canAccess(scope, { kind: 'principal', principalId: scope.principalId }).allowed
  }

  private workspace(scope: AccessScope, id: string) {
    const workspace = this.workspaces.list().find(item => String(item.id) === id)
    if (!workspace || !this.admitted(scope)
      || !this.authority.canAccess(scope, { kind: 'workspace', workspaceId: id as WorkspaceId }).allowed) {
      throw new SearchAccessError()
    }
    return workspace
  }

  private sessionWorkspace(id: string): string | undefined {
    return this.workspaces.list().find(item => item.sessionIds.some(candidate => String(candidate) === id))?.id
      ?? this.authority.snapshot().sessions.find(item => item.sessionId === id)?.workspaceId
  }

  private ownsSession(scope: AccessScope, sessionId: string): boolean {
    return this.admitted(scope) && this.authority.canAccess(scope, { kind: 'session', sessionId: sessionId as SessionId }).allowed
      && this.authority.snapshot().sessions.some(row => row.sessionId === sessionId && row.createdByPrincipalId === scope.principalId)
  }

  private state(scope: AccessScope): ScopeIndex {
    if (!this.admitted(scope)) throw new SearchAccessError()
    const id = scope.principalId
    const existing = this.indexes.get(id)
    if (existing) return existing
    const state: ScopeIndex = { index: new PrincipalIndex(this.home, id) }
    this.indexes.set(id, state)
    state.loading = yieldToRuntime().then(() => this.rebuildSources(scope, state.index)).catch(() => undefined)
      .finally(() => { state.loading = undefined })
    return state
  }

  private async rebuildSources(scope: AccessScope, index: PrincipalIndex): Promise<void> {
    if (!this.admitted(scope)) return
    const sources = await this.owners.read(scope.principalId)
    if (!this.admitted(scope)) return
    const keys = new Set(sources.map(sourceKey))
    for (const key of index.sources('knowledge')) if (!keys.has(key)) index.remove('knowledge', key)
    for (const source of sources) {
      if (!this.admitted(scope)) return
      try {
        const current = this.workspace(scope, source.workspaceId)
        await buildKnowledgeSource(index, source, current.path, this.embeddings,
          () => this.currentWorkspace(scope, source.workspaceId, current.path))
      } catch {
        if (this.admitted(scope)) deleteSource(index, source)
      }
      await yieldToRuntime()
    }
    if (this.memorySource && this.admitted(scope)) {
      const { revision, docs } = await this.memorySource(scope)
      if (this.admitted(scope)) void this.syncMemory(scope, revision, docs).catch(() => {})
    }
  }

  registerMemorySource(source: MemorySource): () => void {
    this.memorySource = source
    const scope = this.desktopScope()
    if (scope && this.admitted(scope)) void source(scope).then(({ revision, docs }) => this.syncMemory(scope, revision, docs)).catch(() => {})
    return () => { if (this.memorySource === source) this.memorySource = undefined }
  }

  private serialize<T>(state: ScopeIndex, change: () => Promise<T>): Promise<T> {
    const operation = (state.changes ?? Promise.resolve()).catch(() => {}).then(change)
    state.changes = operation
    return operation.finally(() => { if (state.changes === operation) state.changes = undefined })
  }

  async syncMemory(scope: AccessScope, revision: string, docs: SearchDocument[]): Promise<void> {
    const state = this.state(scope)
    const version = this.embeddings.revision + ':' + revision
    if (state.index.revision('memory', 'memory') === version) return
    if (!this.embeddings.enabled) { state.index.replace('memory', 'memory', version, docs); return }
    if (state.memoryWork?.revision === version) return state.memoryWork.pending
    const lexical = version + ':lexical'
    state.index.replace('memory', 'memory', lexical, docs)
    const current = () => this.admitted(scope) && state.memoryWork?.pending === pending
      && state.index.revision('memory', 'memory') === lexical
    const pending = yieldToRuntime().then(async () => {
      const enriched = await this.embeddings.documents(docs, batch => current() && batch.every(row => this.visibleMemory(scope, row)))
      if (current()) state.index.replace('memory', 'memory', version, enriched)
    }).finally(() => { if (state.memoryWork?.pending === pending) state.memoryWork = undefined })
    state.memoryWork = { revision: version, pending }
    return pending
  }

  private visibleMemory(scope: AccessScope, row: SearchDocument): boolean {
    return row.scope === 'global' || row.scope === 'workspace' && row.workspaceId !== undefined
      && this.authority.canAccess(scope, { kind: 'workspace', workspaceId: row.workspaceId as WorkspaceId }).allowed
      || row.scope === 'session' && row.sessionId !== undefined && this.ownsSession(scope, row.sessionId)
  }

  async warmMemoryQuery(scope: AccessScope, query: string): Promise<void> {
    if (!this.admitted(scope)) return
    const key = scope.principalId + '\0' + digest(query)
    if ((this.queryVectors.get(key)?.time ?? 0) + 30_000 >= Date.now()) return
    const vector = await this.embeddings.query(query)
    if (!vector || !this.admitted(scope)) return
    this.queryVectors.set(key, { vector, time: Date.now() })
    while (this.queryVectors.size > 64) this.queryVectors.delete(this.queryVectors.keys().next().value!)
  }

  searchMemory(scope: AccessScope, revision: string, query: string, filter: MemoryFilter): SearchHit[] | undefined {
    if (!this.admitted(scope)) throw new SearchAccessError()
    const index = this.indexes.get(scope.principalId)?.index
    const version = this.embeddings.revision + ':' + revision
    const indexed = index?.revision('memory', 'memory')
    if (!index || (indexed !== version && indexed !== version + ':lexical')) return undefined
    const vector = this.queryVectors.get(scope.principalId + '\0' + digest(query))
    return index.search(query, { ...filter, namespace: 'memory', vector: vector && vector.time + 30_000 >= Date.now() ? vector.vector : undefined })
      .filter(row => this.visibleMemory(scope, row))
  }

  refreshSessions(scope: AccessScope): void {
    const state = this.state(scope)
    if (state.sessionRefresh || (state.lastSessionRefresh ?? 0) + 15_000 > Date.now()) return
    state.sessionRefresh = yieldToRuntime().then(async () => {
      const rows = await this.sessions.listSessions(this.abort.signal)
      if (!this.admitted(scope)) return
      const authorized = rows.filter(({ header }) => header.origin !== 'subagent' && this.ownsSession(scope, header.id))
      const visible = new Set(authorized.map(({ header }) => String(header.id)))
      for (const id of state.index.sources('sessions')) if (!visible.has(id)) state.index.remove('sessions', id)
      for (const { header } of authorized) {
        if (!this.admitted(scope)) break
        await this.updateSession(scope, header.id).catch(() => {})
        await yieldToRuntime()
      }
      state.lastSessionRefresh = Date.now()
    }).catch(() => {}).finally(() => { state.sessionRefresh = undefined })
  }

  async updateSession(scope: AccessScope, sessionId: OfficialSessionId): Promise<void> {
    if (!this.ownsSession(scope, sessionId)) return
    const key = scope.principalId + '\0' + sessionId
    const write = Symbol()
    this.sessionWrites.set(key, write)
    try {
      const index = this.state(scope).index
      const workspaceId = this.sessionWorkspace(sessionId)
      const root = workspaceId === undefined ? undefined : this.workspace(scope, workspaceId).path
      const allowed = () => this.ownsSession(scope, sessionId) && workspaceId === this.sessionWorkspace(sessionId)
        && this.sessionWrites.get(key) === write
        && (workspaceId === undefined || root !== undefined && this.currentWorkspace(scope, workspaceId, root))
      const { events, session } = await this.sessions.readSession(sessionId)
      if (session.origin === 'subagent' || !allowed()) return
      const final = events.at(-1)
      const revision = [this.embeddings.revision, workspaceId, final?.seq, final?.time, events.length].join(':')
      if (index.revision('sessions', sessionId) === revision) return
      const title = (await this.sessions.readTitle(sessionId, this.abort.signal).catch(() => undefined))?.title ?? ''
      if (!allowed()) return
      const docs = await this.embeddings.documents(sessionDocuments(sessionId, title, workspaceId, events), allowed)
      if (allowed()) index.replace('sessions', sessionId, revision, docs)
    } finally {
      if (this.sessionWrites.get(key) === write) this.sessionWrites.delete(key)
    }
  }

  async searchSessions(scope: AccessScope, request: SessionSearchRequest) {
    if (request.workspaceId !== undefined) this.workspace(scope, request.workspaceId)
    this.refreshSessions(scope)
    const state = this.state(scope)
    const vector = await this.embeddings.query(request.query)
    if (!this.admitted(scope)) throw new SearchAccessError()
    if (request.workspaceId !== undefined) this.workspace(scope, request.workspaceId)
    const hits = state.index.search(request.query, { ...request, namespace: 'sessions', vector, limit: 50 })
      .filter(row => row.sessionId !== undefined && this.ownsSession(scope, row.sessionId)
        && row.workspaceId === this.sessionWorkspace(row.sessionId)
        && (!row.workspaceId || this.authority.canAccess(scope, { kind: 'workspace', workspaceId: row.workspaceId as WorkspaceId }).allowed))
      .slice(0, request.limit ?? 20).map(row => ({
        sessionId: row.sessionId!, workspaceId: row.workspaceId, seq: row.seq ?? 0, turn: row.turn ?? 0,
        title: row.title, excerpt: excerpt(row.text, request.query), timestamp: row.updatedAt,
        reasons: row.reasons, score: row.score,
      }))
    return { hits, indexing: Boolean(state.sessionRefresh) }
  }

  async status(scope: AccessScope, workspaceId?: string) {
    if (workspaceId !== undefined) this.workspace(scope, workspaceId)
    const state = this.state(scope)
    const sources = workspaceId ? await this.owners.read(scope.principalId) : []
    if (!this.admitted(scope)) throw new SearchAccessError()
    if (workspaceId !== undefined) this.workspace(scope, workspaceId)
    return {
      status: state.index.status(),
      sources: sources.filter(source => source.workspaceId === workspaceId).map(({ path, kind }) => ({ path, kind })),
      workspaces: this.workspaces.list()
        .filter(workspace => this.authority.canAccess(scope, { kind: 'workspace', workspaceId: workspace.id as unknown as WorkspaceId }).allowed)
        .map(workspace => ({ id: workspace.id, title: workspace.title })),
      indexing: Boolean(state.loading || state.sessionRefresh),
    }
  }

  rebuild(scope: AccessScope): void {
    const state = this.state(scope)
    if (state.loading) return
    for (const namespace of ['sessions', 'knowledge', 'memory'] as const) {
      for (const source of state.index.sources(namespace)) state.index.remove(namespace, source)
    }
    state.lastSessionRefresh = undefined
    state.loading = yieldToRuntime().then(() => this.rebuildSources(scope, state.index)).catch(() => undefined)
      .finally(() => { state.loading = undefined })
    this.refreshSessions(scope)
  }

  private currentWorkspace(scope: AccessScope, workspaceId: string, path: string): boolean {
    try { return this.workspace(scope, workspaceId).path === path } catch { return false }
  }

  async changePath(scope: AccessScope, workspaceId: string, input: string, operation: 'add' | 'remove'): Promise<{ chunks: number }> {
    const workspace = this.workspace(scope, workspaceId)
    const state = this.state(scope)
    await state.loading
    return this.serialize(state, async () => {
      const path = operation === 'add' ? (await resolveSource(workspace.path, input)).relativePath : input
      const allowed = () => this.currentWorkspace(scope, workspaceId, workspace.path)
      const source: KnowledgeSource = { kind: 'path', workspaceId, path }
      if (!allowed()) throw new SearchAccessError()
      if (operation === 'remove') {
        await this.owners.change(scope.principalId, 'remove', source, allowed)
        if (allowed()) deleteSource(state.index, source)
        return { chunks: 0 }
      }
      const chunks = await buildKnowledgeSource(state.index, source, workspace.path, this.embeddings, allowed,
        () => this.owners.change(scope.principalId, 'save', source, allowed))
      return { chunks }
    })
  }

  private agentWorkspace(agent: Agent) {
    const scope = this.authority.currentScope() ?? this.desktopScope()
    const sessionId = String(agent.session.id)
    if (!scope || agent.session.header.origin === 'subagent' || !this.ownsSession(scope, sessionId)) throw new SearchAccessError()
    const workspaceId = this.sessionWorkspace(sessionId)
    if (!workspaceId) throw new SearchAccessError()
    const workspace = this.workspace(scope, workspaceId)
    const root = workspace.path
    const allowed = () => this.ownsSession(scope, sessionId) && workspaceId === this.sessionWorkspace(sessionId)
      && this.currentWorkspace(scope, workspaceId, root)
    return { scope, workspaceId, root, allowed }
  }

  async indexMarkdownForAgent(agent: Agent, input: { sourcePath: string; markdown: string }): Promise<{ chunks: number }> {
    const { scope, workspaceId, root, allowed } = this.agentWorkspace(agent)
    if (!input.markdown.trim() || Buffer.byteLength(input.markdown) > 2 * 1024 * 1024) throw new Error('Document is outside the knowledge source size limit')
    const { relativePath } = await resolveSource(root, input.sourcePath, true)
    const state = this.state(scope)
    await state.loading
    return this.serialize(state, async () => {
      const source: KnowledgeSource = { workspaceId, path: relativePath, markdown: input.markdown, kind: 'document', updatedAt: Date.now() }
      await this.owners.change(scope.principalId, 'save', source, allowed)
      const chunks = await buildKnowledgeSource(state.index, source, root, this.embeddings, allowed)
      return { chunks }
    })
  }

  private async visibleKnowledgeSources(
    agent: ReturnType<LocalSearchService['agentWorkspace']>, index: PrincipalIndex,
  ): Promise<ReadonlySet<string>> {
    const sources = await this.owners.read(agent.scope.principalId)
    if (!agent.allowed()) throw new SearchAccessError()
    const visible = new Set<string>()
    for (const source of sources) {
      if (source.workspaceId !== agent.workspaceId) continue
      const key = sourceKey(source)
      if (currentKnowledgeRevision(source, agent.root, this.embeddings.revision, index.revision('knowledge', key))) visible.add(key)
    }
    return visible
  }

  async searchKnowledge(agent: Agent, query: string, limit?: number) {
    const access = this.agentWorkspace(agent)
    const state = this.state(access.scope)
    await state.loading
    if (!access.allowed()) throw new SearchAccessError()
    const vector = await this.embeddings.query(query)
    const allowedSources = await this.visibleKnowledgeSources(access, state.index)
    if (!access.allowed()) throw new SearchAccessError()
    return state.index.search(query, { namespace: 'knowledge', workspaceId: access.workspaceId, allowedSources, vector, limit: Math.min(limit ?? 8, 12) })
      .map(({ id, title, text, headings, path, score, reasons }) => ({ id, title, excerpt: excerpt(text, query), headings, path, score, reasons }))
  }

  async readKnowledge(agent: Agent, id: string) {
    const access = this.agentWorkspace(agent)
    const state = this.state(access.scope)
    await state.loading
    const allowedSources = await this.visibleKnowledgeSources(access, state.index)
    if (!access.allowed()) throw new SearchAccessError()
    const row = state.index.get('knowledge', id, allowedSources)
    if (!row || row.workspaceId !== access.workspaceId) throw new SearchAccessError()
    const { text, path, title, headings } = row
    return { id, text, path, title, headings, sourceIsUntrusted: true }
  }
}

function excerpt(value: string, query: string): string {
  const normalized = value.toLowerCase()
  const match = tokenize(query).map(term => normalized.indexOf(term)).filter(index => index >= 0)
  const from = Math.max(0, (match.length ? Math.min(...match) : 0) - 60)
  const to = Math.min(value.length, from + 420)
  return (from ? '…' : '') + value.slice(from, to).replace(/\s+/gu, ' ').trim() + (to < value.length ? '…' : '')
}
