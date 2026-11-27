import { createHash } from 'node:crypto'
import type {
  AccessResource,
  AccessScope,
  PrincipalId,
  SessionId,
  UserScopeService,
  WorkspaceId,
} from '@ningbainb/dsh-user-scope'
import {
  createMemoryItem,
  isMemoryScope,
  isSafeMemoryId,
  MAX_MEMORY_INJECTION_ITEMS,
  MAX_MEMORY_ITEMS,
  MAX_PENDING_MEMORY_SUGGESTIONS,
  MemoryValidationError,
  normalizeMemorySnapshot,
  toPublicMemoryItem,
  type MemoryItem,
  type MemoryItemInput,
  type MemoryPublicItem,
  type MemoryScope,
  type MemorySnapshot,
  type MemorySource,
} from './schema.ts'
import { memoryScopeMatches, rankMemories, type MemoryQuery, type RankedMemory } from './rank.ts'
import { MemoryStore, MemoryStoreError } from '../store.ts'
import { renderMemoryItems } from './rank.ts'
import { MAX_MEMORY_INJECTION_LENGTH } from './schema.ts'
import type { MemoryActivity, MemoryMatchReason } from './activity.ts'

export interface MemoryDraft {
  id?: string
  scope: MemoryScope
  workspaceId?: string
  sessionId?: string
  content: string
  tags?: readonly string[]
  pinned?: boolean
  expiresAt?: number
  expectedUpdatedAt?: number
}

export interface MemoryRequestContext {
  scope: AccessScope
  workspaceId?: WorkspaceId
  sessionId?: SessionId
}

export type MemoryWarningCode =
  | 'scope-unavailable'
  | 'access-denied'
  | 'store-unavailable'
  | 'invalid-target'

export interface MemoryWarning {
  readonly code: MemoryWarningCode
}

export type MemoryReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; warning: MemoryWarning }

export class MemoryAccessError extends Error {
  constructor(readonly code: 'scope-unavailable' | 'access-denied' | 'invalid-target' = 'access-denied') {
    super('memory access is unavailable')
    this.name = 'MemoryAccessError'
  }
}

export class MemoryNotFoundError extends Error {
  constructor() {
    super('memory item is unavailable')
    this.name = 'MemoryNotFoundError'
  }
}

interface SessionOwnershipLike {
  sessionId: string
  workspaceId?: string
  createdByPrincipalId: string
}

interface MemoryUserScopeLike {
  availabilityState(): string
  localPrincipal(): { id: PrincipalId }
  currentScope(): AccessScope | undefined
  snapshot(): { sessions: readonly SessionOwnershipLike[] }
  canAccess(scope: AccessScope, resource: AccessResource): { allowed: boolean }
}

export interface MemoryServiceOptions {
  userScope: Pick<UserScopeService, 'availabilityState' | 'localPrincipal' | 'currentScope' | 'snapshot' | 'canAccess'> | MemoryUserScopeLike
  store?: MemoryStore
  now?: () => number
  resolveWorkspaceForSession?: (sessionId: string) => string | undefined
  warningSink?: (warning: MemoryWarning) => void
  search?: () => MemorySearchBridge | undefined
}

interface MemorySearchDocument {
  id: string
  scope: MemoryScope
  workspaceId?: string
  sessionId?: string
  title: string
  text: string
  tags: readonly string[]
  updatedAt: number
  expiresAt?: number
  pinned: boolean
}

interface SearchGeneration { revision: string; docs: MemorySearchDocument[] }
interface SearchMatch { id: string; updatedAt: number; reasons: readonly MemoryMatchReason[]; score: number }
export interface MemorySearchBridge {
  registerMemorySource(source: (scope: AccessScope) => Promise<SearchGeneration>): () => void
  syncMemory(scope: AccessScope, revision: string, docs: MemorySearchDocument[]): Promise<void>
  warmMemoryQuery(scope: AccessScope, query: string): Promise<void>
  searchMemory(scope: AccessScope, revision: string, query: string, filter: {
    workspaceId?: string; sessionId?: string; now: number; limit: number; exclude?: ReadonlySet<string>
  }): SearchMatch[] | undefined
}

