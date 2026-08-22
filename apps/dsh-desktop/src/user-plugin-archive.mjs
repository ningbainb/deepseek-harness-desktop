import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, createReadStream } from 'node:fs'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * A private, byte-preserving profile archive used before Desktop mutates a
 * profile that may contain user-owned plugins.  This module deliberately does
 * not inspect package manifests or follow links: a malformed or hand-edited
 * plugin is still user data which must be recoverable before any repair code
 * tries to understand it.
 */
export const USER_PLUGIN_ARCHIVE_SCHEMA_VERSION = 1

export const USER_PLUGIN_ARCHIVE_PHASES = Object.freeze([
  'intent',
  'archived',
  'applied',
  'committed',
  'rolled-back',
])

/**
 * Every default item is a direct child of profileDir.  Keeping this list flat
 * is important: workspace declarations may name arbitrary projects, but the
 * archive must never recurse into those projects merely because a profile
 * mentions them.
 */
export const USER_PLUGIN_ARCHIVE_PROFILE_ARTIFACTS = Object.freeze([
  Object.freeze({ id: 'package-json', relativePath: 'package.json' }),
  Object.freeze({ id: 'pnpm-lock-yaml', relativePath: 'pnpm-lock.yaml' }),
  Object.freeze({ id: 'cordis-patch-yml', relativePath: 'cordis.patch.yml' }),
  Object.freeze({ id: 'desktop-links-json', relativePath: '.dsh-desktop-links.json' }),
  Object.freeze({ id: 'cordis-yml', relativePath: 'cordis.yml' }),
  Object.freeze({ id: 'cordis-yaml', relativePath: 'cordis.yaml' }),
  Object.freeze({ id: 'pnpm-workspace-yaml', relativePath: 'pnpm-workspace.yaml' }),
  Object.freeze({ id: 'pnpm-workspace-yml', relativePath: 'pnpm-workspace.yml' }),
  Object.freeze({ id: 'npmrc', relativePath: '.npmrc' }),
])

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const PHASES = new Set(USER_PLUGIN_ARCHIVE_PHASES)
const NODE_MODULES_DIRECTORY = 'node_modules'
const SNAPSHOTS_DIRECTORY = 'snapshots'
const JOURNAL_DIRECTORY = 'journal'
const ACTIVE_JOURNAL_FILE = 'active.json'
const METADATA_FILE = 'metadata.json'
const INVENTORY_FILE = 'node-modules.inventory.json'
const PROFILE_FILES_DIRECTORY = 'profile-files'
const SAFE_COPY_FALLBACK_CODES = new Set(['EXDEV', 'EACCES', 'EBUSY', 'EPERM'])

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function assertSafeId(value, label = 'id') {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function assertDirectProfileChild(value, label) {
  assertNonEmptyString(value, label)
  if (
    value === '.'
    || value === '..'
    || value.includes('/')
    || value.includes('\\')
    || value.includes('\0')
    || isAbsolute(value)
    || value === NODE_MODULES_DIRECTORY
  ) {
    throw new TypeError(`${label} must be a direct profile file name`)
  }
  return value
}

function isSameOrDescendant(candidate, parent) {
  const result = relative(parent, candidate)
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !isAbsolute(result))
}

function pathsOverlap(first, second) {
  return isSameOrDescendant(first, second) || isSameOrDescendant(second, first)
}

function normalizeProfileArtifacts(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('profileArtifacts must be a non-empty array')
  }
  const ids = new Set()
  const paths = new Set()
  return Object.freeze(value.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('profile artifact must be an object')
    }
    const id = assertSafeId(item.id, 'profile artifact id')
    const relativePath = assertDirectProfileChild(item.relativePath, 'profile artifact relativePath')
    if (ids.has(id) || paths.has(relativePath)) {
      throw new TypeError(`profile artifact is duplicated: ${id}`)
    }
    ids.add(id)
    paths.add(relativePath)
    return Object.freeze({ id, relativePath })
  }))
}

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutable(item)))
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)])))
  }
  return value
}

