import { constants } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { writeGitObject } from './git.ts'

const MAX_WORKSPACE_FILES = 50_000
const MAX_PATH_LENGTH = 4096
const FILE_WORKERS = 24
const MAX_IGNORE_BYTES = 128 * 1024
const PROTECTED_NAMES = new Set(['.git', '.git_disabled', 'node_modules', '.pnpm-store', '.venv', 'dist', 'target'])

export const PROTECTED_PATTERNS = [
  '.git', '**/.git', '.git_disabled', 'node_modules/', '.pnpm-store/', '.venv/', 'dist/', 'target/',
  '.env', '.env.*', '*.sqlite-wal', '*.sqlite-shm', '*.tmp',
]

export type FileMode = '100644' | '100755'

export interface GitEntry {
  id: string
  mode: FileMode
}

export interface WorkspaceEntry extends GitEntry {
  fingerprint: string
}

export interface WorkspaceScan {
  entries: Map<string, WorkspaceEntry>
  skippedLargeFiles: string[]
}

interface IgnoreLayer { prefix: string; rules: Ignore }

function ruleIgnores(path: string, layers: readonly IgnoreLayer[]): boolean {
  let ignored = false
  for (const { prefix, rules } of layers) {
    const result = rules.test(path.slice(prefix.length))
    if (result.ignored || result.unignored) ignored = result.ignored
  }
  return ignored
}

export function pathKey(path: string): string { return process.platform === 'win32' ? path.toLowerCase() : path }

function protectedName(part: string): boolean {
  const name = part.toLowerCase()
  return PROTECTED_NAMES.has(name)
    || /^\.env(?:\.|$)/u.test(name)
    || /(?:\.sqlite-(?:wal|shm)|\.tmp|\.pem|\.key|\.p12|\.pfx|\.kdbx)$/u.test(name)
    || /^(?:\.credentials|credentials|\.secrets|secrets|id_rsa|id_ed25519)(?:\.|$)/u.test(name)
    || /^\.?git[a-z0-9]{0,4}~[0-9]+$/u.test(name)
}

function validPart(part: string): boolean {
  if (!part || part === '.' || part === '..' || /[\\\u0000-\u001f\u007f]/u.test(part) || protectedName(part)) return false
  return process.platform !== 'win32' || !(/[<>:"|?*]|[. ]$/u.test(part)
    || /^(?:com[1-9¹²³]|lpt[1-9¹²³]|con|nul|prn|aux)(?:\.|$)/iu.test(part))
}

export function assertWorkspacePath(path: string): string[] {
  const parts = path.split('/')
  if (!path || path.length > MAX_PATH_LENGTH || !parts.every(validPart)) throw new Error('Invalid checkpoint path')
  return parts
}

export async function fileInfo(filename: string): Promise<BigIntStats | undefined> {
  return lstat(filename, { bigint: true }).catch(error => {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    return undefined
  })
}

export function fileFingerprint(info: BigIntStats): string {
  return `${info.dev}:${info.ino}:${info.size}:${info.mode}:${info.nlink}:${info.mtimeNs}:${info.ctimeNs}`
}

function isInside(parent: string, path: string): boolean {
  const rel = relative(parent, path)
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)
}

async function readWorkspaceFile(path: string, info: BigIntStats, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  if (relative(path, await realpath(path)) !== '') throw new Error('Workspace path changed while taking a checkpoint')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const fingerprint = fileFingerprint(info)
    const opened = await file.stat({ bigint: true })
    if (!opened.isFile() || opened.nlink !== 1n || fileFingerprint(opened) !== fingerprint
      || relative(path, await realpath(path)) !== '') throw new Error('Workspace file changed while taking a checkpoint')
    const bytes = Buffer.alloc(Number(opened.size))
    let offset = 0
    while (offset < bytes.length) {
      signal?.throwIfAborted()
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset !== bytes.length || fileFingerprint(await file.stat({ bigint: true })) !== fingerprint) {
      throw new Error('Workspace file changed while taking a checkpoint')
    }
    return bytes
  } finally { await file.close() }
}

