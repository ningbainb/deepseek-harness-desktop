import { constants, openAsBlob } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { chunkMarkdown } from '../core/chunks.ts'
import type { SearchDocument } from '../core/search.ts'
import type { Embeddings } from './embeddings.ts'
import { databasePath, digest, type PrincipalIndex } from './index-store.ts'
import { withFileLock, writeFileAtomic } from './sdk-adapter.ts'

const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const MAX_STORE_BYTES = 32 * 1024 * 1024
const MAX_FILES = 256
const MAX_SOURCES = 128
const EXCLUDED = new Set(['node_modules', 'dist', 'target', 'vendor'])
const SOURCE_FORMATS = new Set(['.md', '.mdx', '.markdown', '.txt'])

export type KnowledgeSource =
  | { workspaceId: string; path: string; kind: 'path' }
  | { workspaceId: string; path: string; kind: 'document'; markdown: string; updatedAt: number }

function contained(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep)
}

function blocked(name: string): boolean {
  return name.startsWith('.') || EXCLUDED.has(name.toLowerCase())
    || /\.(?:key|pem|pfx|p12|kdbx|sqlite|db)$/iu.test(name)
    || /^(?:id_rsa|id_ed25519|credentials|secrets)(?:\.|$)/iu.test(name)
}

export async function resolveSource(root: string, path: string, imported = false): Promise<{ file: string; relativePath: string }> {
  if (!path || path.length > 4096 || /[\x00-\x1f]/u.test(path)) throw new Error('Invalid knowledge path')
  if (/^(?:\\{2}[?.]\\|\/\/[^/])/u.test(path)) throw new Error('Invalid knowledge path')
  const canonical = await realpath(root)
  const lexical = resolve(canonical, path)
  if (!contained(canonical, lexical)) throw new Error('Invalid knowledge path')
  const file = await realpath(lexical)
  if (!contained(canonical, file) || relative(lexical, file) !== '') throw new Error('Invalid knowledge path')
  const relativePath = relative(canonical, file).split(sep).join('/') || '.'
  if (relativePath !== '.' && relativePath.split('/').some((part, index) =>
    blocked(part) && !(imported && index === 0 && part === '.dsh-attachments'))) throw new Error('Invalid knowledge path')
  return { file, relativePath }
}

async function safeMarkdown(path: string): Promise<string | undefined> {
  const info = await lstat(path)
  if (!info.isFile() || info.size > MAX_SOURCE_BYTES || relative(path, await realpath(path)) !== '') return undefined
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.size > MAX_SOURCE_BYTES || opened.ino !== info.ino || opened.dev !== info.dev
      || relative(path, await realpath(path)) !== '') return undefined
    const data = Buffer.alloc(opened.size)
    const result = await handle.read(data, 0, opened.size, 0)
    if (result.bytesRead !== opened.size || data.includes(0) || (await handle.stat()).mtimeMs !== opened.mtimeMs) return undefined
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } finally {
    await handle.close()
  }
}

export function sourceKey(source: Pick<KnowledgeSource, 'workspaceId' | 'path'>): string {
  return digest(source.workspaceId + '\0' + (process.platform === 'win32' ? source.path.toLowerCase() : source.path))
}

function revisionPrefix(source: KnowledgeSource, root: string, embeddingRevision: string): string {
  return 'knowledge-v2:' + digest(JSON.stringify([source.kind, root, embeddingRevision])) + ':'
}

export function currentKnowledgeRevision(source: KnowledgeSource, root: string, embeddingRevision: string, revision?: string): boolean {
  const prefix = revisionPrefix(source, root, embeddingRevision)
  return source.kind === 'document' ? revision === prefix + digest(source.markdown + '\0' + source.updatedAt)
    : revision?.startsWith(prefix) === true
}

function makeChunks(source: KnowledgeSource, file: string, markdown: string, updatedAt: number): SearchDocument[] {
  return chunkMarkdown(markdown).map((chunk, index) => ({
    id: digest(sourceKey(source) + '\0' + file + '\0' + index),
    scope: 'workspace',
    workspaceId: source.workspaceId,
    path: file,
    title: chunk.headings.at(-1) ?? basename(file),
    headings: chunk.headings,
    text: chunk.text,
    updatedAt: Math.floor(updatedAt),
  }))
}

async function collectFiles(directory: string, files: string[], budget: { visiting: number }): Promise<void> {
  if (budget.visiting-- <= 0 || files.length >= MAX_FILES) return
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (files.length >= MAX_FILES || budget.visiting <= 0) break
    if (blocked(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory() && relative(path, await realpath(path)) === '') await collectFiles(path, files, budget)
    else if (entry.isFile() && SOURCE_FORMATS.has(extname(entry.name).toLowerCase())) files.push(path)
  }
}