async function lstatIfPresent(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function readTextIfPresent(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function pathPresent(path) {
  return (await lstatIfPresent(path)) !== undefined
}

function modeOf(stat) {
  return stat.mode & 0o7777
}

function temporaryPath(path, label = 'tmp') {
  return `${path}.${label}-${process.pid}-${randomUUID()}`
}

/** Directory fsync is unavailable on Windows; a durable file+rename remains useful there. */
async function syncDirectory(path) {
  let handle
  try {
    handle = await open(path, 'r')
    await handle.sync()
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR', 'UNKNOWN'].includes(error?.code)) throw error
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function writeDurableFile(path, content, { flag = 'wx', mode } = {}) {
  await mkdir(dirname(path), { recursive: true })
  const handle = await open(path, flag, mode)
  try {
    await handle.writeFile(content)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await syncDirectory(dirname(path))
}

async function replaceLeafAtomically(target, createTemporary) {
  await mkdir(dirname(target), { recursive: true })
  const temporary = temporaryPath(target)
  const backup = temporaryPath(target, 'backup')
  let movedExisting = false
  try {
    await createTemporary(temporary)
    const existing = await lstatIfPresent(target)
    if (existing !== undefined) {
      if (existing.isDirectory()) {
        throw new Error(`refusing to replace a directory at profile artifact ${target}`)
      }
      await rename(target, backup)
      movedExisting = true
    }
    await rename(temporary, target)
    await syncDirectory(dirname(target))
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await rm(target, { force: true }).catch(() => {})
      await rename(backup, target).catch(() => {})
    }
    throw error
  }
}

async function writeLeafAtomically(path, bytes, mode) {
  await replaceLeafAtomically(path, async (temporary) => {
    await writeDurableFile(temporary, bytes, { flag: 'wx', mode })
    if (typeof mode === 'number') await chmod(temporary, mode)
  })
}

async function createLinkWithoutFollowingTarget(target, destination) {
  try {
    await symlink(target, destination)
  } catch (error) {
    // pnpm commonly uses directory junctions on Windows.  A normal symbolic
    // link may require a developer-mode privilege there even though recreating
    // a junction does not.  This fallback never opens or reads the target.
    if (process.platform !== 'win32' || !['EACCES', 'EPERM'].includes(error?.code)) throw error
    await symlink(target, destination, 'junction')
  }
}

async function writeLinkAtomically(path, target) {
  await replaceLeafAtomically(path, async (temporary) => {
    await createLinkWithoutFollowingTarget(target, temporary)
    await syncDirectory(dirname(temporary))
  })
}

async function removeLeaf(path) {
  const existing = await lstatIfPresent(path)
  if (existing === undefined) return
  if (existing.isDirectory()) {
    throw new Error(`refusing to remove a directory at profile artifact ${path}`)
  }
  await rm(path, { force: true })
  await syncDirectory(dirname(path))
}

async function hashRegularFile(path) {
  const before = await lstat(path)
  if (!before.isFile()) throw new Error(`expected a regular file while hashing ${path}`)
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
    bytes += chunk.length
  }
  const after = await lstat(path)
  if (
    !after.isFile()
    || after.size !== before.size
    || after.mtimeMs !== before.mtimeMs
    || after.ctimeMs !== before.ctimeMs
  ) {
    throw new Error(`file changed while building user plugin archive inventory: ${path}`)
  }
  return Object.freeze({ sha256: hash.digest('hex'), size: bytes, mode: modeOf(after) })
}

function assertSafeChildName(name, root) {
  if (
    typeof name !== 'string'
    || name.length === 0
    || name === '.'
    || name === '..'
    || name.includes('/')
    || name.includes('\\')
    || name.includes('\0')
  ) {
    throw new Error(`unsafe filesystem child encountered while archiving ${root}`)
  }
  return name
}

/**
 * Inventory a tree with lstat/readlink only.  In particular, no symlink is
 * resolved, stat'ed, copied from, or recursively descended into.
 */
export async function inventoryUserPluginTree(root) {
  const initial = await lstatIfPresent(root)
  if (initial === undefined) {
    return immutable({ present: false, entries: [], fileCount: 0, totalBytes: 0 })
  }

  const entries = []
  let fileCount = 0
  let totalBytes = 0

  async function visit(path, relativePath) {
    const stat = await lstat(path)
    if (stat.isDirectory()) {
      entries.push({ kind: 'directory', path: relativePath, mode: modeOf(stat) })
      const names = (await readdir(path)).map((name) => assertSafeChildName(name, root)).sort()
      for (const name of names) {
        await visit(join(path, name), relativePath === '' ? name : `${relativePath}/${name}`)
      }
      return
    }
    if (stat.isFile()) {
      const digest = await hashRegularFile(path)
      fileCount += 1
      totalBytes += digest.size
      entries.push({ kind: 'file', path: relativePath, ...digest })
      return
    }
    if (stat.isSymbolicLink()) {
      const target = await readlink(path)
      const after = await lstat(path)
      if (!after.isSymbolicLink()) {
        throw new Error(`link changed while building user plugin archive inventory: ${path}`)
      }
      entries.push({ kind: 'symlink', path: relativePath, mode: modeOf(after), target })
      return
    }
    throw new Error(`user plugin archive cannot preserve a special filesystem entry: ${path}`)
  }

  await visit(root, '')
  return immutable({ present: true, entries, fileCount, totalBytes })
}

function inventoriesEqual(first, second) {
  return JSON.stringify(first) === JSON.stringify(second)
}

async function copyTreeWithoutFollowingLinks(source, destination) {
  async function copyEntry(from, to) {
    const stat = await lstat(from)
    if (stat.isDirectory()) {
      await mkdir(to, { recursive: false, mode: 0o700 })
      const names = (await readdir(from)).map((name) => assertSafeChildName(name, source)).sort()
      for (const name of names) await copyEntry(join(from, name), join(to, name))
      await chmod(to, modeOf(stat))
      return
    }
    if (stat.isFile()) {
      await copyFile(from, to, fsConstants.COPYFILE_EXCL)
      await chmod(to, modeOf(stat))
      return
    }
    if (stat.isSymbolicLink()) {
      // Do not inspect the target.  The target can be outside the profile and
      // its contents are intentionally not part of this archive.
      await createLinkWithoutFollowingTarget(await readlink(from), to)
      return
    }
    throw new Error(`user plugin archive cannot copy a special filesystem entry: ${from}`)
  }

  await copyEntry(source, destination)
}

function profileArtifactArchivePath(snapshotDir, id) {
  return join(snapshotDir, PROFILE_FILES_DIRECTORY, `${id}.bin`)
}

async function captureProfileArtifact(profileDir, snapshotDir, descriptor) {
  const source = join(profileDir, descriptor.relativePath)
  const stat = await lstatIfPresent(source)
  if (stat === undefined) {
    return Object.freeze({
      id: descriptor.id,
      relativePath: descriptor.relativePath,
      kind: 'absent',
    })
  }
  if (stat.isFile()) {
    const bytes = await readFile(source)
    const after = await lstat(source)
    if (!after.isFile()) throw new Error(`profile artifact changed while archiving: ${source}`)
    const archivePath = profileArtifactArchivePath(snapshotDir, descriptor.id)
    await writeDurableFile(archivePath, bytes, { flag: 'wx', mode: modeOf(after) })
    return Object.freeze({
      id: descriptor.id,
      relativePath: descriptor.relativePath,
      kind: 'file',
      size: bytes.length,
      sha256: sha256(bytes),
      mode: modeOf(after),
    })
  }
  if (stat.isSymbolicLink()) {
    const target = await readlink(source)
    const after = await lstat(source)
    if (!after.isSymbolicLink()) throw new Error(`profile artifact link changed while archiving: ${source}`)
    return Object.freeze({
      id: descriptor.id,
      relativePath: descriptor.relativePath,
      kind: 'symlink',
      target,
      mode: modeOf(after),
    })
  }
  throw new Error(`profile artifact is not a file or symlink: ${source}`)
}

async function captureProfileArtifacts(profileDir, snapshotDir, descriptors) {
  const entries = []
  for (const descriptor of descriptors) {
    entries.push(await captureProfileArtifact(profileDir, snapshotDir, descriptor))
  }
  return Object.freeze(entries)
}

async function captureCurrentProfileArtifact(profileDir, entry) {
  const source = join(profileDir, entry.relativePath)
  const stat = await lstatIfPresent(source)
  if (stat === undefined) return Object.freeze({ ...entry, kind: 'absent' })
  if (stat.isFile()) {
    const bytes = await readFile(source)
    const after = await lstat(source)
    if (!after.isFile()) throw new Error(`profile artifact changed while preparing restore: ${source}`)
    return Object.freeze({ ...entry, kind: 'file', bytes, mode: modeOf(after) })
  }
  if (stat.isSymbolicLink()) {
    const target = await readlink(source)
    const after = await lstat(source)
    if (!after.isSymbolicLink()) throw new Error(`profile artifact link changed while preparing restore: ${source}`)
    return Object.freeze({ ...entry, kind: 'symlink', target, mode: modeOf(after) })
  }
  throw new Error(`profile artifact is not a file or symlink: ${source}`)
}

async function captureCurrentProfileArtifacts(profileDir, entries) {
  const result = []
  for (const entry of entries) result.push(await captureCurrentProfileArtifact(profileDir, entry))
  return Object.freeze(result)
}

function assertArchiveEntry(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('user plugin archive profile artifact metadata is invalid')
  }
  const id = assertSafeId(entry.id, 'archived profile artifact id')
  const relativePath = assertDirectProfileChild(entry.relativePath, 'archived profile artifact relativePath')
  if (!['absent', 'file', 'symlink'].includes(entry.kind)) {
    throw new Error('user plugin archive profile artifact kind is invalid')
  }
  if (entry.kind === 'file') {
    if (!Number.isInteger(entry.size) || entry.size < 0 || !SHA256_PATTERN.test(entry.sha256) || !Number.isInteger(entry.mode)) {
      throw new Error('user plugin archive profile file metadata is invalid')
    }
  }
  if (entry.kind === 'symlink') {
    if (typeof entry.target !== 'string' || !Number.isInteger(entry.mode)) {
      throw new Error('user plugin archive profile link metadata is invalid')
    }
  }
  return Object.freeze({ ...entry, id, relativePath })
}

function assertInventory(inventory) {
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) {
    throw new Error('user plugin archive inventory is invalid')
  }
  if (typeof inventory.present !== 'boolean' || !Array.isArray(inventory.entries)) {
    throw new Error('user plugin archive inventory is invalid')
  }
  if (!Number.isInteger(inventory.fileCount) || inventory.fileCount < 0 || !Number.isInteger(inventory.totalBytes) || inventory.totalBytes < 0) {
    throw new Error('user plugin archive inventory totals are invalid')
  }
  let files = 0
  let bytes = 0
  let previous = undefined
  const seen = new Set()
  for (const entry of inventory.entries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('user plugin archive inventory entry is invalid')
    }
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.includes('\0') || entry.path.split('/').some((segment) => segment === '..')) {
      throw new Error('user plugin archive inventory path is invalid')
    }
    if (seen.has(entry.path)) throw new Error('user plugin archive inventory has duplicate paths')
    seen.add(entry.path)
    const sortKey = `${entry.path}\0${entry.kind}`
    if (previous !== undefined && previous > sortKey) throw new Error('user plugin archive inventory is not deterministic')
    previous = sortKey
    if (!['directory', 'file', 'symlink'].includes(entry.kind) || !Number.isInteger(entry.mode)) {
      throw new Error('user plugin archive inventory entry is invalid')
    }
    if (entry.kind === 'file') {
      if (!Number.isInteger(entry.size) || entry.size < 0 || !SHA256_PATTERN.test(entry.sha256)) {
        throw new Error('user plugin archive inventory file is invalid')
      }
      files += 1
      bytes += entry.size
    }
    if (entry.kind === 'symlink' && typeof entry.target !== 'string') {
      throw new Error('user plugin archive inventory link is invalid')
    }
  }
  if (files !== inventory.fileCount || bytes !== inventory.totalBytes) {
    throw new Error('user plugin archive inventory totals do not match entries')
  }
  if (inventory.present === false && inventory.entries.length !== 0) {
    throw new Error('absent user plugin archive inventory cannot contain entries')
  }
  if (inventory.present === true && inventory.entries.length === 0) {
    throw new Error('present user plugin archive inventory cannot be empty')
  }
  return immutable({
    present: inventory.present,
    entries: inventory.entries,
    fileCount: inventory.fileCount,
    totalBytes: inventory.totalBytes,
  })
}

