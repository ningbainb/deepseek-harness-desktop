import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { EMPTY_TREE, MAX_PATCH_BYTES, VALID_OBJECT, runGit, writeGitTree } from './git.ts'
import { withFileLock, writeFileAtomic } from './sdk-adapter.ts'
import type {
  CaptureCheckpoint, Checkpoint, CheckpointDiff, CheckpointDiffOptions, CheckpointFile, RestoreCheckpoints,
  RestorePreview, RestoreResult, ShadowGitOptions,
} from './types.ts'
import {
  assertWorkspacePath, collectWorkspace, fileFingerprint, fileInfo, pathKey, PROTECTED_PATTERNS, restoreTarget, snapshotFiles,
  type GitEntry, type WorkspaceEntry,
} from './workspace.ts'

export type {
  CaptureCheckpoint, Checkpoint, CheckpointDiff, CheckpointDiffOptions, CheckpointFile, CheckpointSource,
  RestoreCheckpoints, RestorePreview, RestoreResult, ShadowGitOptions,
} from './types.ts'

const MIB = 1024 * 1024
const MAX_MANIFEST_BYTES = 16 * MIB
const DEFAULT_MAX_ITEMS = 100
const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_BYTES = 500 * MIB
const ID_PATTERN = /^[0-9a-f-]{36}$/u
const SOURCE_VALUES = new Set(['pre-turn', 'post-turn', 'pre-tool', 'post-tool', 'pre-restore', 'restore'])

interface Manifest {
  version: 1
  checkpoints: Checkpoint[]
  anchor?: Checkpoint
}

interface Repository {
  workspace: string
  home: string
  directory: string
  manifestPath: string
  manifest: Manifest
}

interface WorkspaceTree {
  hash: string
  entries: Map<string, WorkspaceEntry>
  skippedLargeFiles: string[]
  isIgnored(path: string): boolean
}

interface RestorePlan {
  current: WorkspaceTree
  target: Map<string, GitEntry>
  files: CheckpointFile[]
  token: string
}

function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }

function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT' }

function assertCapture(input: CaptureCheckpoint): void {
  if (!input.sessionId || input.sessionId.length > 256 || /[\u0000-\u001f]/u.test(input.sessionId)
    || (input.turnId !== undefined && (!input.turnId || input.turnId.length > 256 || /[\u0000-\u001f]/u.test(input.turnId)))
    || (input.baseCheckpointId !== undefined && !ID_PATTERN.test(input.baseCheckpointId))
    || !SOURCE_VALUES.has(input.source)) throw new Error('Invalid checkpoint origin')
}

