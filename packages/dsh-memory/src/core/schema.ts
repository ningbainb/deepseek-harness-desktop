import type { PrincipalId, SessionId, WorkspaceId } from '@ningbainb/dsh-user-scope'

export const MEMORY_SCHEMA_VERSION = 1 as const
export const MEMORY_SETTINGS_NAMESPACE = 'memory'

export const MAX_MEMORY_CONTENT_LENGTH = 2_000
export const MAX_MEMORY_TAGS = 10
export const MAX_MEMORY_TAG_LENGTH = 64
export const MAX_MEMORY_ITEMS = 2_000
export const MAX_MEMORY_INJECTION_ITEMS = 5
export const MAX_MEMORY_INJECTION_LENGTH = 2_000
export const MAX_MEMORY_QUERY_LENGTH = 4_000
export const MAX_PENDING_MEMORY_SUGGESTIONS = 32
export const MAX_MEMORY_ID_LENGTH = 128

export type MemoryScope = 'global' | 'workspace' | 'session'
export type MemorySource = 'explicit' | 'confirmed-suggestion'

export interface MemoryItem {
  id: string
  principalId: PrincipalId
  scope: MemoryScope
  workspaceId?: WorkspaceId
  sessionId?: SessionId
  content: string
  tags: string[]
  pinned: boolean
  source: MemorySource
  createdAt: number
  updatedAt: number
  expiresAt?: number
}

export interface MemorySnapshot {
  version: typeof MEMORY_SCHEMA_VERSION
  items: MemoryItem[]
}

export interface MemoryItemInput {
  id?: string
  principalId: PrincipalId
  scope: MemoryScope
  workspaceId?: WorkspaceId
  sessionId?: SessionId
  content: string
  tags?: readonly string[]
  pinned?: boolean
  source: MemorySource
  createdAt: number
  updatedAt: number
  expiresAt?: number
}

export interface MemoryPublicItem {
  id: string
  scope: MemoryScope
  workspaceId?: string
  sessionId?: string
  content: string
  tags: string[]
  pinned: boolean
  source: MemorySource
  createdAt: number
  updatedAt: number
  expiresAt?: number
}

export const MEMORY_SENSITIVE_MESSAGE = '此内容看起来包含凭据，不建议保存为长期记忆。'

export class MemoryValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'sensitive' | 'capacity' | 'conflict' | 'duplicate' = 'invalid',
  ) {
    super(message)
    this.name = 'MemoryValidationError'
  }
}

const SAFE_ID = /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

export function isSafeMemoryId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_MEMORY_ID_LENGTH && SAFE_ID.test(value)
}

export function isMemoryScope(value: unknown): value is MemoryScope {
  return value === 'global' || value === 'workspace' || value === 'session'
}

export function isMemorySource(value: unknown): value is MemorySource {
  return value === 'explicit' || value === 'confirmed-suggestion'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value)
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isContent(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_MEMORY_CONTENT_LENGTH
    && value.trim().length > 0
    && !/[\u0000]/u.test(value)
}

function isTag(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_MEMORY_TAG_LENGTH
    && value.trim().length > 0
    && !/[\u0000\s]/u.test(value)
}

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/iu,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|pwd|cookie|authorization)\b\s*[:=]\s*[^\s]{8,}/iu,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/iu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/u,
]

/** Detect obvious credentials without returning or logging the matched text. */
export function containsSensitiveMemoryContent(content: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(content))
}

function assertMemoryContent(content: unknown): asserts content is string {
  if (!isContent(content)) throw new MemoryValidationError('memory content is empty or too long')
  if (containsSensitiveMemoryContent(content)) throw new MemoryValidationError(MEMORY_SENSITIVE_MESSAGE, 'sensitive')
}