function assertSnapshotMetadata(value, snapshotId) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('user plugin archive snapshot metadata is invalid')
  }
  if (value.schemaVersion !== USER_PLUGIN_ARCHIVE_SCHEMA_VERSION || value.snapshotId !== snapshotId || !Array.isArray(value.profileArtifacts)) {
    throw new Error('user plugin archive snapshot metadata is invalid')
  }
  if (value.nodeModules === null || typeof value.nodeModules !== 'object' || Array.isArray(value.nodeModules)) {
    throw new Error('user plugin archive node_modules metadata is invalid')
  }
  const profileArtifacts = value.profileArtifacts.map(assertArchiveEntry)
  if (new Set(profileArtifacts.map((entry) => entry.id)).size !== profileArtifacts.length) {
    throw new Error('user plugin archive snapshot has duplicate profile artifact ids')
  }
  if (new Set(profileArtifacts.map((entry) => entry.relativePath)).size !== profileArtifacts.length) {
    throw new Error('user plugin archive snapshot has duplicate profile artifact paths')
  }
  const nodeModules = value.nodeModules
  if (typeof nodeModules.present !== 'boolean' || !['none', 'moved', 'copied'].includes(nodeModules.storage)) {
    throw new Error('user plugin archive node_modules metadata is invalid')
  }
  if (!nodeModules.present && nodeModules.storage !== 'none') {
    throw new Error('absent node_modules archive has invalid storage metadata')
  }
  if (nodeModules.present && nodeModules.storage === 'none') {
    throw new Error('present node_modules archive has invalid storage metadata')
  }
  return immutable({
    schemaVersion: value.schemaVersion,
    snapshotId: value.snapshotId,
    createdAt: value.createdAt,
    profileArtifacts,
    nodeModules: { present: nodeModules.present, storage: nodeModules.storage },
  })
}

