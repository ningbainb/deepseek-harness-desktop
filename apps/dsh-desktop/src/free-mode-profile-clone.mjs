import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Profile entries that are meaningful to a DSH Runtime session.  The clone is
 * intentionally profile-scoped: it never walks a project workspace, and it
 * never follows a link merely because a user plugin happens to point at one.
 */
export const FREE_MODE_PROFILE_CLONE_SCHEMA_VERSION = 1
export const FREE_MODE_PROFILE_CLONE_FILE_ENTRIES = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'cordis.patch.yml',
  'cordis.yml',
  'pnpm-workspace.yaml',
  '.dsh-desktop-links.json',
  'desktop-plugins.lock.json',
])
export const FREE_MODE_PROFILE_CLONE_DIRECTORY_ENTRIES = Object.freeze([
  'node_modules',
  'state',
])
// A legacy/user-authored loader patch can live one level above the Desktop
// Profile. It is still a fixed, single file; cloning it never walks the rest
// of DSH_HOME or a user workspace.
export const FREE_MODE_HOME_PATCH_ENTRY = 'cordis.patch.yml'

/**
 * Agent state is deliberately a much smaller boundary than a whole DSH home.
 * It makes locally authored Agent presets usable in Free Mode without copying
 * workspaces, arbitrary caches, or a second profile tree into the session.
 *
 * `settings.yaml`, `.credentials.yaml`, and `.env` can contain credentials.
 * They are copied only after the same native Free Mode confirmation as the
 * rest of the session preparation, and every public result below exposes
 * fingerprints and fixed entry identifiers only--never their bytes.
 */
export const FREE_MODE_AGENT_CONFIG_CLONE_SCHEMA_VERSION = 1
export const FREE_MODE_AGENT_CONFIG_FILE_ENTRIES = Object.freeze([
  'settings.yaml',
  '.credentials.yaml',
  '.env',
])
export const FREE_MODE_AGENT_CONFIG_DIRECTORY_ENTRIES = Object.freeze([
  '.agent-presets',
  // User-authored Agent presets commonly depend on these DSH-local skills.
  // They remain bounded and link-free just like `.agent-presets`.
  'skills',
])
export const FREE_MODE_AGENT_CONFIG_MAX_FILES = 512
export const FREE_MODE_AGENT_CONFIG_MAX_DIRECTORIES = 128
export const FREE_MODE_AGENT_CONFIG_MAX_BYTES = 32 * 1024 * 1024
export const FREE_MODE_AGENT_CONFIG_MAX_DEPTH = 16

const CLONE_ENTRY_NAMES = Object.freeze([
  ...FREE_MODE_PROFILE_CLONE_FILE_ENTRIES,
  ...FREE_MODE_PROFILE_CLONE_DIRECTORY_ENTRIES,
])
const CLONE_ENTRY_NAME_SET = new Set(CLONE_ENTRY_NAMES)
const AGENT_CONFIG_ENTRY_NAMES = Object.freeze([
  ...FREE_MODE_AGENT_CONFIG_FILE_ENTRIES,
  ...FREE_MODE_AGENT_CONFIG_DIRECTORY_ENTRIES,
])
const AGENT_CONFIG_ENTRY_NAME_SET = new Set(AGENT_CONFIG_ENTRY_NAMES)
const AGENT_CONFIG_FILE_ENTRY_SET = new Set(FREE_MODE_AGENT_CONFIG_FILE_ENTRIES)
const AGENT_CONFIG_DIRECTORY_ENTRY_SET = new Set(FREE_MODE_AGENT_CONFIG_DIRECTORY_ENTRIES)
const DEFAULT_FS = Object.freeze({ copyFile, lstat, mkdir, readFile, readdir, readlink, rename, rm, stat, symlink, writeFile })

export class FreeModeProfileCloneError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'FreeModeProfileCloneError'
    this.code = code
  }
}

function cloneError(code, message, cause) {
  return new FreeModeProfileCloneError(code, message, cause === undefined ? {} : { cause })
}

function assertAbsoluteDirectory(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path`)
  }
  return resolve(value)
}

function assertFs(value) {
  if (!value || typeof value !== 'object') throw new TypeError('free-mode profile clone requires file operations')
  for (const name of ['copyFile', 'lstat', 'mkdir', 'readFile', 'readdir', 'readlink', 'rename', 'rm', 'stat', 'symlink', 'writeFile']) {
    if (typeof value[name] !== 'function') throw new TypeError('free-mode profile clone requires file operations')
  }
  return value
}

function assertIdFactory(value) {
  if (typeof value !== 'function') throw new TypeError('free-mode profile clone ID factory must be a function')
  return value
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 fingerprint`)
  }
  return value
}