function parseItem(value: unknown, strict: boolean, expectedPrincipalId?: PrincipalId): MemoryItem | undefined {
  if (!isRecord(value)) {
    if (strict) throw new MemoryValidationError('memory item must be an object')
    return undefined
  }
  const id = value.id
  const principalId = value.principalId
  const scope = value.scope
  const workspaceId = value.workspaceId
  const sessionId = value.sessionId
  const content = value.content
  const tags = value.tags
  const pinned = value.pinned
  const source = value.source
  const createdAt = value.createdAt
  const updatedAt = value.updatedAt
  const expiresAt = value.expiresAt
  const invalid = (): undefined => {
    if (strict) throw new MemoryValidationError('memory item contains an invalid field')
    return undefined
  }
  if (!isSafeMemoryId(id) || !isOpaqueId(principalId) || !isMemoryScope(scope) || !isContent(content) || !Array.isArray(tags) || tags.length > MAX_MEMORY_TAGS || !tags.every(isTag) || new Set(tags).size !== tags.length || typeof pinned !== 'boolean' || !isMemorySource(source) || !isTime(createdAt) || !isTime(updatedAt) || (expiresAt !== undefined && !isTime(expiresAt))) return invalid()
  if (containsSensitiveMemoryContent(content)) {
    if (strict) throw new MemoryValidationError(MEMORY_SENSITIVE_MESSAGE, 'sensitive')
    return undefined
  }
  if (expectedPrincipalId !== undefined && principalId !== expectedPrincipalId) return invalid()
  if (scope === 'global' && (workspaceId !== undefined || sessionId !== undefined)) return invalid()
  if (scope === 'workspace' && (!isOpaqueId(workspaceId) || sessionId !== undefined)) return invalid()
  if (scope === 'session' && (!isOpaqueId(sessionId) || workspaceId !== undefined)) return invalid()
  return {
    id,
    principalId: principalId as PrincipalId,
    scope,
    ...(scope === 'workspace' ? { workspaceId: workspaceId as WorkspaceId } : {}),
    ...(scope === 'session' ? { sessionId: sessionId as SessionId } : {}),
    content,
    tags: [...tags],
    pinned,
    source,
    createdAt,
    updatedAt,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  }
}

export function emptyMemorySnapshot(): MemorySnapshot {
  return { version: MEMORY_SCHEMA_VERSION, items: [] }
}

/** Normalize a storage value by dropping malformed rows and bounding the list. */
export function normalizeMemorySnapshot(value: unknown, expectedPrincipalId?: PrincipalId): MemorySnapshot {
  if (value === undefined) return emptyMemorySnapshot()
  if (!isRecord(value) || value.version !== MEMORY_SCHEMA_VERSION || !Array.isArray(value.items)) {
    throw new MemoryValidationError('unsupported or invalid memory snapshot')
  }
  const items: MemoryItem[] = []
  for (const candidate of value.items) {
    const item = parseItem(candidate, false, expectedPrincipalId)
    if (item === undefined || items.some(existing => existing.id === item.id) || items.length >= MAX_MEMORY_ITEMS) continue
    items.push(item)
  }
  return { version: MEMORY_SCHEMA_VERSION, items }
}

export function assertMemoryItem(value: unknown, expectedPrincipalId?: PrincipalId): asserts value is MemoryItem {
  const item = parseItem(value, true, expectedPrincipalId)
  if (item === undefined) throw new MemoryValidationError('memory item is invalid')
}

export function assertMemorySnapshot(value: unknown, expectedPrincipalId?: PrincipalId): asserts value is MemorySnapshot {
  if (!isRecord(value) || value.version !== MEMORY_SCHEMA_VERSION || !Array.isArray(value.items) || value.items.length > MAX_MEMORY_ITEMS) {
    throw new MemoryValidationError('memory snapshot is invalid')
  }
  const ids = new Set<string>()
  for (const candidate of value.items) {
    assertMemoryItem(candidate, expectedPrincipalId)
    if (ids.has(candidate.id)) throw new MemoryValidationError('memory item IDs must be unique')
    ids.add(candidate.id)
  }
}

export function createMemoryItem(input: MemoryItemInput): MemoryItem {
  const id = input.id ?? `memory-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const tags = [...new Set((input.tags ?? []).map(tag => tag.trim()))]
  const item: MemoryItem = {
    id,
    principalId: input.principalId,
    scope: input.scope,
    ...(input.scope === 'workspace' ? { workspaceId: input.workspaceId! } : {}),
    ...(input.scope === 'session' ? { sessionId: input.sessionId! } : {}),
    content: input.content,
    tags,
    pinned: input.pinned === true,
    source: input.source,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
  }
  assertMemoryItem(item, input.principalId)
  return item
}

export function toPublicMemoryItem(item: MemoryItem): MemoryPublicItem {
  return {
    id: item.id,
    scope: item.scope,
    ...(item.workspaceId === undefined ? {} : { workspaceId: item.workspaceId }),
    ...(item.sessionId === undefined ? {} : { sessionId: item.sessionId }),
    content: item.content,
    tags: [...item.tags],
    pinned: item.pinned,
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
  }
}