function assertJournal(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('user plugin archive journal is invalid')
  }
  if (
    value.schemaVersion !== USER_PLUGIN_ARCHIVE_SCHEMA_VERSION
    || !ID_PATTERN.test(value.transactionId)
    || !ID_PATTERN.test(value.snapshotId)
    || !PHASES.has(value.phase)
    || typeof value.operation !== 'string'
    || value.operation.length === 0
    || value.operation.length > 160
  ) {
    throw new Error('user plugin archive journal is invalid')
  }
  const affectedExternalFiles = value.affectedExternalFiles ?? []
  if (!Array.isArray(affectedExternalFiles) || affectedExternalFiles.length > 4_096) {
    throw new Error('user plugin archive external repair metadata is invalid')
  }
  const seenExternalFiles = new Set()
  const normalizedExternalFiles = affectedExternalFiles.map((entry) => {
    if (
      entry === null
      || typeof entry !== 'object'
      || Array.isArray(entry)
      || !ID_PATTERN.test(entry.rootId)
      || typeof entry.relativePath !== 'string'
      || entry.relativePath.length === 0
      || entry.relativePath.length > 320
      || entry.relativePath.includes('\\')
      || entry.relativePath.includes('\0')
      || isAbsolute(entry.relativePath)
      || entry.relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')
      || (entry.beforeSha256 !== null && !SHA256_PATTERN.test(entry.beforeSha256))
      || (entry.candidateSha256 !== null && !SHA256_PATTERN.test(entry.candidateSha256))
    ) {
      throw new Error('user plugin archive external repair metadata is invalid')
    }
    const key = `${entry.rootId}\0${entry.relativePath}`
    if (seenExternalFiles.has(key)) throw new Error('user plugin archive external repair metadata is duplicated')
    seenExternalFiles.add(key)
    return {
      rootId: entry.rootId,
      relativePath: entry.relativePath,
      beforeSha256: entry.beforeSha256,
      candidateSha256: entry.candidateSha256,
    }
  })
  return immutable({
    schemaVersion: value.schemaVersion,
    transactionId: value.transactionId,
    snapshotId: value.snapshotId,
    operation: value.operation,
    phase: value.phase,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    affectedExternalFiles: normalizedExternalFiles,
  })
}

function makeTransactionId() {
  return `${Date.now()}-${randomUUID()}`
}

export class UserPluginArchiveTransaction {
  #archive

  constructor(archive, journal) {
    this.#archive = archive
    this.transactionId = journal.transactionId
    this.snapshotId = journal.snapshotId
    this.operation = journal.operation
    Object.freeze(this)
  }

  /** Record that the caller is about to mutate or has mutated the profile. */
  async markApplied() {
    return this.#archive._markApplied(this.transactionId)
  }

  /** Finish a successful mutation after markApplied().  The archive remains available. */
  async commit() {
    return this.#archive._commit(this.transactionId)
  }

  /** Restore exact archived profile inputs and node_modules bytes/tree. */
  async rollback() {
    return this.#archive._rollback(this.transactionId)
  }

  /** Retain path-free hashes for external plugin files affected by repair. */
  async recordAffectedExternalFiles(entries) {
    return this.#archive._recordAffectedExternalFiles(this.transactionId, entries)
  }
}

