import { randomUUID } from 'node:crypto'

const MAX_TOTAL_BYTES = 16 * 1024 * 1024

export interface StorageReference {
  readonly refId: string
  readonly createdAt: number
  readonly ttlMs: number
  readonly producerTool: string
  readonly totalItems: number
  readonly totalBytes: number
  readonly preview: string
}

interface CacheEntry {
  readonly ref: StorageReference
  readonly sessionId: string
  readonly items: readonly Record<string, unknown>[]
  lastAccessedAt: number
}

export interface PageResult {
  readonly ok: boolean
  readonly refId: string
  readonly items?: readonly Record<string, unknown>[]
  readonly totalFiltered?: number
  readonly offset?: number
  readonly nextOffset?: number | null
  readonly complete?: boolean
  readonly error?: string
}

export class ResultCache {
  private readonly entries = new Map<string, CacheEntry>()
  private totalBytes = 0
  private readonly getMaxRefs: () => number
  private readonly now: () => number

  constructor(options: { getMaxRefs?: () => number; now?: () => number } = {}) {
    this.getMaxRefs = options.getMaxRefs ?? (() => 128)
    this.now = options.now ?? (() => Date.now())
  }

  private isExpired(entry: CacheEntry, now: number): boolean {
    return entry.ref.ttlMs > 0 && now - entry.ref.createdAt > entry.ref.ttlMs
  }

  private deleteEntry(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    this.entries.delete(id)
    this.totalBytes = Math.max(0, this.totalBytes - entry.ref.totalBytes)
    return true
  }

  private prune(now: number): void {
    for (const [id, entry] of this.entries) {
      if (this.isExpired(entry, now)) this.deleteEntry(id)
    }
    const maxRefs = Math.max(1, this.getMaxRefs())
    if (this.entries.size <= maxRefs && this.totalBytes <= MAX_TOTAL_BYTES) return
    const byAccess = Array.from(this.entries.entries()).sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
    for (const [id] of byAccess) {
      if (this.entries.size <= maxRefs && this.totalBytes <= MAX_TOTAL_BYTES) break
      this.deleteEntry(id)
    }
  }

  put(params: {
    sessionId: string
    producerTool: string
    items: readonly Record<string, unknown>[]
    ttlMs: number
    preview?: string
  }): StorageReference {
    const now = this.now()
    const totalBytes = Buffer.byteLength(JSON.stringify(params.items), 'utf8')
    const id = randomUUID().slice(0, 12)
    const refId = `ref://${params.sessionId}/${params.producerTool}/${id}`
    const ref: StorageReference = {
      refId,
      createdAt: now,
      ttlMs: Math.max(0, params.ttlMs),
      producerTool: params.producerTool,
      totalItems: params.items.length,
      totalBytes,
      preview: params.preview ?? `${params.producerTool}: ${params.items.length} items (${totalBytes} bytes)`,
    }
    this.entries.set(refId, {
      ref,
      sessionId: params.sessionId,
      items: params.items,
      lastAccessedAt: now,
    })
    this.totalBytes += totalBytes
    this.prune(now)
    return ref
  }

  page(params: {
    sessionId: string
    refId: string
    offset?: number
    limit?: number
    maxBytes?: number
    fields?: readonly string[]
    equals?: Record<string, unknown>
  }): PageResult {
    const now = this.now()
    this.prune(now)
    const entry = this.entries.get(params.refId)
    if (!entry || entry.sessionId !== params.sessionId) {
      return { ok: false, refId: params.refId, error: 'reference-not-found' }
    }
    entry.lastAccessedAt = now

    let filtered = entry.items
    if (params.equals && typeof params.equals === 'object') {
      const filters = Object.entries(params.equals).slice(0, 16)
      if (filters.length > 0) {
        filtered = filtered.filter(row => filters.every(([k, v]) => row[k] === v))
      }
    }

    const offset = Math.max(0, Math.floor(params.offset ?? 0))
    const limit = Math.max(1, Math.min(512, Math.floor(params.limit ?? 64)))
    const maxBytes = Math.max(512, Math.min(65536, Math.floor(params.maxBytes ?? 16384)))
    const fields = Array.isArray(params.fields) && params.fields.length > 0
      ? params.fields.slice(0, 32).filter((f): f is string => typeof f === 'string' && f.length <= 128)
      : null

    const pageItems: Record<string, unknown>[] = []
    let bytesUsed = 2
    let index = offset

    while (index < filtered.length && pageItems.length < limit) {
      const sourceRow = filtered[index]
      const projected = fields
        ? Object.fromEntries(fields.filter(k => Object.hasOwn(sourceRow, k)).map(k => [k, sourceRow[k]]))
        : sourceRow
      const itemBytes = Buffer.byteLength(JSON.stringify(projected), 'utf8') + (pageItems.length > 0 ? 1 : 0)
      if (bytesUsed + itemBytes > maxBytes) {
        if (pageItems.length === 0) {
          return { ok: false, refId: params.refId, error: 'row-exceeds-max-bytes' }
        }
        break
      }
      pageItems.push(projected)
      bytesUsed += itemBytes
      index++
    }

    const complete = index >= filtered.length
    return {
      ok: true,
      refId: params.refId,
      items: pageItems,
      totalFiltered: filtered.length,
      offset,
      nextOffset: complete ? null : index,
      complete,
    }
  }

  release(sessionId: string, refId: string): boolean {
    const entry = this.entries.get(refId)
    if (!entry || entry.sessionId !== sessionId) return false
    return this.deleteEntry(refId)
  }

  clearSession(sessionId: string): number {
    let removed = 0
    for (const [id, entry] of this.entries) {
      if (entry.sessionId === sessionId && this.deleteEntry(id)) removed++
    }
    return removed
  }

  reclaimAll(): number {
    const count = this.entries.size
    this.entries.clear()
    this.totalBytes = 0
    return count
  }

  stats(): { totalRefs: number; totalBytes: number; totalItems: number } {
    this.prune(this.now())
    let totalItems = 0
    for (const entry of this.entries.values()) totalItems += entry.items.length
    return { totalRefs: this.entries.size, totalBytes: this.totalBytes, totalItems }
  }
}