function isInside(parent, candidate) {
  const remainder = relative(parent, candidate)
  return remainder === '' || (!remainder.startsWith(`..${sep}`) && remainder !== '..' && !isAbsolute(remainder))
}

function assertDistinctRoots(source, target) {
  if (isInside(source, target) || isInside(target, source)) {
    throw cloneError(
      'free-mode-profile-clone-path-overlap',
      'the isolated free-mode profile must not overlap its original profile',
    )
  }
}

function hashField(hash, value) {
  const bytes = Buffer.from(String(value), 'utf8')
  hash.update(String(bytes.length))
  hash.update(':')
  hash.update(bytes)
  hash.update(';')
}

async function readEntryMetadata(fs, path, { missingIsUndefined = false } = {}) {
  try {
    return await fs.lstat(path)
  } catch (error) {
    if (missingIsUndefined && error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function assertRealDirectory(fs, path, {
  missingCode,
  invalidCode = 'free-mode-profile-clone-invalid-directory',
  label,
}) {
  let metadata
  try {
    metadata = await fs.lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT' && missingCode !== undefined) {
      throw cloneError(missingCode, `${label} is not available`, error)
    }
    throw error
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw cloneError(invalidCode, `${label} must be a real directory`)
  }
}

/**
 * Hash a profile entry without following symlinks.  A linked workspace is
 * represented by its link text, not recursively read or copied as a tree.
 */
async function fingerprintPath(fs, path, name, hash, stats) {
  const metadata = await fs.lstat(path)
  if (metadata.isSymbolicLink()) {
    hashField(hash, 'link')
    hashField(hash, name)
    hashField(hash, await fs.readlink(path))
    stats.links += 1
    return
  }
  if (metadata.isDirectory()) {
    hashField(hash, 'directory')
    hashField(hash, name)
    stats.directories += 1
    const entries = await fs.readdir(path, { withFileTypes: true })
    const sorted = [...entries].toSorted((left, right) => left.name.localeCompare(right.name))
    for (const entry of sorted) {
      // `readdir` names cannot escape this directory.  No caller-provided
      // path segment reaches this recursion.
      await fingerprintPath(fs, join(path, entry.name), `${name}/${entry.name}`, hash, stats)
    }
    return
  }
  if (!metadata.isFile()) {
    throw cloneError('free-mode-profile-clone-unsupported-entry', 'the selected profile contains an unsupported filesystem entry')
  }
  const content = await fs.readFile(path)
  hashField(hash, 'file')
  hashField(hash, name)
  hashField(hash, content.length)
  hash.update(content)
  stats.files += 1
  stats.bytes += content.length
}

async function inspectSelection(fs, profileDir) {
  const hash = createHash('sha256')
  hash.update('dsh-free-mode-profile-clone-v1;')
  const stats = { files: 0, directories: 0, links: 0, bytes: 0 }
  const entries = []
  for (const name of CLONE_ENTRY_NAMES) {
    const path = join(profileDir, name)
    const metadata = await readEntryMetadata(fs, path, { missingIsUndefined: true })
    if (metadata === undefined) {
      hashField(hash, 'missing')
      hashField(hash, name)
      entries.push(Object.freeze({ id: name, present: false }))
      continue
    }
    await fingerprintPath(fs, path, name, hash, stats)
    entries.push(Object.freeze({
      id: name,
      present: true,
      kind: metadata.isSymbolicLink() ? 'link' : metadata.isDirectory() ? 'directory' : 'file',
    }))
  }
  return Object.freeze({
    schemaVersion: FREE_MODE_PROFILE_CLONE_SCHEMA_VERSION,
    digest: `sha256:${hash.digest('hex')}`,
    entries: Object.freeze(entries),
    files: stats.files,
    directories: stats.directories,
    links: stats.links,
    bytes: stats.bytes,
  })
}

function publicInspection(value) {
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    available: true,
    digest: value.digest,
    entries: Object.freeze(value.entries.map((entry) => Object.freeze({ ...entry }))),
    files: value.files,
    directories: value.directories,
    links: value.links,
    bytes: value.bytes,
  })
}

function publicHomePatchInspection(value) {
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    available: true,
    digest: value.digest,
    present: value.present,
    ...(value.kind === undefined ? {} : { kind: value.kind }),
  })
}