type ActivityMatch = Pick<MemoryActivity['items'][number], 'reason' | 'truncated' | 'score' | 'reasons'>
  & { id: string; updatedAt: number }

export interface PendingMemorySuggestion {
  readonly id: string
  readonly item: MemoryPublicItem
  readonly createdAt: number
}

function safeId(value: string | undefined): string | undefined {
  return value !== undefined && isSafeMemoryId(value) ? value : undefined
}

function asPrincipal(value: string): PrincipalId | undefined {
  return isSafeMemoryId(value) ? value as PrincipalId : undefined
}

function asWorkspace(value: string | undefined): WorkspaceId | undefined {
  return safeId(value) as WorkspaceId | undefined
}

function asSession(value: string | undefined): SessionId | undefined {
  return safeId(value) as SessionId | undefined
}

function cloneContext(context: MemoryRequestContext): MemoryRequestContext {
  return { ...context }
}

function isExpired(item: MemoryItem, now: number): boolean {
  return item.expiresAt !== undefined && item.expiresAt <= now
}

function draftInput(
  principalId: PrincipalId,
  draft: MemoryDraft,
  source: MemorySource,
  now: number,
): MemoryItemInput {
  return {
    ...(draft.id === undefined ? {} : { id: draft.id }),
    principalId,
    scope: draft.scope,
    ...(draft.scope === 'workspace' ? { workspaceId: asWorkspace(draft.workspaceId) } : {}),
    ...(draft.scope === 'session' ? { sessionId: asSession(draft.sessionId) } : {}),
    content: draft.content,
    tags: draft.tags,
    pinned: draft.pinned,
    source,
    createdAt: now,
    updatedAt: now,
    ...(draft.expiresAt === undefined ? {} : { expiresAt: draft.expiresAt }),
  }
}

/**
 * Host-side memory service. It deliberately keeps a synchronous cache for
 * prompt assembly and a separate async path for settings/tools. A failed load
 * never replaces a principal's cache with another principal's data.
 */
export class MemoryService {
  readonly store: MemoryStore
  private readonly now: () => number
  private readonly userScope: MemoryUserScopeLike
  private readonly resolveWorkspaceForSession?: (sessionId: string) => string | undefined
  private readonly warningSink?: (warning: MemoryWarning) => void
  private readonly searchBridge?: () => MemorySearchBridge | undefined
  private readonly indexGenerations = new WeakMap<MemorySnapshot, SearchGeneration>()
  private readonly cache = new Map<PrincipalId, MemorySnapshot>()
  private readonly loading = new Map<PrincipalId, Promise<MemorySnapshot | undefined>>()
  private readonly loadedAt = new Map<PrincipalId, number>()
  private readonly generations = new Map<PrincipalId, number>()
  private readonly pending = new Map<PrincipalId, Map<string, MemoryItem>>()
  // Process-local UI state contains identifiers/reasons, never query or prompt text.
  private readonly activity = new Map<string, { context: MemoryRequestContext; status: MemoryActivity['status']; preparedAt: number; matches: ActivityMatch[] }>()
  private readonly ignored = new Map<string, Set<string>>()

  constructor(options: MemoryServiceOptions) {
    this.store = options.store ?? new MemoryStore()
    this.now = options.now ?? (() => Date.now())
    this.userScope = options.userScope
    this.resolveWorkspaceForSession = options.resolveWorkspaceForSession
    this.warningSink = options.warningSink
    this.searchBridge = options.search
  }

  private indexGeneration(snapshot: MemorySnapshot): SearchGeneration {
    const cached = this.indexGenerations.get(snapshot)
    if (cached) return cached
    const docs = snapshot.items.map(({ id, scope, workspaceId, sessionId, content, tags, updatedAt, expiresAt, pinned }) =>
      ({ id, scope, workspaceId, sessionId, title: '', text: content, tags, updatedAt, expiresAt, pinned }))
    const generation = { docs, revision: createHash('sha256').update(JSON.stringify(docs)).digest('hex') }
    this.indexGenerations.set(snapshot, generation)
    return generation
  }

