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

export interface MemoryDraft {
  id?: string
  scope: MemoryScope
  workspaceId?: string
  sessionId?: string
  content: string
  tags?: readonly string[]
  pinned?: boolean
  expiresAt?: number
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
}

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
  private readonly cache = new Map<PrincipalId, MemorySnapshot>()
  private readonly loading = new Map<PrincipalId, Promise<MemorySnapshot | undefined>>()
  private readonly pending = new Map<PrincipalId, Map<string, MemoryItem>>()

  constructor(options: MemoryServiceOptions) {
    this.store = options.store ?? new MemoryStore()
    this.now = options.now ?? (() => Date.now())
    this.userScope = options.userScope
    this.resolveWorkspaceForSession = options.resolveWorkspaceForSession
    this.warningSink = options.warningSink
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
    return snapshot === undefined
      ? this.denied('store-unavailable')
      : { ok: true, value: snapshot }
  }

  /** Read from the already-loaded owner cache; prompt providers never await I/O. */
  searchCached(context: MemoryRequestContext, query = ''): RankedMemory[] | undefined {
    if (!this.authorizedContext(context)) return undefined
    const snapshot = this.cache.get(context.scope.principalId)
    if (snapshot === undefined) {
      void this.preload(context)
      return undefined
    }
    return rankMemories(snapshot.items, this.queryFor(context, query))
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
    const snapshot = await this.loadPrincipal(context.scope.principalId)
    if (snapshot === undefined) return this.denied('store-unavailable')
    return { ok: true, value: rankMemories(snapshot.items, this.queryFor(context, query)) }
  }

  async save(context: MemoryRequestContext, draft: MemoryDraft, source: MemorySource = 'explicit'): Promise<MemoryItem> {
    const target = this.targetContext(context, draft)
    if (target === undefined) throw new MemoryAccessError('invalid-target')
    const now = this.now()
    const item = createMemoryItem(draftInput(target.scope.principalId, draft, source, now))
    const snapshot = await this.store.update(target.scope.principalId, current => {
      const index = current.items.findIndex(candidate => candidate.id === item.id)
      if (index < 0 && current.items.length >= MAX_MEMORY_ITEMS) throw new MemoryValidationError('memory capacity is full', 'capacity')
      const items = [...current.items]
      if (index < 0) items.push(item)
      else items[index] = { ...item, createdAt: items[index]!.createdAt }
      return normalizeMemorySnapshot({ version: 1, items }, target.scope.principalId)
    })
    this.cache.set(target.scope.principalId, snapshot)
    return snapshot.items.find(candidate => candidate.id === item.id) ?? item
  }

  async remove(context: MemoryRequestContext, id: string): Promise<boolean> {
    if (!isSafeMemoryId(id)) throw new MemoryAccessError('invalid-target')
    const snapshot = await this.readForMutation(context)
    const item = snapshot.items.find(candidate => candidate.id === id)
    if (item === undefined) return false
    if (this.targetContext(context, item) === undefined) throw new MemoryAccessError('access-denied')
    const next = await this.store.update(context.scope.principalId, current => ({
      version: 1,
      items: current.items.filter(candidate => candidate.id !== id),
    }))
    this.cache.set(context.scope.principalId, next)
    return next.items.length !== snapshot.items.length
  }

  async clear(context: MemoryRequestContext): Promise<void> {
    if (!this.authorizedContext(context)) throw new MemoryAccessError()
    const next = await this.store.update(context.scope.principalId, () => ({ version: 1, items: [] }))
    this.cache.set(context.scope.principalId, next)
  }

  suggest(context: MemoryRequestContext, draft: MemoryDraft): PendingMemorySuggestion {
    const target = this.targetContext(context, draft)
    if (target === undefined) throw new MemoryAccessError('invalid-target')
    const current = this.pending.get(target.scope.principalId) ?? new Map<string, MemoryItem>()
    if (current.size >= MAX_PENDING_MEMORY_SUGGESTIONS) throw new MemoryValidationError('too many pending suggestions', 'capacity')
    const item = createMemoryItem(draftInput(target.scope.principalId, { ...draft, id: undefined }, 'confirmed-suggestion', this.now()))
    current.set(item.id, item)
    this.pending.set(target.scope.principalId, current)
    return { id: item.id, item: toPublicMemoryItem(item), createdAt: item.createdAt }
  }

  listPending(context: MemoryRequestContext): PendingMemorySuggestion[] {
    if (!this.authorizedContext(context)) return []
    return [...(this.pending.get(context.scope.principalId)?.values() ?? [])]
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
      .map(item => ({ id: item.id, item: toPublicMemoryItem(item), createdAt: item.createdAt }))
  }

  async confirm(context: MemoryRequestContext, id: string): Promise<MemoryItem> {
    if (!isSafeMemoryId(id)) throw new MemoryNotFoundError()
    // Check the live owner/device/workspace scope before consulting the
    // process-local pending map. A suggestion id is not an authorization
    // token, and confirmation must not become an existence oracle after a
    // device revoke or scope transition.
    if (!this.authorizedContext(context)) throw new MemoryAccessError('access-denied')
    const pending = this.pending.get(context.scope.principalId)?.get(id)
    if (pending === undefined) throw new MemoryNotFoundError()
    const saved = await this.save(context, {
      id: pending.id,
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
    if (cached !== undefined) return cached
    const active = this.loading.get(principalId)
    if (active !== undefined) return active
    const request = this.store.load(principalId).then(snapshot => {
      this.cache.set(principalId, snapshot)
      return snapshot
    }).catch(error => {
      if (error instanceof MemoryStoreError) this.report('store-unavailable')
      else this.report('store-unavailable')
      return undefined
    }).finally(() => { this.loading.delete(principalId) })
    this.loading.set(principalId, request)
    return request
  }

  private denied<T>(code: MemoryWarningCode): MemoryReadResult<T> {
    this.report(code)
    return { ok: false, warning: { code } }
  }

  private report(code: MemoryWarningCode): void {
    try { this.warningSink?.({ code }) } catch { /* diagnostics never affect the request */ }
  }
}