async function inspectHomePatch(fs, dshHome) {
  const hash = createHash('sha256')
  hash.update('dsh-free-mode-home-patch-v1;')
  const patchPath = join(dshHome, FREE_MODE_HOME_PATCH_ENTRY)
  const metadata = await readEntryMetadata(fs, patchPath, { missingIsUndefined: true })
  if (metadata === undefined) {
    hashField(hash, 'missing')
    hashField(hash, FREE_MODE_HOME_PATCH_ENTRY)
    return Object.freeze({
      schemaVersion: FREE_MODE_PROFILE_CLONE_SCHEMA_VERSION,
      digest: `sha256:${hash.digest('hex')}`,
      present: false,
    })
  }
  if (metadata.isDirectory()) {
    throw cloneError('free-mode-home-patch-unsupported-entry', 'the original Desktop home patch must be a file or link')
  }
  const stats = { files: 0, directories: 0, links: 0, bytes: 0 }
  await fingerprintPath(fs, patchPath, FREE_MODE_HOME_PATCH_ENTRY, hash, stats)
  return Object.freeze({
    schemaVersion: FREE_MODE_PROFILE_CLONE_SCHEMA_VERSION,
    digest: `sha256:${hash.digest('hex')}`,
    present: true,
    kind: metadata.isSymbolicLink() ? 'link' : 'file',
  })
}

async function copyEntry(fs, input, output) {
  const metadata = await fs.lstat(input)
  if (metadata.isSymbolicLink()) {
    const target = await fs.readlink(input)
    let type
    try {
      const targetMetadata = await fs.stat(input)
      type = targetMetadata.isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file'
    } catch (error) {
      // A dangling link cannot be safely represented as a Windows junction;
      // keep the source intact and make the user retry from the recovery
      // shell instead of accidentally following or silently dropping it.
      throw cloneError('free-mode-profile-clone-unreadable-link', 'the original profile contains an unreadable linked plugin', error)
    }
    await fs.symlink(target, output, type)
    return
  }
  if (metadata.isDirectory()) {
    await fs.mkdir(output, { recursive: false, mode: 0o700 })
    const entries = await fs.readdir(input, { withFileTypes: true })
    for (const entry of [...entries].toSorted((left, right) => left.name.localeCompare(right.name))) {
      await copyEntry(fs, join(input, entry.name), join(output, entry.name))
    }
    return
  }
  if (!metadata.isFile()) {
    throw cloneError('free-mode-profile-clone-unsupported-entry', 'the selected profile contains an unsupported filesystem entry')
  }
  await fs.copyFile(input, output, 0)
}

async function copySelection(fs, source, stage) {
  for (const name of CLONE_ENTRY_NAMES) {
    const input = join(source, name)
    if (await readEntryMetadata(fs, input, { missingIsUndefined: true }) === undefined) continue
    const output = join(stage, name)
    await copyEntry(fs, input, output)
  }
}

async function removeBestEffort(fs, path) {
  await fs.rm(path, { recursive: true, force: true }).catch(() => {})
}

/**
 * Read a privacy-safe summary of the data that would be brought into a full
 * user free-mode session.  It contains no paths, package names, contents, or
 * project/workspace data.
 */
export async function inspectFreeModeProfileClone({ sourceProfileDir, fs = DEFAULT_FS } = {}) {
  const source = assertAbsoluteDirectory(sourceProfileDir, 'free-mode source profile directory')
  const fileSystem = assertFs(fs)
  try {
    await assertRealDirectory(fileSystem, source, {
      missingCode: 'free-mode-profile-clone-source-missing',
      label: 'the selected original profile',
    })
    return publicInspection(await inspectSelection(fileSystem, source))
  } catch (error) {
    if (error instanceof FreeModeProfileCloneError) throw error
    throw cloneError('free-mode-profile-clone-inspection-failed', 'the selected original profile could not be inspected', error)
  }
}

/**
 * Inspect the one fixed root-level patch that affects the Desktop profile.
 * The result is path-free and can be used as the native-confirmation review
 * fingerprint before copying it to an isolated Free Mode home.
 */
export async function inspectFreeModeHomePatch({ sourceDshHome, fs = DEFAULT_FS } = {}) {
  const source = assertAbsoluteDirectory(sourceDshHome, 'free-mode source DSH home directory')
  const fileSystem = assertFs(fs)
  try {
    await assertRealDirectory(fileSystem, source, {
      missingCode: 'free-mode-home-patch-source-missing',
      label: 'the selected original DSH home',
    })
    return publicHomePatchInspection(await inspectHomePatch(fileSystem, source))
  } catch (error) {
    if (error instanceof FreeModeProfileCloneError) throw error
    throw cloneError('free-mode-home-patch-inspection-failed', 'the original Desktop home patch could not be inspected', error)
  }
}

/**
 * Copy only `DSH_HOME/cordis.patch.yml` to a disposable Free Mode home. The
 * original is checked both before and after staging; the destination receives
 * an atomic replacement, and its prior generated patch is restored if that
 * activation fails. Missing source patches intentionally leave the isolated
 * Runtime's generated default alone.
 */