  async memoryIndexSource(scope: AccessScope): Promise<SearchGeneration> {
    if (!this.authorizedContext({ scope })) throw new MemoryAccessError()
    const snapshot = await this.loadPrincipal(scope.principalId)
    if (!snapshot || !this.authorizedContext({ scope })) throw new MemoryAccessError()
    return this.indexGeneration(snapshot)
  }

  private primeIndex(context: MemoryRequestContext, snapshot: MemorySnapshot): void {
    try {
      const bridge = this.searchBridge?.()
      if (!bridge || !this.authorizedContext(context)) return
      const generation = this.indexGeneration(snapshot)
      void bridge.syncMemory(context.scope, generation.revision, generation.docs).catch(() => {})
    } catch {
      // The validated memory JSON remains available when the derived index fails.
    }
  }

  primeQuery(context: MemoryRequestContext, query: string): void {
    if (!query.trim() || !this.authorizedContext(context)) return
    try {
      void this.searchBridge?.()?.warmMemoryQuery(context.scope, query).catch(() => {})
    } catch {
      // Optional vectors never delay or prevent prompt construction.
    }
  }

  private rankSnapshot(snapshot: MemorySnapshot, context: MemoryRequestContext, query: string): RankedMemory[] {
    const ignored = this.ignored.get(this.activityKey(context))
    const request = this.queryFor(context, query)
    try {
      const bridge = this.searchBridge?.()
      const hits = bridge?.searchMemory(context.scope, this.indexGeneration(snapshot).revision, query, {
        ...request, limit: MAX_MEMORY_INJECTION_ITEMS, exclude: ignored,
      })
      if (hits !== undefined) {
        return hits.flatMap(hit => {
          const item = snapshot.items.find(row => row.id === hit.id && row.updatedAt === hit.updatedAt)
          if (!item || ignored?.has(item.id) || !memoryScopeMatches(item, request) || isExpired(item, request.now)
            || !this.targetContext(context, item)) return []
          const tag = hit.reasons.includes('tags')
          return [{
            item: { ...item, tags: [...item.tags] },
            scopeRank: (item.scope === 'session' ? 3 : item.scope === 'workspace' ? 2 : 1) as 1 | 2 | 3,
            overlap: 0,
            reason: tag && hit.reasons.includes('keyword') ? 'content-and-tag' as const : tag ? 'tag' as const : 'content' as const,
            score: hit.score,
            reasons: hit.reasons,
          }]
        })
      }
    } catch {
      // Independent owner checks on the authoritative-memory fallback still apply.
    }
    return rankMemories(snapshot.items.filter(item => !ignored?.has(item.id)), request)
  }

  desktopScope(): AccessScope | undefined {
    try {
      if (this.userScope.availabilityState() !== 'ready') return undefined
      const principalId = asPrincipal(this.userScope.localPrincipal().id)
      return principalId === undefined ? undefined : { principalId, source: 'desktop' }
    } catch {
      return undefined
    }
  }

  currentScope(): AccessScope | undefined {
    try {
      if (this.userScope.availabilityState() !== 'ready') return undefined
      const scope = this.userScope.currentScope() ?? this.desktopScope()
      if (scope === undefined || asPrincipal(scope.principalId) === undefined) return undefined
      return { ...scope, principalId: asPrincipal(scope.principalId)! }
    } catch {
      return undefined
    }
  }

  localContext(): MemoryRequestContext | undefined {
    const scope = this.desktopScope()
    return scope === undefined ? undefined : this.contextFor(scope)
  }

  contextForCurrentSession(sessionId: string): MemoryRequestContext | undefined {
    const scope = this.currentScope()
    return scope === undefined ? undefined : this.contextFor(scope, { sessionId })
  }