export class UserPluginArchive {
  constructor({ profileDir, archiveDir, profileArtifacts = USER_PLUGIN_ARCHIVE_PROFILE_ARTIFACTS } = {}) {
    assertNonEmptyString(profileDir, 'profileDir')
    this.profileDir = resolve(profileDir)
    this.nodeModulesPath = join(this.profileDir, NODE_MODULES_DIRECTORY)
    this.archiveDir = resolve(archiveDir ?? join(this.profileDir, '.dsh-desktop-user-plugin-archive'))
    if (this.archiveDir === this.profileDir || pathsOverlap(this.archiveDir, this.nodeModulesPath)) {
      throw new TypeError('archiveDir must not overlap profileDir/node_modules')
    }
    if (isSameOrDescendant(this.profileDir, this.archiveDir)) {
      throw new TypeError('archiveDir must not be a parent of profileDir')
    }
    this.profileArtifacts = normalizeProfileArtifacts(profileArtifacts)
    this.snapshotsDir = join(this.archiveDir, SNAPSHOTS_DIRECTORY)
    this.journalDir = join(this.archiveDir, JOURNAL_DIRECTORY)
    this.activeJournalPath = join(this.journalDir, ACTIVE_JOURNAL_FILE)
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  #snapshotDir(snapshotId) {
    return join(this.snapshotsDir, assertSafeId(snapshotId, 'snapshotId'))
  }