export async function cloneFreeModeHomePatch({
  sourceDshHome,
  targetDshHome,
  expectedDigest,
  fs = DEFAULT_FS,
  idFactory = randomUUID,
} = {}) {
  const source = assertAbsoluteDirectory(sourceDshHome, 'free-mode source DSH home directory')
  const target = assertAbsoluteDirectory(targetDshHome, 'free-mode target DSH home directory')
  const fileSystem = assertFs(fs)
  const nextId = assertIdFactory(idFactory)
  assertDistinctRoots(source, target)

  const token = String(nextId())
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(token)) {
    throw new TypeError('free-mode home-patch clone ID is invalid')
  }
  const sourcePatch = join(source, FREE_MODE_HOME_PATCH_ENTRY)
  const targetPatch = join(target, FREE_MODE_HOME_PATCH_ENTRY)
  const stage = join(target, `.desktop-free-home-patch-stage-${token}`)
  const backup = join(target, `.desktop-free-home-patch-backup-${token}`)
  try {
    await Promise.all([
      assertRealDirectory(fileSystem, source, {
        missingCode: 'free-mode-home-patch-source-missing',
        label: 'the selected original DSH home',
      }),
      assertRealDirectory(fileSystem, target, {
        missingCode: 'free-mode-home-patch-target-missing',
        label: 'the isolated free-mode DSH home',
      }),
    ])
    const before = await inspectHomePatch(fileSystem, source)
    if (expectedDigest !== undefined && before.digest !== assertDigest(expectedDigest, 'free-mode home-patch expected digest')) {
      throw cloneError('free-mode-home-patch-source-changed', 'the original Desktop home patch changed after you approved the Free Mode copy')
    }
    if (!before.present) {
      return Object.freeze({ ...publicHomePatchInspection(before), cloned: false })
    }
    await copyEntry(fileSystem, sourcePatch, stage)
    const after = await inspectHomePatch(fileSystem, source)
    if (after.digest !== before.digest) {
      throw cloneError('free-mode-home-patch-source-changed', 'the original Desktop home patch changed while its free-mode copy was being prepared')
    }
    // Validate the temporary entry directly with the same no-follow hashing
    // representation used for the source patch.
    const stagedHash = createHash('sha256')
    stagedHash.update('dsh-free-mode-home-patch-v1;')
    const stagedStats = { files: 0, directories: 0, links: 0, bytes: 0 }
    await fingerprintPath(fileSystem, stage, FREE_MODE_HOME_PATCH_ENTRY, stagedHash, stagedStats)
    const stagedDigest = `sha256:${stagedHash.digest('hex')}`
    if (stagedDigest !== before.digest) {
      throw cloneError('free-mode-home-patch-verification-failed', 'the isolated home patch did not preserve the original bytes')
    }

    const targetExists = await readEntryMetadata(fileSystem, targetPatch, { missingIsUndefined: true }) !== undefined
    if (targetExists) await fileSystem.rename(targetPatch, backup)
    let activated = false
    try {
      await fileSystem.rename(stage, targetPatch)
      activated = true
      if (targetExists) await removeBestEffort(fileSystem, backup)
    } catch (error) {
      if (activated) await fileSystem.rename(targetPatch, stage).catch(() => {})
      if (targetExists) await fileSystem.rename(backup, targetPatch).catch(() => {})
      throw error
    }
    return Object.freeze({ ...publicHomePatchInspection(before), cloned: true })
  } catch (error) {
    await removeBestEffort(fileSystem, stage)
    if (error instanceof FreeModeProfileCloneError) throw error
    throw cloneError('free-mode-home-patch-clone-failed', 'the original Desktop home patch could not be copied into Free Mode', error)
  }
}

/**
 * Copy the complete profile-scoped Runtime state into a disposable session.
 * The source is observed before and after the copy; concurrent modification
 * fails closed before the staged copy replaces the session profile.
 */