function validateCheckpoint(record: Checkpoint): Checkpoint {
  if (!record || !ID_PATTERN.test(record.checkpointId) || !VALID_OBJECT.test(record.commitHash)
    || !VALID_OBJECT.test(record.treeHash) || (record.parentHash !== undefined && !VALID_OBJECT.test(record.parentHash))
    || !Number.isSafeInteger(record.timestamp) || !Array.isArray(record.skippedLargeFiles)
    || !record.stats || ![record.stats.filesChanged, record.stats.insertions, record.stats.deletions]
      .every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid checkpoint manifest record')
  assertCapture(record)
  for (const path of record.skippedLargeFiles) assertWorkspacePath(path)
  return record
}

function findCheckpoint(repository: Repository, id: string): Checkpoint {
  const record = repository.manifest.checkpoints.find(item => item.checkpointId === id)
  if (!record) throw new Error('Checkpoint is unavailable')
  return record
}

function sameEntries(left: ReadonlyMap<string, GitEntry>, right: ReadonlyMap<string, GitEntry>): boolean {
  return left.size === right.size && Array.from(left).every(([path, entry]) => {
    const other = right.get(path)
    return other?.mode === entry.mode && other.id === entry.id
  })
}

function parseEntries(output: Buffer): Map<string, GitEntry> {
  const entries = new Map<string, GitEntry>()
  for (const row of output.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([0-9a-f]{64})\t([\s\S]+)$/u.exec(row)
    if (!match) throw new Error('Invalid checkpoint tree entry')
    const [, mode, id, path] = match
    assertWorkspacePath(path!)
    entries.set(path!, { id: id!, mode: mode as GitEntry['mode'] })
  }
  return entries
}

function parseStatistics(output: Buffer): Map<string, Pick<CheckpointFile, 'insertions' | 'deletions' | 'binary'>> {
  const result = new Map<string, Pick<CheckpointFile, 'insertions' | 'deletions' | 'binary'>>()
  for (const row of output.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/u.exec(row)
    if (!match) throw new Error('Invalid checkpoint diff statistics')
    const [, added, removed, path] = match
    assertWorkspacePath(path!)
    result.set(path!, { insertions: added === '-' ? 0 : Number(added), deletions: removed === '-' ? 0 : Number(removed), binary: added === '-' })
  }
  return result
}

export class ShadowGit {
  #cache = new Map<string, { tree: string; entries: Map<string, WorkspaceEntry> }>()
  #cleanup = new Map<string, ReturnType<typeof setTimeout>>()
  #maxFileBytes: number
  #maxItems: number
  #maxAge: number
  #maxBytes: number
  #idle: number

  constructor(private readonly options: ShadowGitOptions) {
    if (!isAbsolute(options.homePath) || !isAbsolute(options.gitPath)) throw new Error('Checkpoint Home and Git paths must be absolute')
    this.#maxFileBytes = options.maxFileBytes ?? 10 * MIB
    this.#maxItems = options.retention?.maxItems ?? DEFAULT_MAX_ITEMS
    this.#maxAge = options.retention?.maxAgeMs ?? DEFAULT_MAX_AGE
    this.#maxBytes = options.retention?.maxBytes ?? DEFAULT_MAX_BYTES
    this.#idle = options.retention?.idleMs ?? 2_000
    if (!Number.isSafeInteger(this.#maxFileBytes) || this.#maxFileBytes < 1 || this.#maxFileBytes > 64 * MIB
      || !Number.isSafeInteger(this.#maxItems) || this.#maxItems < 2 || this.#maxItems > 2000
      || !Number.isSafeInteger(this.#maxAge) || this.#maxAge < 1
      || !Number.isSafeInteger(this.#maxBytes) || this.#maxBytes < this.#maxFileBytes
      || !Number.isSafeInteger(this.#idle) || this.#idle < 1) throw new Error('Invalid checkpoint retention limits')
  }

  async #prepare(workspacePath: string, create: boolean): Promise<Omit<Repository, 'manifest'> | undefined> {
    if (!isAbsolute(workspacePath)) throw new Error('Checkpoint workspace path must be absolute')
    const workspace = await realpath(workspacePath)
    if (!(await fileInfo(workspace))?.isDirectory()) throw new Error('Checkpoint workspace is not a directory')
    const home = await realpath(this.options.homePath)
    const location = relative(home, workspace)
    if (!isAbsolute(location) && location !== '..' && !location.startsWith('..' + sep)) throw new Error('Checkpoint workspace is inside private Desktop storage')
    const directory = join(home, 'checkpoints', digest(pathKey(workspace)), 'repo.git')
    if (create) await mkdir(directory, { recursive: true, mode: 0o700 })
    const canonical = await realpath(directory).catch(error => { if (!isMissing(error)) throw error })
    if (canonical === undefined && !create) return undefined
    if (!canonical || relative(directory, canonical)) throw new Error('Checkpoint storage is not an isolated directory')
    return { workspace, home, directory, manifestPath: join(directory, 'manifest.json') }
  }

  async #open<T>(workspacePath: string, create: true, operation: (repository: Repository) => Promise<T>, signal?: AbortSignal): Promise<T>
  async #open<T>(workspacePath: string, create: false, operation: (repository: Repository) => Promise<T>, signal?: AbortSignal): Promise<T | undefined>
  async #open<T>(workspacePath: string, create: boolean, operation: (repository: Repository) => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
    const data = await this.#prepare(workspacePath, create)
    if (!data) return undefined
    return withFileLock(data.manifestPath, async () => {
      signal?.throwIfAborted()
      if (!(await fileInfo(join(data.directory, 'config')))) {
        await writeFile(join(data.directory, '..', 'empty.gitconfig'), '', { mode: 0o600 })
        await runGit(this.options.gitPath, data.directory, data.workspace,
          ['init', '--bare', '--object-format=sha256', '--template=', data.directory], { init: true, signal })
        await mkdir(join(data.directory, 'info'), { recursive: true, mode: 0o700 })
        await writeFile(join(data.directory, 'info', 'exclude'), PROTECTED_PATTERNS.join('\n') + '\n', { mode: 0o600 })
      }
      const info = await fileInfo(data.manifestPath)
      let manifest: Manifest = { version: 1, checkpoints: [] }
      if (info) {
        if (!info.isFile() || info.isSymbolicLink() || info.size > BigInt(MAX_MANIFEST_BYTES)) throw new Error('Invalid checkpoint manifest')
        manifest = JSON.parse(await readFile(data.manifestPath, 'utf8')) as Manifest
        if (manifest.version !== 1 || !Array.isArray(manifest.checkpoints)) throw new Error('Invalid checkpoint manifest')
        for (const checkpoint of manifest.checkpoints) validateCheckpoint(checkpoint)
        if (manifest.anchor) validateCheckpoint(manifest.anchor)
      }
      return operation({ ...data, manifest })
    }, { signal, waitMs: 8_000 })
  }

  #git(repository: Repository, args: string[], settings?: Parameters<typeof runGit>[4]): Promise<Buffer> {
    return runGit(this.options.gitPath, repository.directory, repository.workspace, args, settings)
  }

  async #workingTree(repository: Repository, signal?: AbortSignal): Promise<WorkspaceTree> {
    const { candidates, isIgnored } = await collectWorkspace(repository.workspace, repository.home, signal)
    const prior = repository.manifest.checkpoints[0]
    const cache = this.#cache.get(repository.directory)
    const known = prior && cache?.tree === prior.treeHash ? cache.entries : new Map<string, WorkspaceEntry>()
    const scan = await snapshotFiles(repository.workspace, repository.directory, candidates,
      known, this.#maxFileBytes, this.#maxBytes, signal)
    const hash = prior && cache?.tree === prior.treeHash && sameEntries(cache.entries, scan.entries)
      ? prior.treeHash : await writeGitTree(repository.directory, scan.entries)
    return { ...scan, hash, isIgnored }
  }

  async #entries(repository: Repository, tree: string, signal?: AbortSignal): Promise<Map<string, GitEntry>> {
    if (tree === EMPTY_TREE) return new Map()
    return parseEntries(await this.#git(repository, ['ls-tree', '-r', '-z', tree], { signal }))
  }

  async #fileChanges(repository: Repository, fromHash: string, toHash: string, before: ReadonlyMap<string, GitEntry>,
    after: ReadonlyMap<string, GitEntry>, allow?: ReadonlySet<string>, signal?: AbortSignal): Promise<CheckpointFile[]> {
    if (fromHash === toHash) return []
    const stats = parseStatistics(await this.#git(repository,
      ['--literal-pathspecs', 'diff', '--numstat', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', fromHash, toHash, '--', ...(allow ?? [])], { signal }))
    return Array.from(stats, ([path, numeric]) => {
      const status = before.has(path) ? after.has(path) ? 'modified' as const : 'deleted' as const : 'added' as const
      return { path, status, ...numeric }
    }).filter(file => !allow || allow.has(file.path))
  }

  async #record(repository: Repository, input: CaptureCheckpoint, tree: WorkspaceTree,
    stats: Checkpoint['stats'] | Promise<Checkpoint['stats']>, signal?: AbortSignal): Promise<Checkpoint> {
    assertCapture(input)
    const checkpointId = randomUUID()
    const timestamp = Date.now()
    const parentHash = repository.manifest.checkpoints[0]?.commitHash
    // One Git plumbing invocation commits the already-hashed tree and publishes
    // both shadow refs. Logical ancestry in the manifest allows independent GC.
    const message = JSON.stringify({ checkpointId, ...input, parentHash, timestamp })
    const stream = `commit refs/dsh/checkpoints/${checkpointId}\nmark :1\n`
      + `committer DSH Workspace Checkpoint <checkpoint@localhost> ${Math.floor(timestamp / 1000)} +0000\n`
      + `data ${Buffer.byteLength(message)}\n${message}\nM 040000 ${tree.hash} ""\n\nget-mark :1\n`
      + `reset refs/dsh/sessions/${digest(input.sessionId)}\nfrom :1\n\ndone\n`
    // The diff reader and fast-import both use the immutable object tree. Wait
    // for both before releasing the workspace lock, even if one fails.
    const [written, measured] = await Promise.allSettled([
      this.#git(repository, ['fast-import', '--quiet', '--force', '--done'], { input: stream, signal }), stats,
    ])
    const commitHash = written.status === 'fulfilled' ? written.value.toString('ascii').trim() : ''
    if (!VALID_OBJECT.test(commitHash) || measured.status === 'rejected') {
      await this.#restoreRefs(repository, checkpointId, input.sessionId)
      if (written.status === 'rejected') throw written.reason
      if (measured.status === 'rejected') throw measured.reason
      throw new Error('Invalid checkpoint commit hash')
    }
    const record: Checkpoint = { ...input, checkpointId, timestamp, parentHash, commitHash, treeHash: tree.hash,
      stats: measured.value, skippedLargeFiles: tree.skippedLargeFiles }
    repository.manifest.checkpoints.unshift(record)
    try { await this.#writeManifest(repository) }
    catch (error) {
      repository.manifest.checkpoints.shift()
      await this.#restoreRefs(repository, checkpointId, input.sessionId)
      throw error
    }
    this.#cache.set(repository.directory, { tree: tree.hash, entries: tree.entries })
    this.#scheduleCleanup(repository)
    return record
  }

  async #restoreRefs(repository: Repository, checkpointId: string, sessionId: string): Promise<void> {
    const previous = repository.manifest.checkpoints.find(item => item.sessionId === sessionId)
    const sessionRef = 'refs/dsh/sessions/' + digest(sessionId)
    const input = `delete refs/dsh/checkpoints/${checkpointId}\n`
      + (previous ? `update ${sessionRef} ${previous.commitHash}\n` : `delete ${sessionRef}\n`)
    await this.#git(repository, ['update-ref', '--stdin'], { input })
  }

  async #writeManifest(repository: Repository): Promise<void> {
    const content = JSON.stringify(repository.manifest)
    if (Buffer.byteLength(content) > MAX_MANIFEST_BYTES) throw new Error('Checkpoint manifest exceeds its limit')
    await writeFileAtomic(repository.manifestPath, content, { mode: 0o600 })
  }

  #scheduleCleanup(repository: Repository): void {
    const key = repository.directory
    clearTimeout(this.#cleanup.get(key))
    const timer = setTimeout(() => {
      this.#cleanup.delete(key)
      void this.#open(repository.workspace, false, state => this.#prune(state)).catch(() => {})
    }, this.#idle).unref()
    this.#cleanup.set(key, timer)
  }

  async #objectBytes(repository: Repository): Promise<number> {
    const counts = (await this.#git(repository, ['count-objects', '-v'])).toString('ascii')
    return [...counts.matchAll(/^size(?:-pack)?: (\d+)$/gmu)].reduce((total, match) => total + Number(match[1]) * 1024, 0)
  }

  async #prune(repository: Repository): Promise<void> {
    const { checkpoints } = repository.manifest
    if (!checkpoints.length) return
    const maxAge = Date.now() - this.#maxAge
    const recent = checkpoints.filter((checkpoint, index) => index === 0 || (index < this.#maxItems && checkpoint.timestamp >= maxAge))
    const undo = recent.find(item => item.source === 'pre-restore')
    const protectedIds = new Set([recent[0]!.checkpointId, ...(undo ? [undo.checkpointId] : [])])
    const bytes = await this.#objectBytes(repository)
    const overQuota = bytes > this.#maxBytes
    const keepCount = overQuota ? Math.max(protectedIds.size, Math.floor(recent.length * this.#maxBytes / bytes)) : recent.length
    const retain = recent.filter((item, index) => index < keepCount || protectedIds.has(item.checkpointId))
    await this.#trim(repository, retain, true, overQuota)
    if (overQuota && (retain.length > protectedIds.size || repository.manifest.anchor)
      && await this.#objectBytes(repository) > this.#maxBytes) {
      // Bound idle work to two collections. Keep the current snapshot and its
      // recent undo even if those two needed trees alone exceed the disk budget.
      await this.#trim(repository, retain.filter(item => protectedIds.has(item.checkpointId)), false, true)
    }
  }

  async #trim(repository: Repository, retained: Checkpoint[], keepParent: boolean, collect: boolean): Promise<void> {
    const { checkpoints, anchor } = repository.manifest
    const oldest = retained.at(-1)!
    const previous = keepParent && [...checkpoints, ...(anchor ? [anchor] : [])].find(item => item.commitHash === oldest.parentHash)
    const ids = new Set([...retained, ...(previous ? [previous] : [])].map(item => item.checkpointId))
    const removed = [...checkpoints, ...(anchor ? [anchor] : [])].filter(item => !ids.has(item.checkpointId))
    if (retained.length !== checkpoints.length || removed.length) {
      repository.manifest = { version: 1, checkpoints: retained, anchor: previous || undefined }
      await this.#writeManifest(repository)
      const heads = new Map(retained.toReversed().map(item => [item.sessionId, item.commitHash]))
      const removedSessions = new Set(removed.map(item => item.sessionId))
      const refs = removed.map(item => `delete refs/dsh/checkpoints/${item.checkpointId}\n`)
        .concat(Array.from(removedSessions, id => heads.has(id) ? `update refs/dsh/sessions/${digest(id)} ${heads.get(id)}\n`
          : `delete refs/dsh/sessions/${digest(id)}\n`)).join('')
      if (refs) await this.#git(repository, ['update-ref', '--stdin'], { input: refs })
    }
    if (collect || removed.length) await this.#git(repository, ['gc', '--prune=now', '--quiet'])
  }

  async capture(workspacePath: string, input: CaptureCheckpoint, signal?: AbortSignal): Promise<Checkpoint | undefined> {
    assertCapture(input)
    return this.#open(workspacePath, true, async repository => {
      const tree = await this.#workingTree(repository, signal)
      const previous = repository.manifest.checkpoints[0]
      const prior = previous?.treeHash ?? EMPTY_TREE
      if (previous && prior === tree.hash) {
        if (input.source === 'post-turn' && input.turnId && previous.source === 'post-tool'
          && previous.sessionId === input.sessionId && previous.turnId === input.turnId) {
          const completed: Checkpoint = { ...previous, source: 'post-turn' }
          repository.manifest.checkpoints[0] = completed
          await this.#writeManifest(repository)
          return completed
        }
        return undefined
      }
      const base = repository.manifest.checkpoints.find(item => item.checkpointId === input.baseCheckpointId)
      const baseTree = base?.treeHash ?? prior
      const cached = this.#cache.get(repository.directory)
      const before = cached?.tree === baseTree ? cached.entries : await this.#entries(repository, baseTree, signal)
      if (tree.hash === EMPTY_TREE && baseTree === EMPTY_TREE && input.source !== 'pre-turn' && input.source !== 'pre-tool') return undefined
      const statistics = this.#fileChanges(repository, baseTree, tree.hash, before, tree.entries, undefined, signal).then(summarize)
      return this.#record(repository, { ...input, baseCheckpointId: base?.checkpointId }, tree, statistics, signal)
    }, signal)
  }

  async list(workspacePath: string, sessionId?: string, signal?: AbortSignal): Promise<Checkpoint[]> {
    const result = await this.#open(workspacePath, false, async repository => repository.manifest.checkpoints
      .filter(item => sessionId === undefined || item.sessionId === sessionId), signal)
    return result ?? []
  }

  async diff(workspacePath: string, checkpointId: string, options: CheckpointDiffOptions = {}, signal?: AbortSignal): Promise<CheckpointDiff> {
    if (options.path) assertWorkspacePath(options.path)
    const result = await this.#open(workspacePath, false, async repository => {
      const target = findCheckpoint(repository, checkpointId)
      const known = [...repository.manifest.checkpoints, repository.manifest.anchor]
      const baseId = options.baseCheckpointId ?? target.baseCheckpointId
      const base = known.find(item => baseId && item?.checkpointId === baseId)
        ?? known.find(item => item?.commitHash === target.parentHash)
      const working = options.against === 'working' ? await this.#workingTree(repository, signal) : undefined
      const fromHash = working ? target.treeHash : base?.treeHash ?? EMPTY_TREE
      const toHash = working?.hash ?? target.treeHash
      const before = await this.#entries(repository, fromHash, signal)
      const after = working?.entries ?? await this.#entries(repository, toHash, signal)
      const selection = options.path ? new Set([options.path]) : undefined
      const files = await this.#fileChanges(repository, fromHash, toHash, before, after, selection, signal)
      if (options.summariesOnly || files.length === 0) return { files, patch: '' }
      const patch = await this.#git(repository, ['--literal-pathspecs', 'diff', '--no-color', '--no-renames', '--no-ext-diff',
        '--no-textconv', fromHash, toHash, '--', ...(selection ?? [])], { signal, maxOutput: MAX_PATCH_BYTES, truncate: true })
      return { files, patch: patch.length < MAX_PATCH_BYTES ? patch.toString('utf8') : '' }
    }, signal)
    if (!result) throw new Error('Checkpoint is unavailable')
    return result
  }

  async #restorePlan(repository: Repository, checkpointId: string, paths?: string[], signal?: AbortSignal): Promise<RestorePlan> {
    const record = findCheckpoint(repository, checkpointId)
    const target = await this.#entries(repository, record.treeHash, signal)
    const current = await this.#workingTree(repository, signal)
    const chosen = paths ? new Set(paths.toSorted()) : undefined
    for (const path of chosen ?? []) {
      assertWorkspacePath(path)
      if (!target.has(path) && !current.entries.has(path)) throw new Error('Selected path is not part of the checkpoint')
    }
    const files = await this.#fileChanges(repository, current.hash, record.treeHash, current.entries, target, chosen, signal)
    for (const { path } of files) {
      if (current.isIgnored(path)) throw new Error('An excluded path blocks checkpoint restore')
      await this.#checkedRestoreTarget(repository, path, current.entries.get(path), false)
    }
    const token = digest(JSON.stringify([repository.directory, current.hash, record.checkpointId, Array.from(chosen ?? []), !!chosen]))
    return { current, target, files, token }
  }

  async previewRestore(workspacePath: string, checkpointId: string, paths?: string[], signal?: AbortSignal): Promise<RestorePreview> {
    const result = await this.#open(workspacePath, false, async repository => {
      const { token, files } = await this.#restorePlan(repository, checkpointId, paths, signal)
      return { checkpointId, token, files }
    }, signal)
    if (!result) throw new Error('Checkpoint is unavailable')
    return result
  }

  async #checkedRestoreTarget(repository: Repository, path: string, expected: WorkspaceEntry | undefined, createParents: boolean): Promise<string> {
    const filename = await restoreTarget(repository.workspace, path, createParents)
    const current = await fileInfo(filename)
    if (expected ? !current?.isFile() || current.nlink !== 1n || fileFingerprint(current) !== expected.fingerprint : !!current) {
      throw new Error('The workspace changed or an excluded path blocks restore')
    }
    return filename
  }

  async #readBlob(repository: Repository, entry?: GitEntry, signal?: AbortSignal): Promise<Buffer | undefined> {
    if (!entry) return undefined
    return this.#git(repository, ['cat-file', 'blob', entry.id], { signal, maxOutput: this.#maxFileBytes })
  }

  async #apply(filename: string, data?: Buffer, entry?: GitEntry): Promise<void> {
    if (!entry || !data) { await unlink(filename); return }
    const info = await fileInfo(filename)
    const readWrite = info?.isFile() ? Number(info.mode & 0o666n) : 0o600
    const mode = entry.mode === '100755' ? readWrite | ((readWrite & 0o444) >> 2) : readWrite
    await writeFileAtomic(filename, data, { mode })
  }

  async restore(workspacePath: string, input: RestoreCheckpoints, signal?: AbortSignal): Promise<RestoreResult> {
    const origin = { sessionId: input.sessionId, turnId: input.turnId }
    assertCapture({ ...origin, source: 'pre-restore' })
    const result = await this.#open(workspacePath, false, async repository => {
      const plan = await this.#restorePlan(repository, input.checkpointId, input.paths, signal)
      if (input.token !== plan.token) throw new Error('The checkpoint restore preview is stale')
      if (!plan.files.length) throw new Error('No workspace changes to restore')
      input.beforeApply?.()
      const undoCheckpoint = await this.#record(repository, { ...origin, source: 'pre-restore' }, plan.current,
        { filesChanged: 0, insertions: 0, deletions: 0 }, signal)
      const applied: Array<{ path: string; state?: string }> = []
      // All paths were checked before writing. Recheck each one immediately before replacement.
      try {
        for (const { path } of plan.files) {
          const target = plan.target.get(path)
          const data = await this.#readBlob(repository, target, signal)
          input.beforeApply?.()
          const filename = await this.#checkedRestoreTarget(repository, path, plan.current.entries.get(path), !!target)
          input.beforeApply?.()
          signal?.throwIfAborted()
          await this.#apply(filename, data, target)
          const state = await fileInfo(filename)
          applied.push({ path, state: state ? fileFingerprint(state) : undefined })
        }
      } catch (error) {
        let incomplete = false
        for (const { path, state } of applied.reverse()) {
          try {
            const entry = plan.current.entries.get(path)
            const data = await this.#readBlob(repository, entry)
            const filename = await restoreTarget(repository.workspace, path)
            const current = await fileInfo(filename)
            if (state !== (current ? fileFingerprint(current) : undefined)) { incomplete = true; continue }
            input.beforeApply?.()
            await this.#apply(filename, data, entry)
          } catch { incomplete = true }
        }
        if (incomplete) throw new Error('Restore was interrupted. Use the saved pre-restore checkpoint to undo remaining changes.', { cause: error })
        throw error
      }
      const tree = await this.#workingTree(repository)
      const checkpoint = await this.#record(repository, { ...origin, source: 'restore' }, tree, summarize(plan.files))
      return { checkpoint, undoCheckpoint, files: plan.files }
    }, signal)
    if (!result) throw new Error('Checkpoint is unavailable')
    return result
  }
}

function summarize(files: CheckpointFile[]): Checkpoint['stats'] {
  return files.reduce((stats, file) => ({ filesChanged: stats.filesChanged + 1,
    insertions: stats.insertions + file.insertions, deletions: stats.deletions + file.deletions }),
  { filesChanged: 0, insertions: 0, deletions: 0 })
}
