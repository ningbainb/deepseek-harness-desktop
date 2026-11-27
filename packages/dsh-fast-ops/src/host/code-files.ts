import { constants } from 'node:fs'
import { lstat, open, readdir } from 'node:fs/promises'
import { join, matchesGlob } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { isLikelyBinary, resolveSafeWorkspacePath, sha256Hex } from './workspace-path.ts'

const OMIT_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.pnpm-store', 'node_modules', '.venv', 'dist', 'lib', '.next', 'target', 'coverage',
])
const MAX_CODE_BYTES = 1024 * 1024
const MAX_SCAN_ENTRIES = 20_000
const MAX_SCAN_DEPTH = 32

export interface CodeSelection {
  path?: string
  include?: readonly string[]
}

export interface WorkspaceCodeFile {
  path: string
  absolutePath: string
  revision: string
  mode: number
  text: string
}

export function protectedPath(path: string): boolean {
  return path.split('/').some(segment => {
    const name = segment.toLowerCase()
    return OMIT_DIRECTORIES.has(name)
      || (process.platform === 'win32' && name.includes(':'))
      || /^(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|\.pypirc$|\.git-credentials$|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$))/u.test(name)
      || /\.(?:pem|key|pfx|p12|jks|kdbx)$/u.test(name)
      || /^(?:credentials|secrets|service[-_]account)(?:[._-]|$)/u.test(name)
  })
}

type IgnoreScope = { prefix: string; matcher: Ignore }

async function ignoreScope(root: string, path: string): Promise<IgnoreScope | undefined> {
  const name = path === '.' ? '.gitignore' : `${path}/.gitignore`
  const prefix = path === '.' ? '' : `${path}/`
  const matcher = ignore({ ignorecase: process.platform === 'win32' })
  try {
    const stat = await lstat(join(root, name))
    if (!stat.isFile()) return undefined
    const file = await readWorkspaceCodeFile(root, name, 65536)
    if (file) return { prefix, matcher: matcher.add(file.text) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
  }
  return { prefix, matcher: matcher.add('*') }
}

function isIgnored(path: string, scopes: readonly IgnoreScope[]): boolean {
  let ignored = false
  for (const { prefix, matcher } of scopes) {
    if (!path.startsWith(prefix)) continue
    const status = matcher.test(path.slice(prefix.length))
    if (status.ignored || status.unignored) ignored = status.ignored
  }
  return ignored
}

export async function selectCodeFiles(
  root: string,
  selection: CodeSelection,
  maxFiles: number,
  signal?: AbortSignal,
): Promise<{ paths: string[]; bounded: boolean; error?: string }> {
  const input = selection.path ?? '.'
  const globs = selection.include ?? []
  const isGlob = /[*?[\]{}]/u.test(input)
  const base = resolveSafeWorkspacePath(root, isGlob ? '.' : input)
  if (!base.ok) return { paths: [], bounded: false, error: base.error }
  if (protectedPath(base.relativePath)) return { paths: [], bounded: false, error: 'protected-path' }
  if (globs.some(glob => typeof glob !== 'string' || glob.length > 200) || input.length > 512 || globs.length > 32) {
    return { paths: [], bounded: false, error: 'invalid-glob' }
  }
  const patterns = globs.map(glob => glob.replaceAll('\\', '/').replace(/^\.\//u, ''))
  const positives = patterns.filter(glob => !glob.startsWith('!'))
  const negatives = patterns.filter(glob => glob.startsWith('!')).map(glob => glob.slice(1))
  const includes = (path: string) => (!isGlob || matchesGlob(path, input))
    && (positives.length === 0 || positives.some(glob => matchesGlob(path, glob)))
    && !negatives.some(glob => matchesGlob(path, glob))
  const paths: string[] = []
  const scopes: IgnoreScope[] = []
  let visited = 0
  let bounded = false

  async function walk(path: string, parents: readonly IgnoreScope[], depth: number): Promise<void> {
    signal?.throwIfAborted()
    if (depth > MAX_SCAN_DEPTH) {
      bounded = true
      return
    }
    const local = await ignoreScope(root, path)
    const rules = local ? [...parents, local] : parents
    const children = await readdir(join(root, path), { withFileTypes: true }).catch(() => [])
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      if (++visited > MAX_SCAN_ENTRIES || paths.length >= maxFiles) {
        bounded = true
        return
      }
      const relative = path === '.' ? child.name : `${path}/${child.name}`
      if (child.isSymbolicLink() || protectedPath(relative) || child.name === '.gitignore') continue
      const directory = child.isDirectory()
      if (isIgnored(directory ? `${relative}/` : relative, rules)) continue
      if (directory) await walk(relative, rules, depth + 1)
      else if (child.isFile() && includes(relative)) paths.push(relative)
    }
  }

  const entry = await lstat(base.absolutePath).catch(() => undefined)
  if (!entry || entry.isSymbolicLink()) return { paths, bounded, error: 'not-found' }
  const pieces = base.relativePath === '.' ? [] : base.relativePath.split('/')
  for (let i = 0; i < pieces.length; i++) {
    const parent = pieces.slice(0, i).join('/') || '.'
    const local = await ignoreScope(root, parent)
    if (local) scopes.push(local)
    const path = pieces.slice(0, i + 1).join('/')
    const directory = i < pieces.length - 1 || entry.isDirectory()
    if (isIgnored(directory ? `${path}/` : path, scopes)) return { paths, bounded, error: 'ignored-path' }
  }
  if (entry.isFile() && includes(base.relativePath)) paths.push(base.relativePath)
  if (entry.isDirectory()) await walk(base.relativePath, scopes, pieces.length)
  return { paths, bounded }
}

export async function readWorkspaceCodeFile(root: string, path: string, maxBytes = MAX_CODE_BYTES): Promise<WorkspaceCodeFile | undefined> {
  const resolved = resolveSafeWorkspacePath(root, path)
  if (!resolved.ok) return undefined
  const file = await lstat(resolved.absolutePath).catch(() => undefined)
  if (!file?.isFile() || file.size > maxBytes) return undefined
  const handle = await open(resolved.absolutePath, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW)).catch(() => undefined)
  if (!handle) return undefined
  try {
    const current = await handle.stat()
    if (!current.isFile() || current.dev !== file.dev || current.ino !== file.ino || current.size > maxBytes) return undefined
    const buf = Buffer.allocUnsafe(current.size + 1)
    let length = 0
    while (length < buf.length) {
      const { bytesRead } = await handle.read(buf, length, buf.length - length, length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length !== current.size) return undefined
    const bytes = buf.subarray(0, length)
    if (isLikelyBinary(bytes)) return undefined
    return {
      path: resolved.relativePath,
      absolutePath: resolved.absolutePath,
      revision: sha256Hex(bytes),
      mode: current.mode & 0o777,
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
    }
  } catch {
    return undefined
  } finally {
    await handle.close()
  }
}