export async function buildKnowledgeSource(
  index: PrincipalIndex, source: KnowledgeSource, root: string,
  embeddings: Pick<Embeddings, 'documents' | 'revision'>, stillAllowed: () => boolean,
  commitSource?: () => Promise<void>,
): Promise<number> {
  const key = sourceKey(source)
  const prefix = revisionPrefix(source, root, embeddings.revision)
  if (source.kind === 'document') {
    const revision = prefix + digest(source.markdown + '\0' + source.updatedAt)
    if (index.revision('knowledge', key) === revision) return chunkMarkdown(source.markdown).length
    const docs = await embeddings.documents(makeChunks(source, source.path, source.markdown, source.updatedAt), stillAllowed)
    if (!stillAllowed()) throw new Error('Knowledge workspace scope changed')
    index.replace('knowledge', key, revision, docs)
    return docs.length
  }
  const { file } = await resolveSource(root, source.path)
  const files: string[] = []
  const info = await stat(file)
  if (info.isDirectory()) await collectFiles(file, files, { visiting: 256 })
  else if (info.isFile() && SOURCE_FORMATS.has(extname(file).toLowerCase())) files.push(file)
  else throw new Error('Select a Markdown or text source')
  const docs: SearchDocument[] = []
  const revisions: string[] = []
  let totalBytes = 0
  for (const candidate of files) {
    const location = await resolveSource(root, candidate)
    const size = (await stat(location.file)).size
    if (size > MAX_SOURCE_BYTES || totalBytes + size > MAX_STORE_BYTES) continue
    const markdown = await safeMarkdown(location.file).catch(() => undefined)
    if (markdown === undefined) continue
    totalBytes += size
    const updatedAt = (await stat(location.file)).mtimeMs
    revisions.push(location.relativePath + '\0' + digest(markdown) + '\0' + Math.floor(updatedAt))
    docs.push(...makeChunks(source, location.relativePath, markdown, updatedAt))
    if (docs.length > 10_000) throw new Error('Knowledge source exceeds the chunk limit')
  }
  const revision = prefix + digest(revisions.join('\n'))
  const embedded = index.revision('knowledge', key) === revision ? undefined : await embeddings.documents(docs, stillAllowed)
  if (!stillAllowed()) throw new Error('Knowledge workspace scope changed')
  await commitSource?.()
  if (!stillAllowed()) throw new Error('Knowledge workspace scope changed')
  if (embedded) index.replace('knowledge', key, revision, embedded)
  return docs.length
}

export class KnowledgeSources {
  constructor(private readonly home: string) {}

  private async path(principal: string): Promise<string> {
    await mkdir(this.home, { recursive: true, mode: 0o700 })
    const file = resolve(dirname(databasePath(await realpath(this.home), principal)), 'knowledge.v1.json')
    for (const directory of [dirname(dirname(file)), dirname(file)]) {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      if (relative(directory, await realpath(directory)) !== '') throw new Error('Invalid knowledge store')
    }
    return file
  }

  async read(principal: string): Promise<KnowledgeSource[]> {
    const filename = await this.path(principal)
    try {
      const info = await lstat(filename)
      if (!info.isFile() || info.nlink !== 1 || info.size > MAX_STORE_BYTES) throw new Error('Invalid knowledge store')
      const blob = await openAsBlob(filename)
      if (blob.size > MAX_STORE_BYTES) throw new Error('Invalid knowledge store')
      const snapshot = JSON.parse(await blob.text()) as unknown
      if (!Array.isArray(snapshot) || snapshot.length > MAX_SOURCES || snapshot.some(value =>
        !value || typeof value.workspaceId !== 'string' || typeof value.path !== 'string'
        || !['path', 'document'].includes(value.kind)
        || value.kind === 'document' && (typeof value.markdown !== 'string' || !Number.isSafeInteger(value.updatedAt)))) {
        throw new Error('Invalid knowledge store')
      }
      return snapshot
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async change(
    principal: string, action: 'save' | 'remove', source: KnowledgeSource,
    stillAllowed: () => boolean,
  ): Promise<void> {
    const filename = await this.path(principal)
    await withFileLock(filename, async () => {
      const items = await this.read(principal)
      const next = items.filter(item => sourceKey(item) !== sourceKey(source))
      if (action === 'save') next.push(source)
      const body = JSON.stringify(next)
      if (next.length > MAX_SOURCES || Buffer.byteLength(body) > MAX_STORE_BYTES) throw new Error('Knowledge source limit reached')
      if (!stillAllowed()) throw new Error('Knowledge workspace scope changed')
      await writeFileAtomic(filename, body, { mode: 0o600, dirMode: 0o700 })
    })
  }
}

export function deleteSource(index: PrincipalIndex, source: KnowledgeSource): void {
  index.remove('knowledge', sourceKey(source))
}