export async function cloneFreeModeProfile({
  sourceProfileDir,
  targetProfileDir,
  expectedDigest,
  fs = DEFAULT_FS,
  idFactory = randomUUID,
} = {}) {
  const source = assertAbsoluteDirectory(sourceProfileDir, 'free-mode source profile directory')
  const target = assertAbsoluteDirectory(targetProfileDir, 'free-mode target profile directory')
  const fileSystem = assertFs(fs)
  const nextId = assertIdFactory(idFactory)
  assertDistinctRoots(source, target)

  const parent = dirname(target)
  const token = String(nextId())
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(token)) {
    throw new TypeError('free-mode profile clone ID is invalid')
  }
  const stage = join(parent, `.desktop-free-profile-stage-${token}`)
  const backup = join(parent, `.desktop-free-profile-backup-${token}`)
  try {
    await assertRealDirectory(fileSystem, source, {
      missingCode: 'free-mode-profile-clone-source-missing',
      label: 'the selected original profile',
    })
    await assertRealDirectory(fileSystem, target, {
      missingCode: 'free-mode-profile-clone-target-missing',
      label: 'the isolated free-mode profile',
    })
    const before = await inspectSelection(fileSystem, source)
    if (expectedDigest !== undefined && before.digest !== assertDigest(expectedDigest, 'free-mode profile clone expected digest')) {
      throw cloneError('free-mode-profile-clone-source-changed', 'the original profile changed after you approved the Free Mode copy')
    }
    await fileSystem.mkdir(stage, { recursive: false, mode: 0o700 })
    await copySelection(fileSystem, source, stage)
    const after = await inspectSelection(fileSystem, source)
    if (before.digest !== after.digest) {
      throw cloneError('free-mode-profile-clone-source-changed', 'the original profile changed while its free-mode copy was being prepared')
    }
    const staged = await inspectSelection(fileSystem, stage)
    if (staged.digest !== before.digest) {
      throw cloneError('free-mode-profile-clone-verification-failed', 'the isolated profile copy did not preserve the original profile bytes')
    }

    await fileSystem.rename(target, backup)
    let activated = false
    try {
      await fileSystem.rename(stage, target)
      activated = true
      await removeBestEffort(fileSystem, backup)
    } catch (error) {
      if (activated) await fileSystem.rename(target, stage).catch(() => {})
      await fileSystem.rename(backup, target).catch(() => {})
      throw error
    }
    return Object.freeze({
      ...publicInspection(before),
      cloned: true,
      // Explicitly report only a stable result instead of the staging/backup
      // locations, which are private Desktop implementation details.
      cleanupPending: false,
    })
  } catch (error) {
    await removeBestEffort(fileSystem, stage)
    if (error instanceof FreeModeProfileCloneError) throw error
    throw cloneError('free-mode-profile-clone-failed', 'the original profile could not be copied into Free Mode', error)
  }
}

function assertDistinctAgentConfigRoots(source, target) {
  if (isInside(source, target) || isInside(target, source)) {
    throw cloneError(
      'free-mode-agent-config-path-overlap',
      'the isolated free-mode Agent configuration must not overlap its original DSH home',
    )
  }
}

function assertAgentConfigBudget(stats, { depth } = {}) {
  if (
    (depth !== undefined && depth > FREE_MODE_AGENT_CONFIG_MAX_DEPTH)
    || stats.files > FREE_MODE_AGENT_CONFIG_MAX_FILES
    || stats.directories > FREE_MODE_AGENT_CONFIG_MAX_DIRECTORIES
    || stats.bytes > FREE_MODE_AGENT_CONFIG_MAX_BYTES
  ) {
    throw cloneError(
      'free-mode-agent-config-budget-exceeded',
      'the selected Agent configuration exceeds the Free Mode copy limit',
    )
  }
}

function assertAgentConfigTopLevelEntry(name, metadata) {
  if (metadata.isSymbolicLink()) {
    throw cloneError(
      'free-mode-agent-config-link-not-allowed',
      'the selected Agent configuration contains a link and cannot be copied into Free Mode',
    )
  }
  if (AGENT_CONFIG_FILE_ENTRY_SET.has(name) && !metadata.isFile()) {
    throw cloneError(
      'free-mode-agent-config-unexpected-entry',
      'a fixed Agent configuration file has an unsupported type',
    )
  }
  if (AGENT_CONFIG_DIRECTORY_ENTRY_SET.has(name) && !metadata.isDirectory()) {
    throw cloneError(
      'free-mode-agent-config-unexpected-entry',
      'the fixed Agent preset root has an unsupported type',
    )
  }
}

function assertAgentConfigNestedEntry(metadata) {
  if (metadata.isSymbolicLink()) {
    throw cloneError(
      'free-mode-agent-config-link-not-allowed',
      'the selected Agent configuration contains a link and cannot be copied into Free Mode',
    )
  }
  if (!metadata.isDirectory() && !metadata.isFile()) {
    throw cloneError(
      'free-mode-agent-config-unsupported-entry',
      'the selected Agent configuration contains an unsupported filesystem entry',
    )
  }
}

function reserveAgentConfigFile(stats, size) {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw cloneError(
      'free-mode-agent-config-unsupported-entry',
      'the selected Agent configuration contains an unsupported file',
    )
  }
  stats.files += 1
  stats.bytes += size
  assertAgentConfigBudget(stats)
}

