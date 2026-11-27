import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import {
  MAX_CHANNEL_RESULTS, fuse, isExact, lexicalFallback, matchExpression, normalized, quantize, tokenize,
  vectorSimilarity, withSearchFilter, type Channels, type Namespace, type SearchDocument, type SearchFilter, type SearchHit,
} from '../core/search.ts'

const require = createRequire(import.meta.url)
const NAMESPACES = ['memory', 'sessions', 'knowledge'] as const

export function digest(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function databasePath(home: string, principal: string): string {
  return join(home, 'search', digest(principal), 'index.v1.sqlite')
}

export interface SearchStatus {
  counts: Record<Namespace, number>
  engine: 'fts5' | 'typescript'
  vector: 'sqlite-vec' | 'int8'
  vectorCount: number
  recovered: boolean
}

interface DocumentRow {
  payload: string
  vector: Uint8Array | null
}

function readRow(row: DocumentRow): SearchDocument {
  return JSON.parse(row.payload) as SearchDocument
}

function verifyDirectory(path: string): void {
  if (relative(path, realpathSync(path)) !== '') throw new Error('Invalid local-search directory')
}

function privatePaths(home: string, principal: string): string {
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const canonicalHome = realpathSync(home)
  const file = databasePath(canonicalHome, principal)
  const root = dirname(dirname(file))
  const owner = dirname(file)
  for (const directory of [root, owner]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    verifyDirectory(directory)
  }
  return file
}

function verifyFiles(path: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const name = path + suffix
    try {
      const stat = lstatSync(name)
      if (!stat.isFile() || stat.nlink !== 1) throw new Error('Invalid local-search database file')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

function protectDatabase(path: string): void {
  if (!existsSync(path)) closeSync(openSync(path, 'wx', 0o600))
  else if (process.platform !== 'win32') chmodSync(path, 0o600)
}

function loadVector(db: DatabaseSync): boolean {
  try {
    const extension = require('sqlite-vec') as { getLoadablePath?: () => string; load(db: DatabaseSync): void }
    if (extension.getLoadablePath) {
      const path = extension.getLoadablePath()
      if (typeof path !== 'string') return false
      const unpacked = path.replace(/\.asar(?=[\\/])/u, '.asar.unpacked')
      db.loadExtension(unpacked !== path && existsSync(unpacked) ? unpacked : path)
    } else extension.load(db)
    return true
  } catch {
    return false
  } finally {
    db.enableLoadExtension(false)
  }
}

type IndexFilter = SearchFilter & { allowedSources?: ReadonlySet<string> }

function where(filter: IndexFilter): { clause: string; args: SQLInputValue[] } {
  const clauses = ['d.namespace = ?', '(d.expires_at IS NULL OR d.expires_at > ?)']
  const args: SQLInputValue[] = [filter.namespace, filter.now ?? Date.now()]
  if (filter.namespace === 'memory') {
    clauses.push("(d.scope = 'global' OR (d.scope = 'workspace' AND d.workspace_id = ?) OR (d.scope = 'session' AND d.session_id = ?))")
    args.push(filter.workspaceId ?? null, filter.sessionId ?? null)
  } else {
    if (filter.workspaceId !== undefined) {
      clauses.push('d.workspace_id = ?')
      args.push(filter.workspaceId)
    }
    if (filter.sessionId !== undefined) {
      clauses.push('d.session_id = ?')
      args.push(filter.sessionId)
    }
  }
  if (filter.after !== undefined) { clauses.push('d.updated_at >= ?'); args.push(filter.after) }
  if (filter.before !== undefined) { clauses.push('d.updated_at <= ?'); args.push(filter.before) }
  if (filter.allowedSources !== undefined) {
    const sources = [...filter.allowedSources]
    clauses.push('d.source IN (' + sources.map(() => '?').join(', ') + ')')
    args.push(...sources)
  }
  const excluded = [...(filter.exclude ?? [])].slice(0, 1000)
  if (excluded.length) {
    clauses.push('d.id NOT IN (' + excluded.map(() => '?').join(', ') + ')')
    args.push(...excluded)
  }
  return { clause: clauses.join(' AND '), args }
}

const SCHEMA = String.raw`
CREATE TABLE IF NOT EXISTS source_revisions (
  namespace TEXT NOT NULL, source TEXT NOT NULL, revision TEXT NOT NULL,
  PRIMARY KEY (namespace, source)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS documents (
  rowid INTEGER PRIMARY KEY, namespace TEXT NOT NULL, source TEXT NOT NULL, id TEXT NOT NULL,
  scope TEXT NOT NULL, workspace_id TEXT, session_id TEXT, updated_at INTEGER NOT NULL,
  expires_at INTEGER, title_key TEXT NOT NULL, tags_key TEXT NOT NULL, payload TEXT NOT NULL, vector BLOB,
  UNIQUE(namespace, id)
);
CREATE INDEX IF NOT EXISTS documents_source ON documents(namespace, source);
CREATE INDEX IF NOT EXISTS documents_title ON documents(namespace, title_key);
CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
  title, tags, body, tokenize = 'unicode61 remove_diacritics 2'
);
`

function openDatabase(file: string, Database: typeof DatabaseSync): DatabaseSync {
  protectDatabase(file)
  const db = new Database(file, { allowExtension: true })
  try {
    if (db.prepare('PRAGMA quick_check(1)').get()?.quick_check !== 'ok') throw new Error('Local-search database failed quick_check')
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -2048; PRAGMA temp_store = FILE; PRAGMA busy_timeout = 1000')
    db.exec(SCHEMA)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

function isCorrupt(error: unknown): boolean {
  return error instanceof Error && (
    [11, 26].includes((error as Error & { errcode?: number }).errcode ?? 0)
    || error.message === 'Local-search database failed quick_check'
  )
}

function quarantine(file: string): void {
  const backup = file + '.corrupt.' + Date.now() + '.' + randomUUID()
  for (const suffix of ['-wal', '-shm', '-journal', '']) {
    if (existsSync(file + suffix)) renameSync(file + suffix, backup + suffix)
  }
}

function byRecency(a: SearchDocument, b: SearchDocument): number {
  return Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)
}

function bestVectors(candidates: Iterable<{ document: SearchDocument; bytes: Int8Array }>, vector: Int8Array): SearchDocument[] {
  const best: { document: SearchDocument; score: number }[] = []
  for (const { document, bytes } of candidates) {
    if (bytes.length !== vector.length) continue
    const score = vectorSimilarity(bytes, vector)
    if (score <= 0 || (best.length === MAX_CHANNEL_RESULTS && score < best.at(-1)!.score)) continue
    best.push({ document, score })
    best.sort((a, b) => b.score - a.score || byRecency(a.document, b.document))
    if (best.length > MAX_CHANNEL_RESULTS) best.pop()
  }
  return best.map(row => row.document)
}

interface FallbackSource {
  revision: string
  documents: readonly SearchDocument[]
}

export class PrincipalIndex {
  private readonly store?: DatabaseSync
  private nativeVectors = false
  private readonly memory = new Map<Namespace, Map<string, FallbackSource>>()
  readonly recovered: boolean

  constructor(home: string, principal: string, options: { forceFallback?: boolean; nativeVector?: boolean } = {}) {
    this.recovered = false
    if (options.forceFallback) return
    const file = privatePaths(home, principal)
    verifyFiles(file)
    let Database: typeof DatabaseSync
    try {
      Database = (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync
    } catch {
      return
    }
    try {
      this.store = openDatabase(file, Database)
    } catch (error) {
      if (isCorrupt(error)) {
        quarantine(file)
        this.recovered = true
        this.store = openDatabase(file, Database)
      } else if (error instanceof Error && error.message.includes('no such module: fts5')) return
      else throw error
    }
    if (options.nativeVector !== false) this.nativeVectors = loadVector(this.store)
    else this.store.enableLoadExtension(false)
  }

  close(): void {
    this.store?.close()
    this.memory.clear()
  }

  revision(namespace: Namespace, source: string): string | undefined {
    return this.store
      ? this.store.prepare('SELECT revision FROM source_revisions WHERE namespace = ? AND source = ?').get(namespace, source)?.revision as string | undefined
      : this.memory.get(namespace)?.get(source)?.revision
  }

  sources(namespace: Namespace): string[] {
    return this.store
      ? this.store.prepare('SELECT source FROM source_revisions WHERE namespace = ?').all(namespace).map(row => String(row.source))
      : [...(this.memory.get(namespace)?.keys() ?? [])]
  }

  status(): SearchStatus {
    const counts: Record<Namespace, number> = { memory: 0, sessions: 0, knowledge: 0 }
    let vectorCount = 0
    if (this.store) {
      for (const row of this.store.prepare('SELECT namespace, count(*) AS total, count(vector) AS vectors FROM documents GROUP BY namespace').all()) {
        counts[row.namespace as Namespace] = Number(row.total)
        vectorCount += Number(row.vectors)
      }
    } else for (const space of NAMESPACES) {
      for (const { documents } of this.memory.get(space)?.values() ?? []) {
        counts[space] += documents.length
        vectorCount += documents.filter(row => row.vector !== undefined).length
      }
    }
    return { counts, engine: this.store ? 'fts5' : 'typescript', vector: this.nativeVectors ? 'sqlite-vec' : 'int8', vectorCount, recovered: this.recovered }
  }

  replace(namespace: Namespace, source: string, revision: string, docs: readonly SearchDocument[]): void {
    if (this.revision(namespace, source) === revision) return
    const db = this.store
    if (!db) {
      const sources = this.memory.get(namespace) ?? new Map<string, FallbackSource>()
      sources.set(source, { revision, documents: docs })
      this.memory.set(namespace, sources)
      return
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      this.deleteRows(db, namespace, source)
      const insert = db.prepare(String.raw`
        INSERT INTO documents(namespace, source, id, scope, workspace_id, session_id, updated_at, expires_at, title_key, tags_key, payload, vector)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      insert.setReadBigInts(true)
      const fts = db.prepare('INSERT INTO content_fts(rowid, title, tags, body) VALUES (?, ?, ?, ?)')
      for (const document of docs) {
        const { vector, ...doc } = document
        const quantized = vector === undefined ? undefined : quantize(vector)
        const tagged = (doc.tags ?? []).map(tag => normalized(tag).replaceAll('|', '')).join('|')
        const { lastInsertRowid } = insert.run(
          namespace, source, doc.id, doc.scope, doc.workspaceId ?? null, doc.sessionId ?? null,
          doc.updatedAt, doc.expiresAt ?? null, normalized(doc.title), '|' + tagged + '|', JSON.stringify(doc),
          quantized ? new Uint8Array(quantized.buffer) : null,
        )
        fts.run(lastInsertRowid, tokenize(doc.title).join(' '), tokenize(doc.tags?.join(' ') ?? '').join(' '), tokenize(doc.text).join(' '))
      }
      db.prepare('INSERT INTO source_revisions VALUES (?, ?, ?)').run(namespace, source, revision)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  remove(namespace: Namespace, source: string): void {
    const db = this.store
    if (!db) { this.memory.get(namespace)?.delete(source); return }
    db.exec('BEGIN IMMEDIATE')
    try {
      this.deleteRows(db, namespace, source)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  private deleteRows(db: DatabaseSync, namespace: Namespace, source: string): void {
    db.prepare('DELETE FROM content_fts WHERE rowid IN (SELECT rowid FROM documents WHERE namespace = ? AND source = ?)').run(namespace, source)
    db.prepare('DELETE FROM documents WHERE namespace = ? AND source = ?').run(namespace, source)
    db.prepare('DELETE FROM source_revisions WHERE namespace = ? AND source = ?').run(namespace, source)
  }

  get(namespace: Namespace, id: string, allowedSources?: ReadonlySet<string>): SearchDocument | undefined {
    if (allowedSources?.size === 0) return undefined
    if (!this.store) {
      for (const [source, record] of this.memory.get(namespace) ?? []) {
        if (allowedSources && !allowedSources.has(source)) continue
        const document = record.documents.find(row => row.id === id)
        if (document) return document
      }
      return undefined
    }
    const sources = allowedSources ? [...allowedSources] : []
    const sourceClause = sources.length ? ' AND source IN (' + sources.map(() => '?').join(', ') + ')' : ''
    const row = this.store.prepare('SELECT payload FROM documents WHERE namespace = ? AND id = ?' + sourceClause).get(namespace, id, ...sources)
    return row ? readRow(row as unknown as DocumentRow) : undefined
  }

  search(query: string, filter: IndexFilter): SearchHit[] {
    if (filter.allowedSources?.size === 0) return []
    const vector = filter.vector === undefined ? undefined : quantize(filter.vector)
    const lists: Channels = {}
    const key = normalized(query)
    const db = this.store
    if (!db) {
      const corpus = [...(this.memory.get(filter.namespace) ?? [])]
        .filter(([source]) => !filter.allowedSources || filter.allowedSources.has(source))
        .flatMap(([, record]) => record.documents)
        .filter(row => withSearchFilter(row, filter))
      lists.keyword = key ? lexicalFallback(query, corpus) : corpus.sort(byRecency).slice(0, MAX_CHANNEL_RESULTS)
      if (key) lists.tags = corpus.filter(row => isExact(row, key)).sort(byRecency).slice(0, MAX_CHANNEL_RESULTS)
      if (vector) lists.vector = bestVectors(corpus.flatMap(document => {
        const bytes = document.vector === undefined ? undefined : quantize(document.vector)
        return bytes ? [{ document, bytes }] : []
      }), vector)
      return fuse(lists, filter)
    }
    const { clause, args } = where(filter)
    const expression = matchExpression(query)
    if (expression) {
      const rows = db.prepare(`SELECT d.payload FROM content_fts JOIN documents d ON d.rowid = content_fts.rowid
        WHERE content_fts MATCH ? AND ${clause}
        ORDER BY bm25(content_fts, 3, 2, 1), d.updated_at DESC, d.id LIMIT 50`).all(expression, ...args)
      lists.keyword = rows.map(row => readRow(row as unknown as DocumentRow))
    } else if (!key) {
      const rows = db.prepare(`SELECT d.payload FROM documents d WHERE ${clause}
        ORDER BY json_extract(d.payload, '$.pinned') DESC, d.updated_at DESC, d.id LIMIT 50`).all(...args)
      lists.keyword = rows.map(row => readRow(row as unknown as DocumentRow))
    }
    if (key) {
      const rows = db.prepare(`SELECT d.payload FROM documents d WHERE ${clause}
        AND (d.title_key = ? OR instr(d.tags_key, ?) > 0)
        ORDER BY d.updated_at DESC, d.id LIMIT 50`).all(...args, key, '|' + key.replaceAll('|', '') + '|')
      lists.tags = rows.map(row => readRow(row as unknown as DocumentRow)).filter(row => isExact(row, key))
    }
    if (vector) lists.vector = this.queryVectors(db, clause, args, vector)
    return fuse(lists, filter)
  }

  private queryVectors(db: DatabaseSync, clause: string, args: readonly SQLInputValue[], vector: Int8Array<ArrayBuffer>): SearchDocument[] {
    if (this.nativeVectors) {
      try {
        const rows = db.prepare(`SELECT d.payload, vec_distance_cosine(vec_int8(d.vector), vec_int8(?)) AS distance
          FROM documents d WHERE ${clause} AND length(d.vector) = ?
          ORDER BY distance, d.updated_at DESC, d.id LIMIT 50`).all(new Uint8Array(vector.buffer), ...args, vector.length)
        return rows.filter(row => Number(row.distance) < 1).map(row => readRow(row as unknown as DocumentRow))
      } catch {
        this.nativeVectors = false
      }
    }
    const rows = db.prepare(`SELECT d.payload, d.vector FROM documents d WHERE ${clause} AND length(d.vector) = ?`)
      .iterate(...args, vector.length)
    function* candidates() {
      for (const raw of rows) {
        const row = raw as unknown as DocumentRow
        if (!row.vector) continue
        yield { document: readRow(row), bytes: new Int8Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength) }
      }
    }
    return bestVectors(candidates(), vector)
  }
}