  contextFor(scope: AccessScope, target: { workspaceId?: string; sessionId?: string } = {}): MemoryRequestContext | undefined {
    try {
      if (this.userScope.availabilityState() !== 'ready') return undefined
      const principalId = asPrincipal(scope.principalId)
      if (principalId === undefined) return undefined
      const normalizedScope: AccessScope = { ...scope, principalId }
      if (!this.allowed(normalizedScope, { kind: 'principal', principalId })) return undefined
      const sessionId = asSession(target.sessionId)
      let workspaceId = asWorkspace(target.workspaceId)
      if (target.sessionId !== undefined && sessionId === undefined) return undefined
      if (target.workspaceId !== undefined && workspaceId === undefined) return undefined
      if (sessionId !== undefined) {
        const ownership = this.sessionOwnership(sessionId)
        if (ownership === undefined) return undefined
        if (normalizedScope.source === 'desktop' && ownership.createdByPrincipalId !== principalId) return undefined
        if (!this.allowed(normalizedScope, { kind: 'session', sessionId })) return undefined
        let ownedWorkspace = asWorkspace(ownership.workspaceId)
        if (ownedWorkspace === undefined && this.resolveWorkspaceForSession !== undefined) {
          try { ownedWorkspace = asWorkspace(this.resolveWorkspaceForSession(sessionId)) } catch { /* use global/session memory only */ }
        }
        // An explicitly requested workspace must be proven to belong to the
        // session. Otherwise an unresolved registry must not become a way to
        // attach memory to an arbitrary workspace.
        if (workspaceId !== undefined && ownedWorkspace === undefined) return undefined
        if (workspaceId !== undefined && workspaceId !== ownedWorkspace) return undefined
        workspaceId ??= ownedWorkspace
        if (workspaceId !== undefined && !this.allowed(normalizedScope, { kind: 'workspace', workspaceId })) return undefined
      } else if (workspaceId !== undefined && !this.allowed(normalizedScope, { kind: 'workspace', workspaceId })) {
        return undefined
      }
      return {
        scope: normalizedScope,
        ...(workspaceId === undefined ? {} : { workspaceId }),
        ...(sessionId === undefined ? {} : { sessionId }),
      }
    } catch {
      return undefined
    }
  }

  async preload(context: MemoryRequestContext): Promise<MemoryReadResult<MemorySnapshot>> {
    if (!this.authorizedContext(context)) return this.denied('access-denied')
    const snapshot = await this.loadPrincipal(context.scope.principalId)
    if (snapshot) this.primeIndex(context, snapshot)
    return snapshot === undefined
      ? this.denied('store-unavailable')
      : { ok: true, value: snapshot }
  }

  /** Read from the already-loaded owner cache; prompt providers never await I/O. */
  prepare(context: MemoryRequestContext, query: string, enabled: boolean): string {
    if (!this.authorizedContext(context) || !context.sessionId) return ''
    const key = this.activityKey(context)
    const all = enabled ? this.searchCached(context, query) : []
    const ranked = all?.filter(match => !this.ignored.get(key)?.has(match.item.id))
    const status: MemoryActivity['status'] = !enabled ? 'disabled' : !query.trim() ? 'empty-query' : ranked === undefined ? 'loading' : ranked.length ? 'ready' : 'no-match'
    let remaining = MAX_MEMORY_INJECTION_LENGTH
    const matches: ActivityMatch[] = []
    for (const match of ranked ?? []) {
      const length = renderMemoryItems([match]).length
      const separator = matches.length ? 1 : 0
      if (remaining - separator <= 4) break
      matches.push({ id: match.item.id, updatedAt: match.item.updatedAt, reason: match.reason ?? 'content',
        score: match.score, reasons: match.reasons,
        truncated: length + separator > remaining || match.item.content.length + 2 > MAX_MEMORY_INJECTION_LENGTH })
      remaining -= length + separator
      if (remaining <= 0) break
    }
    this.activity.delete(key)
    this.activity.set(key, { context: cloneContext(context), status, preparedAt: this.now(), matches })
    while (this.activity.size > 64) this.activity.delete(this.activity.keys().next().value!)
    return renderMemoryItems(ranked ?? [])
  }