function reserveAgentConfigDirectory(stats, depth) {
  stats.directories += 1
  assertAgentConfigBudget(stats, { depth })
}

/**
 * Fingerprint a fixed Agent configuration selection without following a
 * source link.  The only recursive area is the allowlisted `.agent-presets`
 * tree; nested file names are included in the opaque digest but are never
 * returned to an Electron surface.
 */
async function fingerprintAgentConfigPath(fs, path, name, hash, stats, depth = 0) {
  const metadata = await fs.lstat(path)
  assertAgentConfigNestedEntry(metadata)
  if (metadata.isDirectory()) {
    reserveAgentConfigDirectory(stats, depth)
    hashField(hash, 'directory')
    hashField(hash, name)
    const entries = await fs.readdir(path, { withFileTypes: true })
    for (const entry of [...entries].toSorted((left, right) => left.name.localeCompare(right.name))) {
      await fingerprintAgentConfigPath(fs, join(path, entry.name), `${name}/${entry.name}`, hash, stats, depth + 1)
    }
    return
  }

  // Check the pre-read size before reading arbitrary user data, then account
  // for the actual buffer as well in case the source was concurrently edited.
  reserveAgentConfigFile(stats, metadata.size)
  const content = await fs.readFile(path)
  const afterRead = await fs.lstat(path)
  assertAgentConfigNestedEntry(afterRead)
  if (!afterRead.isFile() || content.length !== metadata.size) {
    throw cloneError(
      'free-mode-agent-config-source-changed',
      'the original Agent configuration changed while Free Mode was preparing its copy',
    )
  }
  hashField(hash, 'file')
  hashField(hash, name)
  hashField(hash, content.length)
  hash.update(content)
}

function assertAgentConfigEntryNames(value) {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) {
    throw new TypeError('free-mode Agent configuration entry selection is invalid')
  }
  for (const name of value) {
    if (!AGENT_CONFIG_ENTRY_NAME_SET.has(name)) {
      throw new TypeError('free-mode Agent configuration entry selection is invalid')
    }
  }
  return value
}

async function inspectAgentConfigEntries(fs, dshHome, entryNames = AGENT_CONFIG_ENTRY_NAMES, {
  marker = 'dsh-free-mode-agent-config-v1;',
} = {}) {
  const names = assertAgentConfigEntryNames(entryNames)
  const hash = createHash('sha256')
  hash.update(marker)
  const stats = { files: 0, directories: 0, bytes: 0 }
  const entries = []
  for (const name of names) {
    const path = join(dshHome, name)
    const metadata = await readEntryMetadata(fs, path, { missingIsUndefined: true })
    if (metadata === undefined) {
      hashField(hash, 'missing')
      hashField(hash, name)
      entries.push(Object.freeze({ id: name, present: false }))
      continue
    }
    assertAgentConfigTopLevelEntry(name, metadata)
    await fingerprintAgentConfigPath(fs, path, name, hash, stats)
    entries.push(Object.freeze({
      id: name,
      present: true,
      kind: metadata.isDirectory() ? 'directory' : 'file',
    }))
  }
  return Object.freeze({
    schemaVersion: FREE_MODE_AGENT_CONFIG_CLONE_SCHEMA_VERSION,
    digest: `sha256:${hash.digest('hex')}`,
    entries: Object.freeze(entries),
    files: stats.files,
    directories: stats.directories,
    bytes: stats.bytes,
  })
}

function publicAgentConfigInspection(value) {
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    available: true,
    digest: value.digest,
    entries: Object.freeze(value.entries.map((entry) => Object.freeze({ ...entry }))),
    files: value.files,
    directories: value.directories,
    bytes: value.bytes,
  })
}

async function copyAgentConfigPath(fs, input, output, stats, depth = 0) {
  const metadata = await fs.lstat(input)
  assertAgentConfigNestedEntry(metadata)
  if (metadata.isDirectory()) {
    reserveAgentConfigDirectory(stats, depth)
    await fs.mkdir(output, { recursive: false, mode: 0o700 })
    const entries = await fs.readdir(input, { withFileTypes: true })
    for (const entry of [...entries].toSorted((left, right) => left.name.localeCompare(right.name))) {
      await copyAgentConfigPath(fs, join(input, entry.name), join(output, entry.name), stats, depth + 1)
    }
    return
  }

  reserveAgentConfigFile(stats, metadata.size)
  const content = await fs.readFile(input)
  const afterRead = await fs.lstat(input)
  assertAgentConfigNestedEntry(afterRead)
  if (!afterRead.isFile() || content.length !== metadata.size) {
    throw cloneError(
      'free-mode-agent-config-source-changed',
      'the original Agent configuration changed while Free Mode was preparing its copy',
    )
  }
  await fs.writeFile(output, content, { flag: 'wx', mode: 0o600 })
}

