export type Namespace = 'memory' | 'sessions' | 'knowledge'
export type DocumentScope = 'global' | 'workspace' | 'session'
export type SearchReason = 'keyword' | 'vector' | 'tags' | 'pinned'

export interface SearchDocument {
  id: string
  scope: DocumentScope
  workspaceId?: string
  sessionId?: string
  seq?: number
  turn?: number
  path?: string
  title: string
  tags?: readonly string[]
  headings?: readonly string[]
  text: string
  updatedAt: number
  expiresAt?: number
  pinned?: boolean
  vector?: readonly number[]
}

export interface SearchFilter {
  namespace: Namespace
  workspaceId?: string
  sessionId?: string
  after?: number
  before?: number
  now?: number
  limit?: number
  vector?: readonly number[]
  exclude?: ReadonlySet<string>
}

export interface SearchHit extends Omit<SearchDocument, 'vector'> {
  score: number
  reasons: readonly SearchReason[]
}

const FUSION_K = 60
export const MAX_CHANNEL_RESULTS = 50
const SCOPE_MULTIPLIER = { global: 1, workspace: 1.1, session: 1.25 } as const
const WEIGHT = { keyword: 1, vector: 1.2, tags: 0.6 } as const

export function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

export function tokenize(value: string): string[] {
  const parts = value.normalize('NFKC').match(
    /\p{Script=Han}+|(?:(?!\p{Script=Han})[\p{L}\p{N}])+(?:[_-](?:(?!\p{Script=Han})[\p{L}\p{N}])+){0,24}/gu,
  ) ?? []
  const tokens: string[] = []
  for (const part of parts) {
    if (/^\p{Script=Han}/u.test(part)) {
      const characters = [...part]
      if (characters.length === 1) tokens.push(part)
      for (let index = 0; index + 1 < characters.length; index++) {
        tokens.push(characters.slice(index, index + 2).join(''))
        if (index + 2 < characters.length) tokens.push(characters.slice(index, index + 3).join(''))
      }
      continue
    }
    const full = part.replace(/[_-]/gu, '').toLowerCase().slice(0, 100)
    const words = part
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
      .toLowerCase().split(/[ _-]/u).filter(Boolean).map(word => word.slice(0, 100))
    tokens.push(...words)
    if (words.length > 1) tokens.push(full)
  }
  return tokens
}

export function matchExpression(value: string): string {
  return [...new Set(tokenize(value.slice(0, 1200)))].slice(0, 48)
    .map(term => '"' + term.replaceAll('"', '""') + '"').join(' OR ')
}

export function isExact(document: SearchDocument, key: string): boolean {
  return key.length > 0 && (normalized(document.title) === key || document.tags?.some(tag => normalized(tag) === key) === true)
}

export function withSearchFilter(document: SearchDocument, filter: SearchFilter): boolean {
  if (document.expiresAt !== undefined && document.expiresAt <= (filter.now ?? Date.now())) return false
  if (filter.exclude?.has(document.id)) return false
  if (filter.after !== undefined && document.updatedAt < filter.after) return false
  if (filter.before !== undefined && document.updatedAt > filter.before) return false
  if (filter.namespace === 'memory') {
    if (document.scope === 'session') return document.sessionId !== undefined && document.sessionId === filter.sessionId
    if (document.scope === 'workspace') return document.workspaceId !== undefined && document.workspaceId === filter.workspaceId
    return true
  }
  return (filter.workspaceId === undefined || document.workspaceId === filter.workspaceId)
    && (filter.sessionId === undefined || document.sessionId === filter.sessionId)
}

type Channel = keyof typeof WEIGHT
export type Channels = Partial<Record<Channel, readonly SearchDocument[]>>

export function fuse(lists: Channels, filter: SearchFilter): SearchHit[] {
  const ranked = new Map<string, { row: SearchDocument; score: number; reasons: SearchReason[] }>()
  const channels = Object.keys(lists) as Channel[]
  const totalWeight = channels.reduce((sum, channel) => sum + WEIGHT[channel], 0)
  for (const channel of channels) {
    lists[channel]?.slice(0, MAX_CHANNEL_RESULTS).forEach((row, index) => {
      const entry = ranked.get(row.id) ?? { row, score: 0, reasons: [] }
      entry.score += WEIGHT[channel] / totalWeight / (FUSION_K + index + 1)
      entry.reasons.push(channel)
      ranked.set(row.id, entry)
    })
  }
  const now = filter.now ?? Date.now()
  return [...ranked.values()].map(({ row, score, reasons }) => {
    const { vector: _vector, ...visible } = row
    const age = Math.max(0, now - row.updatedAt)
    const recency = 1 + 0.15 * Math.exp(-age / (30 * 86400000)) + (row.pinned ? 0.25 : 0)
    if (row.pinned) reasons.push('pinned')
    return { ...visible, score: score * recency * SCOPE_MULTIPLIER[row.scope], reasons }
  }).sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    .slice(0, Math.min(MAX_CHANNEL_RESULTS, Math.max(1, filter.limit ?? 20)))
}

export function lexicalFallback(query: string, documents: readonly SearchDocument[]): SearchDocument[] {
  const terms = new Set(tokenize(query.slice(0, 1200)))
  if (!terms.size) return []
  const counts = new Map<string, number>()
  const rows = documents.map(row => {
    const tokens = tokenize(row.text)
    const frequency = new Map<string, number>()
    for (const [text, weight] of [[tokens, 1], [tokenize(row.title), 3], [tokenize(row.tags?.join(' ') ?? ''), 2]] as const) {
      for (const term of text) if (terms.has(term)) frequency.set(term, (frequency.get(term) ?? 0) + weight)
    }
    for (const term of frequency.keys()) counts.set(term, (counts.get(term) ?? 0) + 1)
    return { row, frequency, length: tokens.length }
  })
  const average = (rows.reduce((sum, row) => sum + row.length, 0) / rows.length) || 1
  return rows.map(({ row, frequency, length }) => {
    let score = 0
    const normalization = 1.2 * (0.25 + 0.75 * length / average)
    for (const [term, count] of frequency) {
      const documentsWithTerm = counts.get(term) ?? 0
      score += Math.log(1 + (rows.length - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5))
        * (count * 2.2) / (count + normalization)
    }
    return { row, score }
  }).filter(hit => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.row.updatedAt - a.row.updatedAt || a.row.id.localeCompare(b.row.id))
    .slice(0, MAX_CHANNEL_RESULTS).map(hit => hit.row)
}

export function quantize(values: readonly number[]): Int8Array<ArrayBuffer> | undefined {
  if (!values.length || values.length > 4096) return undefined
  let max = 0
  for (const value of values) {
    if (!Number.isFinite(value)) return undefined
    max = Math.max(max, Math.abs(value))
  }
  if (max === 0) return undefined
  return Int8Array.from(values, value => Math.round(127 * (value / max)))
}

export function vectorSimilarity(a: Int8Array, b: Int8Array): number {
  let dot = 0
  let left = 0
  let right = 0
  for (let index = 0; index < a.length; index++) {
    const x = a[index]!
    const y = b[index]!
    dot += x * y
    left += x * x
    right += y * y
  }
  return left && right ? dot / Math.sqrt(left * right) : 0
}