  recentActivity(context: MemoryRequestContext, enabled: boolean): MemoryActivity {
    if (!this.authorizedContext(context)) throw new MemoryAccessError()
    const entry = context.sessionId ? this.activity.get(this.activityKey(context)) : [...this.activity.values()].reverse().find(value => value.context.scope.principalId === context.scope.principalId && this.authorizedContext(value.context))
    const key = entry ? this.activityKey(entry.context) : this.activityKey(context)
    const base: MemoryActivity = { status: enabled ? entry?.status ?? 'none' : 'disabled', ignoredCount: this.ignored.get(key)?.size ?? 0, items: [], ...(entry ? { sessionId: entry.context.sessionId, preparedAt: entry.preparedAt } : {}) }
    if (!entry || !enabled || !this.authorizedContext(entry.context)) return base
    const snapshot = this.cache.get(context.scope.principalId)
    if (!snapshot || this.now() - (this.loadedAt.get(context.scope.principalId) ?? 0) > 10_000) {
      void this.preload(entry.context)
      return { ...base, status: 'loading' }
    }
    for (const match of entry.matches) {
      const item = snapshot.items.find(item => item.id === match.id && item.updatedAt === match.updatedAt)
      if (item && !isExpired(item, this.now()) && this.targetContext(context, item) && !this.ignored.get(key)?.has(item.id)) {
        base.items.push({ item: toPublicMemoryItem(item), reason: match.reason, truncated: match.truncated, score: match.score, reasons: match.reasons })
      }
    }
    return base
  }

  ignoreForSession(context: MemoryRequestContext, id: string | null): void {
    if (!this.isLocalManager(context) || !context.sessionId) throw new MemoryAccessError()
    const key = this.activityKey(context)
    if (id === null) this.ignored.delete(key)
    else {
      if (!isSafeMemoryId(id) || !this.activity.get(key)?.matches.some(item => item.id === id)) throw new MemoryNotFoundError()
      const ids = this.ignored.get(key) ?? new Set<string>()
      if (ids.size >= MAX_MEMORY_ITEMS) throw new MemoryValidationError('too many ignored items', 'capacity')
      ids.add(id); this.ignored.set(key, ids)
      while (this.ignored.size > 64) this.ignored.delete(this.ignored.keys().next().value!)
    }
  }

  private activityKey(context: MemoryRequestContext): string { return JSON.stringify([context.scope.principalId, context.sessionId]) }

  searchCached(context: MemoryRequestContext, query = ''): RankedMemory[] | undefined {
    if (!this.authorizedContext(context)) return undefined
    if (query.trim() === '') return []
    const snapshot = this.cache.get(context.scope.principalId)
    if (snapshot === undefined || this.now() - (this.loadedAt.get(context.scope.principalId) ?? 0) > 10_000) {
      void this.preload(context)
      return undefined
    }
    return this.rankSnapshot(snapshot, context, query)
  }

  async list(context: MemoryRequestContext): Promise<MemoryReadResult<MemoryItem[]>> {
    if (!this.authorizedContext(context)) return this.denied('access-denied')
    const snapshot = await this.loadPrincipal(context.scope.principalId)
    if (snapshot === undefined) return this.denied('store-unavailable')
    const now = this.now()
    const query = this.queryFor(context, '')
    const value = snapshot.items
      .filter(item => memoryScopeMatches(item, query) && !isExpired(item, now))
      .map(item => ({ ...item, tags: [...item.tags] }))
      .sort((a, b) => {
        const rank = (item: MemoryItem): number => item.scope === 'session' ? 3 : item.scope === 'workspace' ? 2 : 1
        const rankDelta = rank(b) - rank(a)
        if (rankDelta !== 0) return rankDelta
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })
    return {
      ok: true,
      value,
    }
  }

  async search(context: MemoryRequestContext, query: string): Promise<MemoryReadResult<RankedMemory[]>> {
    if (!this.authorizedContext(context)) return this.denied('access-denied')
    if (query.trim() === '') return { ok: true, value: [] }
    const snapshot = await this.loadPrincipal(context.scope.principalId)
    if (snapshot === undefined) return this.denied('store-unavailable')
    if (!this.authorizedContext(context)) return this.denied('access-denied')
    this.primeIndex(context, snapshot)
    this.primeQuery(context, query)
    return { ok: true, value: this.rankSnapshot(snapshot, context, query) }
  }