async function copyAgentConfigSelection(fs, source, stage, names) {
  const stats = { files: 0, directories: 0, bytes: 0 }
  for (const name of names) {
    const input = join(source, name)
    const metadata = await readEntryMetadata(fs, input, { missingIsUndefined: true })
    if (metadata === undefined) {
      throw cloneError(
        'free-mode-agent-config-source-changed',
        'the original Agent configuration changed while Free Mode was preparing its copy',
      )
    }
    assertAgentConfigTopLevelEntry(name, metadata)
    await copyAgentConfigPath(fs, input, join(stage, name), stats)
  }
}

function assertReplaceableAgentConfigTargetEntry(metadata) {
  if (!metadata.isDirectory() && !metadata.isFile() && !metadata.isSymbolicLink()) {
    throw cloneError(
      'free-mode-agent-config-target-unsupported-entry',
      'the isolated Free Mode home has an unsupported existing Agent configuration entry',
    )
  }
}

async function rollbackAgentConfigActivation(fs, activation) {
  const failures = []
  for (const entry of [...activation].reverse()) {
    if (entry.activated) {
      try {
        await fs.rename(entry.target, entry.stage)
      } catch (error) {
        failures.push(error)
      }
    }
    if (entry.backedUp) {
      try {
        await fs.rename(entry.backup, entry.target)
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'free-mode Agent configuration rollback failed')
  }
  return true
}

async function activateAgentConfigSelection(fs, { stage, target, backup, names }) {
  const activation = []
  try {
    for (const name of names) {
      const stagedPath = join(stage, name)
      if (await readEntryMetadata(fs, stagedPath, { missingIsUndefined: true }) === undefined) {
        throw cloneError(
          'free-mode-agent-config-verification-failed',
          'the staged Agent configuration is incomplete',
        )
      }
      const targetPath = join(target, name)
      const backupPath = join(backup, name)
      const targetMetadata = await readEntryMetadata(fs, targetPath, { missingIsUndefined: true })
      if (targetMetadata !== undefined) assertReplaceableAgentConfigTargetEntry(targetMetadata)
      const entry = {
        stage: stagedPath,
        target: targetPath,
        backup: backupPath,
        hadExisting: targetMetadata !== undefined,
        backedUp: false,
        activated: false,
      }
      activation.push(entry)
      if (entry.hadExisting) {
        await fs.rename(entry.target, entry.backup)
        entry.backedUp = true
      }
      await fs.rename(entry.stage, entry.target)
      entry.activated = true
    }
    return activation
  } catch (error) {
    try {
      await rollbackAgentConfigActivation(fs, activation)
      await removeBestEffort(fs, backup)
    } catch (rollbackError) {
      throw cloneError(
        'free-mode-agent-config-activation-rollback-failed',
        'the isolated Agent configuration could not be restored after a failed copy',
        new AggregateError([error, rollbackError]),
      )
    }
    throw error
  }
}

/**
 * Inspect the fixed, privacy-bounded Agent configuration that can accompany
 * an explicitly approved Free Mode session. It never reveals config bytes,
 * paths, preset names, or credential values.
 */
export async function inspectFreeModeAgentConfigClone({ sourceDshHome, fs = DEFAULT_FS } = {}) {
  const source = assertAbsoluteDirectory(sourceDshHome, 'free-mode source DSH home directory')
  const fileSystem = assertFs(fs)
  try {
    await assertRealDirectory(fileSystem, source, {
      missingCode: 'free-mode-agent-config-source-missing',
      invalidCode: 'free-mode-agent-config-invalid-directory',
      label: 'the selected original DSH home',
    })
    return publicAgentConfigInspection(await inspectAgentConfigEntries(fileSystem, source))
  } catch (error) {
    if (error instanceof FreeModeProfileCloneError) throw error
    throw cloneError(
      'free-mode-agent-config-inspection-failed',
      'the selected Agent configuration could not be inspected for Free Mode',
      error,
    )
  }
}

/**
 * Copy only user-authored Agent presets and the three fixed Agent config
 * files from an original DSH home into an already-created isolated Free Mode
 * session home. Source links are rejected rather than copied or followed.
 *
 * This is deliberately a main-process composition API: Electron should call
 * it only after its native Free Mode confirmation and only with the
 * app-owned session `targetDshHome` returned by FreeModeSessionManager.
 */
export async function cloneFreeModeAgentConfig({
  sourceDshHome,
  targetDshHome,
  expectedDigest,
  fs = DEFAULT_FS,
  idFactory = randomUUID,
} = {}) {
  const source = assertAbsoluteDirectory(sourceDshHome, 'free-mode source DSH home directory')
  const target = assertAbsoluteDirectory(targetDshHome, 'free-mode target DSH home directory')
  const fileSystem = assertFs(fs)
  const nextId = assertIdFactory(idFactory)
  assertDistinctAgentConfigRoots(source, target)

  const token = String(nextId())
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(token)) {
    throw new TypeError('free-mode Agent configuration clone ID is invalid')
  }
  const parent = dirname(target)
  const stage = join(parent, `.desktop-free-agent-config-stage-${token}`)
  const backup = join(parent, `.desktop-free-agent-config-backup-${token}`)
  try {
    await Promise.all([
      assertRealDirectory(fileSystem, source, {
        missingCode: 'free-mode-agent-config-source-missing',
        invalidCode: 'free-mode-agent-config-invalid-directory',
        label: 'the selected original DSH home',
      }),
      assertRealDirectory(fileSystem, target, {
        missingCode: 'free-mode-agent-config-target-missing',
        invalidCode: 'free-mode-agent-config-invalid-directory',
        label: 'the isolated free-mode DSH home',
      }),
    ])
    const before = await inspectAgentConfigEntries(fileSystem, source)
    if (expectedDigest !== undefined && before.digest !== assertDigest(expectedDigest, 'free-mode Agent configuration expected digest')) {
      throw cloneError(
        'free-mode-agent-config-source-changed',
        'the original Agent configuration changed after you approved the Free Mode copy',
      )
    }
    const names = before.entries.filter((entry) => entry.present).map((entry) => entry.id)
    if (names.length === 0) {
      return Object.freeze({
        ...publicAgentConfigInspection(before),
        cloned: false,
        clonedEntries: Object.freeze([]),
        cleanupPending: false,
      })
    }

    await fileSystem.mkdir(stage, { recursive: false, mode: 0o700 })
    await copyAgentConfigSelection(fileSystem, source, stage, names)
    const after = await inspectAgentConfigEntries(fileSystem, source)
    if (after.digest !== before.digest) {
      throw cloneError(
        'free-mode-agent-config-source-changed',
        'the original Agent configuration changed while its Free Mode copy was being prepared',
      )
    }
    const staged = await inspectAgentConfigEntries(fileSystem, stage)
    if (staged.digest !== before.digest) {
      throw cloneError(
        'free-mode-agent-config-verification-failed',
        'the staged Agent configuration did not preserve the original bytes',
      )
    }
    const stagedCopied = await inspectAgentConfigEntries(fileSystem, stage, names, {
      marker: 'dsh-free-mode-agent-config-copied-v1;',
    })
    await fileSystem.mkdir(backup, { recursive: false, mode: 0o700 })
    const activation = await activateAgentConfigSelection(fileSystem, {
      stage,
      target,
      backup,
      names,
    })
    try {
      const targetCopied = await inspectAgentConfigEntries(fileSystem, target, names, {
        marker: 'dsh-free-mode-agent-config-copied-v1;',
      })
      if (targetCopied.digest !== stagedCopied.digest) {
        throw cloneError(
          'free-mode-agent-config-verification-failed',
          'the isolated Agent configuration did not preserve the staged bytes',
        )
      }
    } catch (error) {
      try {
        await rollbackAgentConfigActivation(fileSystem, activation)
        await removeBestEffort(fileSystem, backup)
      } catch (rollbackError) {
        throw cloneError(
          'free-mode-agent-config-activation-rollback-failed',
          'the isolated Agent configuration could not be restored after verification failed',
          new AggregateError([error, rollbackError]),
        )
      }
      throw error
    }
    await removeBestEffort(fileSystem, backup)
    await removeBestEffort(fileSystem, stage)
    return Object.freeze({
      ...publicAgentConfigInspection(before),
      cloned: true,
      clonedEntries: Object.freeze([...names]),
      cleanupPending: false,
    })
  } catch (error) {
    await removeBestEffort(fileSystem, stage)
    if (error instanceof FreeModeProfileCloneError) throw error
    throw cloneError(
      'free-mode-agent-config-clone-failed',
      'the original Agent configuration could not be copied into Free Mode',
      error,
    )
  }
}

/** Exposed for tests and callers that need the fixed non-project clone scope. */
export function isFreeModeProfileCloneEntry(name) {
  return typeof name === 'string' && CLONE_ENTRY_NAME_SET.has(name)
}

/** Exposed for recovery-shell callers that need the fixed Agent clone scope. */
export function isFreeModeAgentConfigCloneEntry(name) {
  return typeof name === 'string' && AGENT_CONFIG_ENTRY_NAME_SET.has(name)
}