export async function collectWorkspace(workspace: string, privateHome: string, signal?: AbortSignal): Promise<{
  candidates: string[]
  isIgnored(path: string): boolean
}> {
  const candidates: string[] = []
  const directories: Array<{ path: string; prefix: string; layers: IgnoreLayer[] }> = [{ path: workspace, prefix: '', layers: [] }]
  const rulesAt = new Map<string, IgnoreLayer[]>()
  let visited = 0
  while (directories.length) {
    signal?.throwIfAborted()
    const { path, prefix, layers } = directories.pop()!
    if (relative(path, await realpath(path)) !== '') continue
    const entries = await readdir(path, { withFileTypes: true })
    if (prefix && entries.some(entry => /^\.git(?:_disabled)?$/iu.test(entry.name))) continue
    let scoped = layers
    const ignoreFile = entries.find(entry => pathKey(entry.name) === '.gitignore' && entry.isFile())
    if (ignoreFile) {
      const filename = join(path, ignoreFile.name)
      const info = await fileInfo(filename)
      if (!info?.isFile() || info.size > BigInt(MAX_IGNORE_BYTES) || info.nlink !== 1n) throw new Error('Invalid workspace ignore file')
      const rules = ignore({ ignorecase: process.platform === 'win32' }).add((await readWorkspaceFile(filename, info, signal)).toString('utf8'))
      scoped = [...layers, { prefix, rules }]
    }
    rulesAt.set(prefix, scoped)
    for (const entry of entries) {
      if (!validPart(entry.name)) continue
      if (++visited > MAX_WORKSPACE_FILES) throw new Error('Workspace exceeds the checkpoint scan limit')
      const child = join(path, entry.name)
      if (isInside(privateHome, child)) continue
      const name = prefix + entry.name
      if (name.length > MAX_PATH_LENGTH) continue
      if (entry.isDirectory() && !ruleIgnores(name + '/', scoped)) directories.push({ path: child, prefix: name + '/', layers: scoped })
      else if (entry.isFile() && !ruleIgnores(name, scoped)) candidates.push(name)
    }
  }
  return {
    candidates: candidates.toSorted(),
    isIgnored(path) {
      const parts = path.split('/')
      let prefix = ''
      let scoped = rulesAt.get('') ?? []
      for (const [index, part] of parts.entries()) {
        const directory = index < parts.length - 1
        const name = prefix + part + (directory ? '/' : '')
        if (ruleIgnores(name, scoped)) return true
        prefix = name
        scoped = rulesAt.get(prefix) ?? scoped
      }
      return false
    },
  }
}

export async function snapshotFiles(workspace: string, repository: string, candidates: string[],
  cached: ReadonlyMap<string, WorkspaceEntry>, maxFileBytes: number, maxTotalBytes: number, signal?: AbortSignal,
): Promise<WorkspaceScan> {
  const entries = new Map<string, WorkspaceEntry>()
  const skippedLargeFiles: string[] = []
  let bytes = 0
  let next = 0
  let failure: unknown
  const worker = async () => {
    while (!failure && next < candidates.length) {
      try {
        signal?.throwIfAborted()
        const path = candidates[next++]!
        const filename = join(workspace, ...path.split('/'))
        const info = await fileInfo(filename)
        if (!info?.isFile() || info.nlink !== 1n) continue
        if (info.size > BigInt(maxFileBytes)) { skippedLargeFiles.push(path); continue }
        const size = Number(info.size)
        bytes += size
        if (bytes > maxTotalBytes) throw new Error('Workspace exceeds the checkpoint storage quota')
        const fingerprint = fileFingerprint(info)
        const prev = cached.get(path)
        if (prev?.fingerprint === fingerprint) { entries.set(path, prev); continue }
        const mode = process.platform !== 'win32' && (info.mode & 0o111n) !== 0n ? '100755' : '100644'
        const id = await writeGitObject(repository, 'blob', await readWorkspaceFile(filename, info, signal))
        entries.set(path, { id, mode, fingerprint })
      } catch (error) { failure = error }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FILE_WORKERS, candidates.length) }, worker))
  if (failure) throw failure
  return { entries, skippedLargeFiles: skippedLargeFiles.toSorted() }
}

export async function restoreTarget(workspace: string, path: string, createParents = false): Promise<string> {
  const parts = assertWorkspacePath(path)
  let directory = workspace
  for (const part of parts.slice(0, -1)) {
    directory = join(directory, part)
    let info = await fileInfo(directory)
    if (!info && createParents) {
      await mkdir(directory, { mode: 0o755 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      info = await fileInfo(directory)
    }
    if (info && (!info.isDirectory() || info.isSymbolicLink() || relative(directory, await realpath(directory)) !== ''
      || await fileInfo(join(directory, '.git')) || await fileInfo(join(directory, '.git_disabled')))) {
      throw new Error('A protected or incompatible directory blocks checkpoint restore')
    }
  }
  return join(directory, parts.at(-1)!)
}