  async save(context: MemoryRequestContext, draft: MemoryDraft, source: MemorySource = 'explicit'): Promise<MemoryItem> {
    const target = this.targetContext(context, draft)
    if (target === undefined) throw new MemoryAccessError('invalid-target')
    const now = this.now()
    const item = createMemoryItem(draftInput(target.scope.principalId, draft, source, now))
    this.invalidate(target.scope.principalId)
    const snapshot = await this.store.update(target.scope.principalId, current => {
      const index = current.items.findIndex(candidate => candidate.id === item.id)
      const existing = current.items[index]
      if (existing && this.targetContext(context, existing) === undefined) throw new MemoryAccessError()
      if (draft.expectedUpdatedAt !== undefined && existing?.updatedAt !== draft.expectedUpdatedAt) throw new MemoryValidationError('memory changed; reload before saving', 'conflict')
      const duplicate = current.items.find(candidate => candidate.id !== item.id && sameTarget(candidate, item) && normalizedContent(candidate.content) === normalizedContent(item.content))
      if (duplicate) throw new MemoryValidationError('memory already exists', 'duplicate')
      if (index < 0 && current.items.length >= MAX_MEMORY_ITEMS) throw new MemoryValidationError('memory capacity is full', 'capacity')
      const items = [...current.items]
      if (index < 0) items.push(item)
      else items[index] = { ...item, createdAt: items[index]!.createdAt, updatedAt: Math.max(now, items[index]!.updatedAt + 1) }
      return normalizeMemorySnapshot({ version: 1, items }, target.scope.principalId)
    })
    this.publish(target.scope.principalId, snapshot)
    return snapshot.items.find(candidate => candidate.id === item.id) ?? item
  }

  async remove(context: MemoryRequestContext, id: string, expectedUpdatedAt?: number): Promise<boolean> {
    if (!isSafeMemoryId(id)) throw new MemoryAccessError('invalid-target')
    const snapshot = await this.readForMutation(context)
    const item = snapshot.items.find(candidate => candidate.id === id)
    if (item === undefined) return false
    if (this.targetContext(context, item) === undefined) throw new MemoryAccessError('access-denied')
    this.invalidate(context.scope.principalId)
    const next = await this.store.update(context.scope.principalId, current => {
      const live = current.items.find(candidate => candidate.id === id)
      if (live && this.targetContext(context, live) === undefined) throw new MemoryAccessError()
      if (expectedUpdatedAt !== undefined && live?.updatedAt !== expectedUpdatedAt) throw new MemoryValidationError('memory changed', 'conflict')
      return { version: 1, items: current.items.filter(candidate => candidate.id !== id) }
    })
    this.publish(context.scope.principalId, next)
    return next.items.length !== snapshot.items.length
  }

  async clear(context: MemoryRequestContext): Promise<void> {
    if (!this.authorizedContext(context)) throw new MemoryAccessError()
    if (!this.isLocalManager(context)) throw new MemoryAccessError()
    this.invalidate(context.scope.principalId)
    const next = await this.store.update(context.scope.principalId, () => ({ version: 1, items: [] }))
    this.publish(context.scope.principalId, next)
  }

  /** Management can inspect all authorized scopes; model retrieval always stays scoped. */
  async listManaged(context: MemoryRequestContext, refresh = false): Promise<MemoryReadResult<MemoryItem[]>> {
    if (!this.isLocalManager(context)) return this.denied('access-denied')
    if (refresh) {
      await this.loading.get(context.scope.principalId)
      this.invalidate(context.scope.principalId)
    }
    const snapshot = await this.loadPrincipal(context.scope.principalId)
    if (!snapshot) return this.denied('store-unavailable')
    return { ok: true, value: snapshot.items.filter(item => this.targetContext(context, item) !== undefined).map(item => ({ ...item, tags: [...item.tags] })) }
  }

  async clearSelected(context: MemoryRequestContext, entries: { id: string; updatedAt: number }[]): Promise<void> {
    if (!this.isLocalManager(context) || entries.length > MAX_MEMORY_ITEMS) throw new MemoryAccessError()
    this.invalidate(context.scope.principalId)
    const next = await this.store.update(context.scope.principalId, current => {
      for (const entry of entries) {
        const item = current.items.find(candidate => candidate.id === entry.id)
        if (!item || item.updatedAt !== entry.updatedAt) throw new MemoryValidationError('memory changed', 'conflict')
        if (this.targetContext(context, item) === undefined) throw new MemoryAccessError()
      }
      const ids = new Set(entries.map(entry => entry.id))
      return { version: 1, items: current.items.filter(item => !ids.has(item.id)) }
    })
    this.publish(context.scope.principalId, next)
  }

