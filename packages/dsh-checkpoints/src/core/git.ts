import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { deflate } from 'node:zlib'

export const EMPTY_TREE = createHash('sha256').update('tree 0\0').digest('hex')
export const VALID_OBJECT = /^[0-9a-f]{64}$/u
export const MAX_PATCH_BYTES = 512 * 1024
const DEFAULT_MAX_OUTPUT = 8 * 1024 * 1024
const GIT_TIMEOUT = 45_000
const compress = promisify(deflate)

export function gitEnvironment(globalConfig: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)))
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_AUTHOR_NAME: 'DSH Workspace Checkpoint',
    GIT_AUTHOR_EMAIL: 'checkpoint@localhost',
    GIT_COMMITTER_NAME: 'DSH Workspace Checkpoint',
    GIT_COMMITTER_EMAIL: 'checkpoint@localhost',
    LANG: 'C',
    LC_ALL: 'C',
  }
}

interface GitCommand {
  input?: Buffer | string
  signal?: AbortSignal
  maxOutput?: number
  truncate?: boolean
  init?: boolean
}

export function runGit(executable: string, repository: string, workspace: string, args: string[], {
  input, signal, maxOutput = DEFAULT_MAX_OUTPUT, truncate = false, init = false,
}: GitCommand = {}): Promise<Buffer> {
  if (!isAbsolute(executable)) throw new Error('Checkpoint Git requires an absolute executable path')
  signal?.throwIfAborted()
  const globalConfig = join(repository, '..', 'empty.gitconfig')
  const env = gitEnvironment(globalConfig)
  if (!init) {
    env.GIT_DIR = repository
    env.GIT_WORK_TREE = workspace
    env.GIT_INDEX_FILE = join(repository, 'dsh-index')
  }
  const flags = [
    '-c', 'core.autocrlf=false', '-c', 'core.filemode=true', '-c', 'core.fsmonitor=false',
    '-c', 'core.protectNTFS=true', '-c', 'core.protectHFS=true', '-c', 'core.quotePath=false',
    '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=' + join(repository, '..', 'no-hooks'),
    '-c', 'gc.auto=0', '-c', 'maintenance.auto=false',
  ]
  if (!init) flags.push('--git-dir=' + repository, '--work-tree=' + workspace)
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...flags, ...args], {
      cwd: join(repository, '..'), env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    let size = 0
    let error: Error | undefined
    const stop = (reason: Error) => { error ??= reason; child.kill('SIGKILL') }
    const abort = () => stop(new Error('Checkpoint operation cancelled'))
    const timeout = setTimeout(() => stop(new Error('Checkpoint Git command timed out')), GIT_TIMEOUT)
    signal?.addEventListener('abort', abort, { once: true })
    child.once('error', reason => { error ??= reason })
    child.stdout.on('data', (chunk: Buffer) => {
      const remaining = maxOutput - size
      if (chunk.length > remaining && !truncate) { stop(new Error('Checkpoint Git output exceeded its limit')); return }
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
      size += Math.min(remaining, chunk.length)
    })
    child.stderr.resume()
    child.stdin.on('error', reason => { if ((reason as NodeJS.ErrnoException).code !== 'EPIPE') error ??= reason })
    child.stdin.end(input)
    child.once('close', code => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else if (code !== 0) reject(new Error(`Checkpoint Git ${args[0]} failed (${code ?? 'terminated'})`))
      else resolve(Buffer.concat(chunks, size))
    })
  })
}

/** Write a standard SHA-256 Git loose object directly without invoking worktree filters or an index. */
export async function writeGitObject(repository: string, type: 'blob' | 'tree', bytes: Buffer): Promise<string> {
  const header = Buffer.from(`${type} ${bytes.length}\0`)
  const id = createHash('sha256').update(header).update(bytes).digest('hex')
  const directory = join(repository, 'objects', id.slice(0, 2))
  const target = join(directory, id.slice(2))
  const existing = await lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('Invalid checkpoint object path')
    return id
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = join(directory, '.object-' + randomUUID())
  try {
    const data = await compress(Buffer.concat([header, bytes]))
    await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
    try { await rename(temporary, target) }
    catch (error) {
      // Another file worker can publish the same content-addressed object
      // first. Windows may deny replacement if the winner is in use.
      const winner = await lstat(target).catch(() => undefined)
      if (!winner?.isFile() || winner.isSymbolicLink()) throw error
    }
    return id
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}

type TreeEntry = { mode: string; id: string } | { children: Map<string, TreeEntry> }

/** Git orders directory names as though they ended in a slash. */
export async function writeGitTree(repository: string, files: ReadonlyMap<string, { mode: string; id: string }>): Promise<string> {
  const root = new Map<string, TreeEntry>()
  for (const [path, file] of files) {
    const parts = path.split('/')
    let entries = root
    for (const part of parts.slice(0, -1)) {
      const entry = entries.get(part) ?? { children: new Map<string, TreeEntry>() }
      if (!('children' in entry)) throw new Error('Checkpoint path collides with a directory')
      entries.set(part, entry)
      entries = entry.children
    }
    entries.set(parts.at(-1)!, file)
  }
  async function store(entries: ReadonlyMap<string, TreeEntry>): Promise<string> {
    const parts: Array<{ order: Buffer; body: Buffer }> = []
    for (const [name, entry] of entries) {
      const directory = 'children' in entry
      const [mode, id] = directory ? ['40000', await store(entry.children)] : [entry.mode, entry.id]
      const order = Buffer.from(directory ? name + '/' : name, 'utf8')
      const body = Buffer.concat([Buffer.from(`${mode} ${name}\0`, 'utf8'), Buffer.from(id, 'hex')])
      parts.push({ order, body })
    }
    parts.sort((left, right) => Buffer.compare(left.order, right.order))
    return writeGitObject(repository, 'tree', Buffer.concat(parts.map(entry => entry.body)))
  }
  return store(root)
}