  #journalPath(transactionId) {
    return join(this.journalDir, `${assertSafeId(transactionId, 'transactionId')}.json`)
  }

  async #ensureArchiveLayout() {
    await mkdir(this.profileDir, { recursive: true })
    const profileStat = await lstat(this.profileDir)
    if (!profileStat.isDirectory() || profileStat.isSymbolicLink()) {
      throw new Error('profileDir must be a real directory before archiving plugins')
    }
    await mkdir(this.archiveDir, { recursive: true })
    const archiveStat = await lstat(this.archiveDir)
    if (!archiveStat.isDirectory() || archiveStat.isSymbolicLink()) {
      throw new Error('archiveDir must be a real directory')
    }
    await mkdir(this.snapshotsDir, { recursive: true })
    await mkdir(this.journalDir, { recursive: true })
  }

  async #writeJournal(journal) {
    const validated = assertJournal(journal)
    const path = this.#journalPath(validated.transactionId)
    await replaceLeafAtomically(path, (temporary) => writeDurableFile(temporary, stableJson(validated), { flag: 'wx' }))
    return validated
  }

  async #readJournal(transactionId) {
    const source = await readTextIfPresent(this.#journalPath(transactionId))
    if (source === undefined) throw new Error('user plugin archive journal is missing')
    try {
      return assertJournal(JSON.parse(source))
    } catch (error) {
      throw new Error('user plugin archive journal is unreadable', { cause: error })
    }
  }

  async #writeActiveJournal(transactionId) {
    const value = {
      schemaVersion: USER_PLUGIN_ARCHIVE_SCHEMA_VERSION,
      transactionId: assertSafeId(transactionId, 'transactionId'),
    }
    await replaceLeafAtomically(this.activeJournalPath, (temporary) => writeDurableFile(temporary, stableJson(value), { flag: 'wx' }))
  }

  async #clearActiveJournal(transactionId) {
    const source = await readTextIfPresent(this.activeJournalPath)
    if (source === undefined) return
    let marker
    try {
      marker = JSON.parse(source)
    } catch (error) {
      throw new Error('user plugin archive active journal marker is unreadable', { cause: error })
    }
    if (
      marker?.schemaVersion !== USER_PLUGIN_ARCHIVE_SCHEMA_VERSION
      || !ID_PATTERN.test(marker.transactionId)
    ) {
      throw new Error('user plugin archive active journal marker is invalid')
    }
    if (marker.transactionId !== transactionId) {
      throw new Error('another user plugin archive transaction is active')
    }
    await rm(this.activeJournalPath, { force: true })
    await syncDirectory(this.journalDir)
  }

  async #readActiveJournal() {
    const source = await readTextIfPresent(this.activeJournalPath)
    if (source === undefined) return undefined
    let marker
    try {
      marker = JSON.parse(source)
    } catch (error) {
      throw new Error('user plugin archive active journal marker is unreadable', { cause: error })
    }
    if (marker?.schemaVersion !== USER_PLUGIN_ARCHIVE_SCHEMA_VERSION || !ID_PATTERN.test(marker.transactionId)) {
      throw new Error('user plugin archive active journal marker is invalid')
    }
    return this.#readJournal(marker.transactionId)
  }

  async #readSnapshot(snapshotId) {
    const directory = this.#snapshotDir(snapshotId)
    const source = await readTextIfPresent(join(directory, METADATA_FILE))
    if (source === undefined) throw new Error('user plugin archive snapshot is incomplete')
    let metadata
    try {
      metadata = assertSnapshotMetadata(JSON.parse(source), snapshotId)
    } catch (error) {
      throw new Error('user plugin archive snapshot metadata is unreadable', { cause: error })
    }
    const inventorySource = await readTextIfPresent(join(directory, INVENTORY_FILE))
    if (inventorySource === undefined) throw new Error('user plugin archive inventory is missing')
    let inventory
    try {
      inventory = assertInventory(JSON.parse(inventorySource))
    } catch (error) {
      throw new Error('user plugin archive inventory is unreadable', { cause: error })
    }
    if (inventory.present !== metadata.nodeModules.present) {
      throw new Error('user plugin archive snapshot node_modules state disagrees with inventory')
    }
    return immutable({ directory, metadata, inventory })
  }

  async #verifySnapshot(snapshot) {
    for (const entry of snapshot.metadata.profileArtifacts) {
      if (entry.kind !== 'file') continue
      const bytes = await readFile(profileArtifactArchivePath(snapshot.directory, entry.id))
      if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
        throw new Error(`user plugin archive profile artifact integrity check failed: ${entry.relativePath}`)
      }
    }
    const archivedNodeModules = join(snapshot.directory, NODE_MODULES_DIRECTORY)
    if (snapshot.inventory.present) {
      if (!await pathPresent(archivedNodeModules)) {
        throw new Error('user plugin archive node_modules tree is missing')
      }
      const actual = await inventoryUserPluginTree(archivedNodeModules)
      if (!inventoriesEqual(actual, snapshot.inventory)) {
        throw new Error('user plugin archive node_modules integrity check failed')
      }
    } else if (await pathPresent(archivedNodeModules)) {
      throw new Error('user plugin archive has an unexpected node_modules tree')
    }
  }

  async #captureSnapshot(journal, nodeModulesTransfer) {
    const directory = this.#snapshotDir(journal.snapshotId)
    if (await pathPresent(directory)) throw new Error('user plugin archive snapshot id already exists')
    await mkdir(directory, { recursive: false })
    await mkdir(join(directory, PROFILE_FILES_DIRECTORY), { recursive: false })
    const profileArtifacts = await captureProfileArtifacts(this.profileDir, directory, this.profileArtifacts)

    const archivedNodeModules = join(directory, NODE_MODULES_DIRECTORY)
    const nodeModulesStat = await lstatIfPresent(this.nodeModulesPath)
    let storage = 'none'
    let inventory = immutable({ present: false, entries: [], fileCount: 0, totalBytes: 0 })
    if (nodeModulesStat !== undefined) {
      if (nodeModulesTransfer === 'copy') {
        await copyTreeWithoutFollowingLinks(this.nodeModulesPath, archivedNodeModules)
        storage = 'copied'
      } else {
        try {
          await rename(this.nodeModulesPath, archivedNodeModules)
          storage = 'moved'
        } catch (error) {
          // EXDEV means a caller intentionally chose an archive on another
          // volume.  Windows can also reject a rename while a scanner or a
          // just-stopped Runtime still holds a directory handle.  In those
          // cases copying into a fresh, verified archive is safe because the
          // original tree remains untouched until the caller's later action.
          if (nodeModulesTransfer !== 'auto' || !SAFE_COPY_FALLBACK_CODES.has(error?.code)) throw error
          await copyTreeWithoutFollowingLinks(this.nodeModulesPath, archivedNodeModules)
          storage = 'copied'
        }
      }
      inventory = await inventoryUserPluginTree(archivedNodeModules)
      if (!inventory.present) throw new Error('user plugin archive node_modules tree disappeared during capture')
    }

    const metadata = {
      schemaVersion: USER_PLUGIN_ARCHIVE_SCHEMA_VERSION,
      snapshotId: journal.snapshotId,
      createdAt: new Date().toISOString(),
      profileArtifacts,
      nodeModules: {
        present: inventory.present,
        storage,
      },
    }
    await writeDurableFile(join(directory, INVENTORY_FILE), stableJson(inventory), { flag: 'wx' })
    await writeDurableFile(join(directory, METADATA_FILE), stableJson(metadata), { flag: 'wx' })
    await syncDirectory(directory)
    return this.#readSnapshot(journal.snapshotId)
  }

  async #restoreIntentNodeModules(journal) {
    const snapshotDirectory = this.#snapshotDir(journal.snapshotId)
    const archived = join(snapshotDirectory, NODE_MODULES_DIRECTORY)
    const sourcePresent = await pathPresent(this.nodeModulesPath)
    const archivedPresent = await pathPresent(archived)
    if (!sourcePresent && archivedPresent) {
      // A tree can be absent only after the same-volume rename path.  Never
      // turn this recovery into a copy/delete fallback; if it cannot atomically
      // move back, retain the archive and require an explicit repair.
      await rename(archived, this.nodeModulesPath)
    }
  }

  async #writePhase(journal, phase) {
    const next = {
      ...journal,
      phase,
      updatedAt: new Date().toISOString(),
    }
    const written = await this.#writeJournal(next)
    if (phase === 'committed' || phase === 'rolled-back') {
      await this.#clearActiveJournal(written.transactionId)
    }
    return written
  }

  async #begin({ operation = 'profile-mutation', nodeModulesTransfer = 'auto' } = {}) {
    assertNonEmptyString(operation, 'operation')
    if (!['auto', 'move', 'copy'].includes(nodeModulesTransfer)) {
      throw new TypeError('nodeModulesTransfer must be auto, move, or copy')
    }
    await this.#ensureArchiveLayout()
    const active = await this.#readActiveJournal()
    if (active !== undefined) {
      throw new Error(`user plugin archive transaction is already active: ${active.transactionId}`)
    }

    const transactionId = makeTransactionId()
    const journal = immutable({
      schemaVersion: USER_PLUGIN_ARCHIVE_SCHEMA_VERSION,
      transactionId,
      snapshotId: transactionId,
      operation,
      phase: 'intent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      affectedExternalFiles: [],
    })
    await this.#writeJournal(journal)
    await this.#writeActiveJournal(transactionId)
    try {
      await this.#captureSnapshot(journal, nodeModulesTransfer)
      const archived = await this.#writePhase(journal, 'archived')
      return new UserPluginArchiveTransaction(this, archived)
    } catch (error) {
      let recoveryError
      try {
        await this.#restoreIntentNodeModules(journal)
        await this.#writePhase(journal, 'rolled-back')
      } catch (recovery) {
        recoveryError = recovery
      }
      if (recoveryError !== undefined) {
        throw new Error('user plugin archive capture failed and automatic recovery also failed', {
          cause: new AggregateError([error, recoveryError]),
        })
      }
      throw error
    }
  }

  async #replaceNodeModules(snapshot, transactionId) {
    const target = this.nodeModulesPath
    const staged = temporaryPath(join(this.profileDir, '.dsh-desktop-user-plugin-restore'), transactionId)
    const displaced = temporaryPath(join(this.profileDir, '.dsh-desktop-user-plugin-displaced'), transactionId)
    const archived = join(snapshot.directory, NODE_MODULES_DIRECTORY)
    let targetMoved = false
    let stagedMoved = false
    try {
      if (snapshot.inventory.present) {
        await copyTreeWithoutFollowingLinks(archived, staged)
        const stagedInventory = await inventoryUserPluginTree(staged)
        if (!inventoriesEqual(stagedInventory, snapshot.inventory)) {
          throw new Error('staged user plugin archive restore integrity check failed')
        }
      }
      if (await pathPresent(target)) {
        await rename(target, displaced)
        targetMoved = true
      }
      if (snapshot.inventory.present) {
        await rename(staged, target)
        stagedMoved = true
      }
      return Object.freeze({ target, staged, displaced, targetMoved, stagedMoved })
    } catch (error) {
      await rm(staged, { recursive: true, force: true }).catch(() => {})
      if (targetMoved) {
        if (stagedMoved && await pathPresent(target)) {
          await rm(target, { recursive: true, force: true }).catch(() => {})
        }
        await rename(displaced, target).catch(() => {})
      }
      throw error
    }
  }

  async #undoNodeModulesReplacement(result) {
    if (result.stagedMoved && await pathPresent(result.target)) {
      await rm(result.target, { recursive: true, force: true })
    }
    if (result.targetMoved && await pathPresent(result.displaced)) {
      await rename(result.displaced, result.target)
    }
    await rm(result.staged, { recursive: true, force: true }).catch(() => {})
  }

  async #finalizeNodeModulesReplacement(result) {
    if (result.targetMoved && await pathPresent(result.displaced)) {
      await rm(result.displaced, { recursive: true, force: true })
    }
    await rm(result.staged, { recursive: true, force: true }).catch(() => {})
  }

  async #restoreProfileArtifacts(snapshot) {
    for (const entry of snapshot.metadata.profileArtifacts) {
      const target = join(this.profileDir, entry.relativePath)
      if (entry.kind === 'absent') {
        await removeLeaf(target)
        continue
      }
      if (entry.kind === 'symlink') {
        await writeLinkAtomically(target, entry.target)
        continue
      }
      const bytes = await readFile(profileArtifactArchivePath(snapshot.directory, entry.id))
      if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
        throw new Error(`user plugin archive profile artifact integrity check failed: ${entry.relativePath}`)
      }
      await writeLeafAtomically(target, bytes, entry.mode)
    }
  }

  async #restoreCapturedProfileArtifacts(entries) {
    for (const entry of entries) {
      const target = join(this.profileDir, entry.relativePath)
      if (entry.kind === 'absent') {
        await removeLeaf(target)
      } else if (entry.kind === 'symlink') {
        await writeLinkAtomically(target, entry.target)
      } else if (entry.kind === 'file') {
        await writeLeafAtomically(target, entry.bytes, entry.mode)
      } else {
        throw new Error('pre-restore profile artifact state is invalid')
      }
    }
  }

  async #restoreSnapshot(snapshot, transactionId) {
    await this.#verifySnapshot(snapshot)
    const before = await captureCurrentProfileArtifacts(this.profileDir, snapshot.metadata.profileArtifacts)
    let nodes
    try {
      nodes = await this.#replaceNodeModules(snapshot, transactionId)
      await this.#restoreProfileArtifacts(snapshot)
      await this.#finalizeNodeModulesReplacement(nodes)
    } catch (error) {
      if (nodes !== undefined) await this.#undoNodeModulesReplacement(nodes).catch(() => {})
      await this.#restoreCapturedProfileArtifacts(before).catch(() => {})
      throw error
    }
  }

  async #rollback(transactionId) {
    const journal = await this.#readActiveJournal()
    if (journal === undefined || journal.transactionId !== transactionId) {
      throw new Error('user plugin archive transaction is not active')
    }
    if (!['intent', 'archived', 'applied'].includes(journal.phase)) {
      throw new Error(`user plugin archive transaction cannot roll back from ${journal.phase}`)
    }
    if (journal.phase === 'intent') {
      await this.#restoreIntentNodeModules(journal)
    } else {
      const snapshot = await this.#readSnapshot(journal.snapshotId)
      await this.#restoreSnapshot(snapshot, journal.transactionId)
    }
    await this.#writePhase(journal, 'rolled-back')
    return immutable({ transactionId: journal.transactionId, snapshotId: journal.snapshotId, phase: 'rolled-back' })
  }

  async #recover() {
    await this.#ensureArchiveLayout()
    const journal = await this.#readActiveJournal()
    if (journal === undefined) return immutable({ recovered: false })
    if (journal.phase === 'committed' || journal.phase === 'rolled-back') {
      await this.#clearActiveJournal(journal.transactionId)
      return immutable({ recovered: false, transactionId: journal.transactionId, phase: journal.phase })
    }
    await this.#rollback(journal.transactionId)
    return immutable({ recovered: true, transactionId: journal.transactionId, snapshotId: journal.snapshotId })
  }

  /**
   * Capture before a caller mutates profileDir.  The returned transaction must
   * be marked applied before commit; rollback is always available on failure.
   * `nodeModulesTransfer: 'copy'` is a safe fallback for an archive located on
   * another filesystem, and is useful for callers which must retain a live
   * node_modules tree until their own mutation begins.
   */
  begin(options) {
    return this.#enqueue(() => this.#begin(options))
  }

  /** Return whether an interrupted archive transaction needs recovery. */
  getState() {
    return this.#enqueue(async () => {
      await this.#ensureArchiveLayout()
      const active = await this.#readActiveJournal()
      return immutable({
        active: active === undefined ? undefined : {
          transactionId: active.transactionId,
          snapshotId: active.snapshotId,
          operation: active.operation,
          phase: active.phase,
          affectedExternalFiles: active.affectedExternalFiles,
        },
      })
    })
  }

  /** Recover an interrupted intent/archived/applied transaction to its snapshot. */
  recover() {
    return this.#enqueue(() => this.#recover())
  }

  /**
   * Restore a retained, committed snapshot.  The current tree is itself
   * archived first, so an interrupted historical restore can be recovered in
   * the same way as any other profile mutation.
   */
  restore(snapshotId) {
    return this.#enqueue(async () => {
      assertSafeId(snapshotId, 'snapshotId')
      await this.#ensureArchiveLayout()
      const source = await this.#readSnapshot(snapshotId)
      await this.#verifySnapshot(source)
      const transaction = await this.#begin({ operation: `restore-${snapshotId}` })
      try {
        await this.#restoreSnapshot(source, transaction.transactionId)
        await this.#writePhase(await this.#readActiveJournal(), 'applied')
        const committed = await this.#writePhase(await this.#readJournal(transaction.transactionId), 'committed')
        return immutable({
          transactionId: committed.transactionId,
          snapshotId,
          phase: committed.phase,
        })
      } catch (error) {
        await this.#rollback(transaction.transactionId).catch(() => {})
        throw error
      }
    })
  }

  /** Read private metadata for a specific snapshot without parsing plugin code. */
  inspect(snapshotId) {
    return this.#enqueue(async () => {
      await this.#ensureArchiveLayout()
      const snapshot = await this.#readSnapshot(snapshotId)
      return immutable({
        snapshotId: snapshot.metadata.snapshotId,
        createdAt: snapshot.metadata.createdAt,
        profileArtifacts: snapshot.metadata.profileArtifacts,
        nodeModules: {
          ...snapshot.metadata.nodeModules,
          inventory: snapshot.inventory,
        },
      })
    })
  }

  /** List retained snapshots without exposing their archived content. */
  listSnapshots() {
    return this.#enqueue(async () => {
      await this.#ensureArchiveLayout()
      const directories = (await readdir(this.snapshotsDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort()
      const snapshots = []
      for (const snapshotId of directories) {
        const snapshot = await this.#readSnapshot(snapshotId)
        snapshots.push({
          snapshotId: snapshot.metadata.snapshotId,
          createdAt: snapshot.metadata.createdAt,
          nodeModulesPresent: snapshot.metadata.nodeModules.present,
          profileArtifactCount: snapshot.metadata.profileArtifacts.length,
        })
      }
      return immutable(snapshots)
    })
  }

  // Transaction methods intentionally remain main-process/internal APIs.  A
  // renderer never receives a transaction id that it can use to choose paths.
  _markApplied(transactionId) {
    return this.#enqueue(async () => {
      const journal = await this.#readActiveJournal()
      if (journal === undefined || journal.transactionId !== transactionId) {
        throw new Error('user plugin archive transaction is not active')
      }
      if (journal.phase !== 'archived') {
        throw new Error(`user plugin archive transaction cannot mark applied from ${journal.phase}`)
      }
      const applied = await this.#writePhase(journal, 'applied')
      return immutable({ transactionId: applied.transactionId, snapshotId: applied.snapshotId, phase: applied.phase })
    })
  }

  _recordAffectedExternalFiles(transactionId, entries) {
    return this.#enqueue(async () => {
      const journal = await this.#readActiveJournal()
      if (journal === undefined || journal.transactionId !== transactionId) {
        throw new Error('user plugin archive transaction is not active')
      }
      if (journal.phase !== 'archived') {
        throw new Error(`user plugin archive transaction cannot record repair metadata from ${journal.phase}`)
      }
      const written = await this.#writeJournal({ ...journal, affectedExternalFiles: entries })
      return immutable({
        transactionId: written.transactionId,
        snapshotId: written.snapshotId,
        affectedExternalFiles: written.affectedExternalFiles,
      })
    })
  }

  _commit(transactionId) {
    return this.#enqueue(async () => {
      const journal = await this.#readActiveJournal()
      if (journal === undefined || journal.transactionId !== transactionId) {
        throw new Error('user plugin archive transaction is not active')
      }
      if (journal.phase !== 'applied') {
        throw new Error(`user plugin archive transaction cannot commit from ${journal.phase}`)
      }
      const committed = await this.#writePhase(journal, 'committed')
      return immutable({ transactionId: committed.transactionId, snapshotId: committed.snapshotId, phase: committed.phase })
    })
  }

  _rollback(transactionId) {
    return this.#enqueue(() => this.#rollback(transactionId))
  }
}