  private isLocalManager(context: MemoryRequestContext): boolean {
    return this.authorizedContext(context) && context.scope.source === 'desktop' && context.scope.principalId === this.desktopScope()?.principalId
  }

  suggest(context: MemoryRequestContext, draft: MemoryDraft): PendingMemorySuggestion {
    const target = this.targetContext(context, draft)
    if (target === undefined) throw new MemoryAccessError('invalid-target')
    const current = this.pending.get(target.scope.principalId) ?? new Map<string, MemoryItem>()
    const repeated = [...current.values()].find(item => sameTarget(item, draft) && normalizedContent(item.content) === normalizedContent(draft.content))
    if (repeated) return { id: repeated.id, item: toPublicMemoryItem(repeated), createdAt: repeated.createdAt }
    if (current.size >= MAX_PENDING_MEMORY_SUGGESTIONS) throw new MemoryValidationError('too many pending suggestions', 'capacity')
    const item = createMemoryItem(draftInput(target.scope.principalId, { ...draft, id: undefined }, 'confirmed-suggestion', this.now()))
    current.set(item.id, item)
    this.pending.set(target.scope.principalId, current)
    return { id: item.id, item: toPublicMemoryItem(item), createdAt: item.createdAt }
  }

  listPending(context: MemoryRequestContext): PendingMemorySuggestion[] {
    if (!this.authorizedContext(context)) return []
    return [...(this.pending.get(context.scope.principalId)?.values() ?? [])]
      .filter(item => this.targetContext(context, item) !== undefined)
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
      .map(item => ({ id: item.id, item: toPublicMemoryItem(item), createdAt: item.createdAt }))
  }

  async confirm(context: MemoryRequestContext, id: string, replacement?: { id: string; updatedAt: number }): Promise<MemoryItem> {
    if (!isSafeMemoryId(id)) throw new MemoryNotFoundError()
    // Check the live owner/device/workspace scope before consulting the
    // process-local pending map. A suggestion id is not an authorization
    // token, and confirmation must not become an existence oracle after a
    // device revoke or scope transition.
    if (!this.authorizedContext(context)) throw new MemoryAccessError('access-denied')
    const pending = this.pending.get(context.scope.principalId)?.get(id)
    if (pending === undefined) throw new MemoryNotFoundError()
    if (replacement) {
      const snapshot = await this.readForMutation(context)
      const existing = snapshot.items.find(item => item.id === replacement.id)
      if (!existing || !sameTarget(existing, pending)) throw new MemoryAccessError('invalid-target')
    }
    const saved = await this.save(context, {
      id: replacement?.id ?? pending.id,
      ...(replacement ? { expectedUpdatedAt: replacement.updatedAt } : {}),
      scope: pending.scope,
      ...(pending.workspaceId === undefined ? {} : { workspaceId: pending.workspaceId }),
      ...(pending.sessionId === undefined ? {} : { sessionId: pending.sessionId }),
      content: pending.content,
      tags: pending.tags,
      pinned: pending.pinned,
      ...(pending.expiresAt === undefined ? {} : { expiresAt: pending.expiresAt }),
    }, 'confirmed-suggestion')
    this.pending.get(context.scope.principalId)?.delete(id)
    return saved
  }

  cancel(context: MemoryRequestContext, id: string): boolean {
    if (!isSafeMemoryId(id) || !this.authorizedContext(context)) return false
    return this.pending.get(context.scope.principalId)?.delete(id) ?? false
  }

  toPublic(items: readonly MemoryItem[]): MemoryPublicItem[] {
    return items.map(toPublicMemoryItem)
  }

  private queryFor(context: MemoryRequestContext, query: string): MemoryQuery {
    return {
      principalId: context.scope.principalId,
      ...(context.workspaceId === undefined ? {} : { workspaceId: context.workspaceId }),
      ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
      query,
      now: this.now(),
    }
  }

  private targetContext(context: MemoryRequestContext, draft: MemoryDraft | MemoryItem): MemoryRequestContext | undefined {
    if (!isMemoryScope(draft.scope)) return undefined
    if (draft.scope === 'global' && (draft.workspaceId !== undefined || draft.sessionId !== undefined)) return undefined
    if (draft.scope === 'workspace' && (safeId(draft.workspaceId) === undefined || draft.sessionId !== undefined)) return undefined
    if (draft.scope === 'session' && (safeId(draft.sessionId) === undefined || draft.workspaceId !== undefined)) return undefined
    return this.contextFor(context.scope, {
      ...(draft.scope === 'workspace' ? { workspaceId: draft.workspaceId } : {}),
      ...(draft.scope === 'session' ? { sessionId: draft.sessionId } : {}),
    })
  }

  private authorizedContext(context: MemoryRequestContext): boolean {
    try {
      if (this.userScope.availabilityState() !== 'ready') {
        this.report('scope-unavailable')
        return false
      }
      const resolved = this.contextFor(context.scope, {
        ...(context.workspaceId === undefined ? {} : { workspaceId: context.workspaceId }),
        ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
      })
      return resolved !== undefined
    } catch {
      this.report('scope-unavailable')
      return false
    }
  }

  private async readForMutation(context: MemoryRequestContext): Promise<MemorySnapshot> {
    if (!this.authorizedContext(context)) throw new MemoryAccessError()
    const snapshot = await this.loadPrincipal(context.scope.principalId)
    if (snapshot === undefined) throw new MemoryAccessError('scope-unavailable')
    return snapshot
  }

  private sessionOwnership(sessionId: SessionId): SessionOwnershipLike | undefined {
    return this.userScope.snapshot().sessions.find(item => item.sessionId === sessionId)
  }

  private allowed(scope: AccessScope, resource: AccessResource): boolean {
    try {
      return this.userScope.canAccess(scope, resource).allowed
    } catch {
      return false
    }
  }

  private async loadPrincipal(principalId: PrincipalId): Promise<MemorySnapshot | undefined> {
    const cached = this.cache.get(principalId)
    if (cached !== undefined && this.now() - (this.loadedAt.get(principalId) ?? 0) <= 10_000) return cached
    const active = this.loading.get(principalId)
    if (active !== undefined) return active
    const generation = this.generations.get(principalId) ?? 0
    const request = this.store.load(principalId).then(snapshot => {
      if ((this.generations.get(principalId) ?? 0) !== generation) return this.cache.get(principalId)
      this.cache.set(principalId, snapshot)
      this.loadedAt.set(principalId, this.now())
      return snapshot
    }).catch(error => {
      if ((this.generations.get(principalId) ?? 0) === generation) this.cache.delete(principalId)
      if (error instanceof MemoryStoreError) this.report('store-unavailable')
      else this.report('store-unavailable')
      return undefined
    }).finally(() => { this.loading.delete(principalId) })
    this.loading.set(principalId, request)
    return request
  }

  private invalidate(principalId: PrincipalId): void {
    this.generations.set(principalId, (this.generations.get(principalId) ?? 0) + 1)
    this.cache.delete(principalId)
  }

  private publish(principalId: PrincipalId, snapshot: MemorySnapshot): void {
    this.generations.set(principalId, (this.generations.get(principalId) ?? 0) + 1)
    this.cache.set(principalId, snapshot)
    this.loadedAt.set(principalId, this.now())
    const scope = this.currentScope()
    if (scope?.principalId === principalId) this.primeIndex({ scope }, snapshot)
  }

  private denied<T>(code: MemoryWarningCode): MemoryReadResult<T> {
    this.report(code)
    return { ok: false, warning: { code } }
  }

  private report(code: MemoryWarningCode): void {
    try { this.warningSink?.({ code }) } catch { /* diagnostics never affect the request */ }
  }
}

function normalizedContent(value: string): string { return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() }
function sameTarget(a: Pick<MemoryItem, 'scope' | 'workspaceId' | 'sessionId'>, b: MemoryDraft): boolean {
  return a.scope === b.scope && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId
}
