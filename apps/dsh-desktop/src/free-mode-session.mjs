import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Main-process-only foundation for a free-mode runtime session.
 *
 * A free-mode session is deliberately not a sandbox: after the Desktop main
 * process has obtained the separate native approval, the runtime receives all
 * capabilities available to the current operating-system user. This module
 * only isolates Desktop-managed DSH state, so a failed migration, profile
 * preparation, or experimental plugin cannot overwrite the normal Desktop
 * home while the session is being prepared.
 */
export const FREE_MODE_SESSION_SCHEMA_VERSION = 1
export const FREE_MODE_SESSION_ROOT_NAME = 'free-mode-sessions'
export const FREE_MODE_SESSION_MODE = 'full-user'
export const FREE_MODE_SESSION_PERMISSION = Object.freeze({
  level: FREE_MODE_SESSION_MODE,
  boundary: 'current-os-user',
  // Deliberately empty. Free mode has no Desktop capability deny-list.
  desktopCapabilityDenyList: Object.freeze([]),
})
export const FREE_MODE_SESSION_STATES = Object.freeze([
  'preparing',
  'ready',
  'failed',
  'cleaning',
  'cleaned',
])

// Keep IDs safe on Windows as well as POSIX: a trailing period is normalized
// away by Windows path handling and could otherwise collide with another
// session directory.
const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]|\.(?=[A-Za-z0-9_-])){0,58}$/u
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u
const WINDOWS_RESERVED_SEGMENT_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu
const SESSION_STATE_SET = new Set(FREE_MODE_SESSION_STATES)
const AUDIT_EVENT_SET = new Set([
  'created',
  'profile-prepared',
  'ready',
  'profile-preparation-failed',
  'original-integrity-failed',
  'cleanup-started',
  'cleaned',
])
const FAILURE_CODE_SET = new Set([
  'profile-preparation-failed',
  'original-home-mutated',
  'original-profile-mutated',
])

// Free Mode starts from a newly created DSH home.  Its preparation callback
// must not write Desktop's small, fixed configuration boundary, but it also
// must not walk every unrelated cache, workspace link, or user-owned tree in
// the old home before the user can reach the recovery workbench.
const ORIGINAL_HOME_INTEGRITY_ENTRIES = Object.freeze([
  'cordis.patch.yml',
])
const ORIGINAL_PROFILE_INTEGRITY_ENTRIES = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'cordis.patch.yml',
  'cordis.yml',
  'pnpm-workspace.yaml',
  '.dsh-desktop-links.json',
  'desktop-plugins.lock.json',
])

const DEFAULT_FS = Object.freeze({
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function onlyKeys(value, keys, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains an unknown field: ${key}`)
  }
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path`)
  }
  return resolve(value)
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 32) {
    throw new TypeError(`${label} must be a canonical ISO-8601 timestamp`)
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO-8601 timestamp`)
  }
  return value
}

function nowTimestamp(now) {
  return assertTimestamp(now(), 'free-mode session clock value')
}

function assertOpaqueId(value, label) {
  if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a non-path opaque identifier`)
  }
  return value
}

function assertSessionId(value) {
  if (
    typeof value !== 'string'
    || !SESSION_ID_PATTERN.test(value)
    || WINDOWS_RESERVED_SEGMENT_PATTERN.test(value)
  ) {
    throw new TypeError('free-mode session ID is invalid')
  }
  return value
}

/** Validate the app-owned session ID before it is ever used as a path segment. */
export function validateFreeModeSessionId(value) {
  return assertSessionId(value)
}

/** Derive the profile name that should be passed to DshRuntimeController. */
export function freeModeProfileNameForSession(sessionId) {
  const id = assertSessionId(sessionId)
  const profileName = `free-${id}`
  if (!PROFILE_NAME_PATTERN.test(profileName)) {
    throw new TypeError('free-mode profile name is invalid')
  }
  return profileName
}

function assertProfileName(value, label = 'free-mode original profile name') {
  if (typeof value !== 'string' || !PROFILE_NAME_PATTERN.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function assertSource(value) {
  if (value === undefined) return undefined
  onlyKeys(value, ['id', 'contentSha256'], 'free-mode session source')
  if (typeof value.id !== 'string' || !FINGERPRINT_PATTERN.test(value.id)) {
    throw new TypeError('free-mode session source ID is invalid')
  }
  if (typeof value.contentSha256 !== 'string' || !SHA256_PATTERN.test(value.contentSha256)) {
    throw new TypeError('free-mode session source content digest is invalid')
  }
  return Object.freeze({ id: value.id, contentSha256: value.contentSha256 })
}

function assertFileSystem(fs) {
  if (!fs || typeof fs !== 'object') {
    throw new TypeError('free-mode session requires file operations')
  }
  for (const name of ['lstat', 'mkdir', 'readFile', 'readdir', 'readlink', 'realpath', 'rename', 'rm', 'writeFile']) {
    if (typeof fs[name] !== 'function') {
      throw new TypeError('free-mode session requires file operations')
    }
  }
  return fs
}

function isPathInside(parent, candidate) {
  const child = relative(parent, candidate)
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

function pathsOverlap(left, right) {
  return isPathInside(left, right) || isPathInside(right, left)
}

function assertContainedPath(parent, candidate, label) {
  if (!isPathInside(parent, candidate)) {
    throw new FreeModeSessionError(
      'free-mode-session-path-escape',
      `${label} escapes the app-owned free-mode session root`,
    )
  }
  return candidate
}

async function canonicalizePath(fs, path) {
  const pendingSegments = []
  let current = resolve(path)
  while (true) {
    try {
      const canonical = await fs.realpath(current)
      return resolve(canonical, ...pendingSegments.reverse())
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parent = dirname(current)
      if (parent === current) return resolve(path)
      pendingSegments.push(basename(current))
      current = parent
    }
  }
}

async function exists(fs, path) {
  try {
    await fs.lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function treeFingerprintDigest() {
  return createHash('sha256')
}

function addFingerprintField(hash, value) {
  const serialized = Buffer.from(String(value), 'utf8')
  hash.update(String(serialized.length))
  hash.update(':')
  hash.update(serialized)
  hash.update(';')
}

/**
 * Capture a path-independent, no-follow digest for a fixed Desktop-owned
 * configuration boundary.  This deliberately never traverses `node_modules`,
 * task state, a workspace link, or arbitrary home data: full-user recovery
 * must remain available even when an unrelated legacy tree is huge or
 * unreadable. Original-plugin copying performs its own byte-for-byte source
 * verification in `free-mode-profile-clone.mjs`.
 */
async function fingerprintFixedEntries(fs, root, entries, marker) {
  const hash = treeFingerprintDigest()
  hash.update(marker)

  for (const name of entries) {
    const path = join(root, name)
    let metadata
    try {
      metadata = await fs.lstat(path)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        addFingerprintField(hash, 'missing')
        addFingerprintField(hash, name)
        continue
      }
      throw error
    }

    if (metadata.isFile()) {
      addFingerprintField(hash, 'file')
      addFingerprintField(hash, name)
      const content = await fs.readFile(path)
      addFingerprintField(hash, content.length)
      hash.update(content)
      hash.update(';')
      continue
    }

    if (metadata.isSymbolicLink()) {
      addFingerprintField(hash, 'symlink')
      addFingerprintField(hash, name)
      addFingerprintField(hash, await fs.readlink(path))
      continue
    }

    // Do not recurse into unexpected directories or special host entries.
    // Their metadata still changes the opaque boundary marker, but a broken
    // unrelated tree cannot prevent entry into the isolated workbench.
    addFingerprintField(hash, 'special')
    addFingerprintField(hash, name)
    addFingerprintField(hash, metadata.mode)
    addFingerprintField(hash, metadata.size)
    addFingerprintField(hash, metadata.mtimeMs)
  }
  return `sha256:${hash.digest('hex')}`
}

function normalizePermission(value) {
  onlyKeys(value, ['level', 'boundary', 'desktopCapabilityDenyList'], 'free-mode session permission')
  if (
    value.level !== FREE_MODE_SESSION_PERMISSION.level
    || value.boundary !== FREE_MODE_SESSION_PERMISSION.boundary
    || !Array.isArray(value.desktopCapabilityDenyList)
    || value.desktopCapabilityDenyList.length !== 0
  ) {
    throw new TypeError('free-mode session permission is invalid')
  }
  return FREE_MODE_SESSION_PERMISSION
}

function clonePermission() {
  return Object.freeze({
    level: FREE_MODE_SESSION_PERMISSION.level,
    boundary: FREE_MODE_SESSION_PERMISSION.boundary,
    desktopCapabilityDenyList: Object.freeze([]),
  })
}

function normalizeOrigin(value) {
  onlyKeys(value, ['homeFingerprint', 'profileFingerprint'], 'free-mode session origin')
  if (
    typeof value.homeFingerprint !== 'string'
    || typeof value.profileFingerprint !== 'string'
    || !FINGERPRINT_PATTERN.test(value.homeFingerprint)
    || !FINGERPRINT_PATTERN.test(value.profileFingerprint)
  ) {
    throw new TypeError('free-mode session origin is invalid')
  }
  return Object.freeze({
    homeFingerprint: value.homeFingerprint,
    profileFingerprint: value.profileFingerprint,
  })
}

function normalizeAuditEvent(value, { sessionId, previousSequence }) {
  onlyKeys(value, ['sequence', 'at', 'event', 'state'], 'free-mode session audit event')
  if (!Number.isInteger(value.sequence) || value.sequence !== previousSequence + 1) {
    throw new TypeError('free-mode session audit sequence is invalid')
  }
  if (!AUDIT_EVENT_SET.has(value.event) || !SESSION_STATE_SET.has(value.state)) {
    throw new TypeError('free-mode session audit event is invalid')
  }
  return Object.freeze({
    sequence: value.sequence,
    at: assertTimestamp(value.at, 'free-mode session audit time'),
    event: value.event,
    state: value.state,
    // The audit is intentionally not extensible. In particular it has no
    // generic details field that could accidentally retain external paths.
    sessionId,
  })
}

function internalAuditEvent(value) {
  return Object.freeze({
    sequence: value.sequence,
    at: value.at,
    event: value.event,
    state: value.state,
  })
}

function normalizeRecord(value) {
  onlyKeys(value, [
    'schemaVersion',
    'sessionId',
    'profileName',
    'mode',
    'permission',
    'state',
    'createdAt',
    'updatedAt',
    'origin',
    'source',
    'grantId',
    'failureCode',
    'audit',
  ], 'free-mode session record')
  if (value.schemaVersion !== FREE_MODE_SESSION_SCHEMA_VERSION) {
    throw new TypeError('free-mode session record schema is invalid')
  }
  const sessionId = assertSessionId(value.sessionId)
  const profileName = assertProfileName(value.profileName, 'free-mode session profile name')
  if (profileName !== freeModeProfileNameForSession(sessionId)) {
    throw new TypeError('free-mode session profile name does not match the session ID')
  }
  if (value.mode !== FREE_MODE_SESSION_MODE) throw new TypeError('free-mode session mode is invalid')
  normalizePermission(value.permission)
  if (!SESSION_STATE_SET.has(value.state)) throw new TypeError('free-mode session state is invalid')
  if (!Array.isArray(value.audit) || value.audit.length === 0) {
    throw new TypeError('free-mode session audit is invalid')
  }
  const audit = []
  let sequence = 0
  for (const rawEvent of value.audit) {
    const normalized = normalizeAuditEvent(rawEvent, { sessionId, previousSequence: sequence })
    sequence = normalized.sequence
    audit.push(internalAuditEvent(normalized))
  }
  if (audit.at(-1)?.state !== value.state) {
    throw new TypeError('free-mode session audit does not match the current state')
  }
  const hasSource = Object.hasOwn(value, 'source') && value.source !== undefined
  const hasGrantId = Object.hasOwn(value, 'grantId') && value.grantId !== undefined
  const hasFailureCode = Object.hasOwn(value, 'failureCode') && value.failureCode !== undefined
  if (hasFailureCode && !FAILURE_CODE_SET.has(value.failureCode)) {
    throw new TypeError('free-mode session failure code is invalid')
  }
  if (value.state === 'failed' && !hasFailureCode) {
    throw new TypeError('failed free-mode sessions require a failure code')
  }
  return Object.freeze({
    schemaVersion: FREE_MODE_SESSION_SCHEMA_VERSION,
    sessionId,
    profileName,
    mode: FREE_MODE_SESSION_MODE,
    permission: clonePermission(),
    state: value.state,
    createdAt: assertTimestamp(value.createdAt, 'free-mode session creation time'),
    updatedAt: assertTimestamp(value.updatedAt, 'free-mode session update time'),
    origin: normalizeOrigin(value.origin),
    ...(hasSource ? { source: assertSource(value.source) } : {}),
    ...(hasGrantId ? { grantId: assertOpaqueId(value.grantId, 'free-mode session grant ID') } : {}),
    ...(hasFailureCode ? { failureCode: value.failureCode } : {}),
    audit: Object.freeze(audit),
  })
}

function publicRecord(record) {
  return Object.freeze({
    schemaVersion: record.schemaVersion,
    sessionId: record.sessionId,
    profileName: record.profileName,
    mode: record.mode,
    permission: clonePermission(),
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    origin: Object.freeze({ ...record.origin }),
    ...(record.source === undefined ? {} : { source: Object.freeze({ ...record.source }) }),
    ...(record.grantId === undefined ? {} : { grantId: record.grantId }),
    ...(record.failureCode === undefined ? {} : { failureCode: record.failureCode }),
    audit: Object.freeze(record.audit.map((event) => Object.freeze({ ...event }))),
  })
}

function createAuditEvent(record, { event, state, at }) {
  return Object.freeze({
    sequence: record.audit.length + 1,
    at,
    event,
    state,
  })
}

function transitionRecord(record, { state, event, at, failureCode }) {
  if (!SESSION_STATE_SET.has(state) || !AUDIT_EVENT_SET.has(event)) {
    throw new TypeError('free-mode session transition is invalid')
  }
  const next = {
    ...record,
    state,
    updatedAt: at,
    ...(failureCode === undefined
      ? {}
      : { failureCode }),
    audit: [...record.audit, createAuditEvent(record, { event, state, at })],
  }
  return normalizeRecord(next)
}

function createInitialRecord({ sessionId, profileName, source, grantId, origin, createdAt }) {
  return normalizeRecord({
    schemaVersion: FREE_MODE_SESSION_SCHEMA_VERSION,
    sessionId,
    profileName,
    mode: FREE_MODE_SESSION_MODE,
    permission: clonePermission(),
    state: 'preparing',
    createdAt,
    updatedAt: createdAt,
    origin,
    ...(source === undefined ? {} : { source }),
    ...(grantId === undefined ? {} : { grantId }),
    audit: [{ sequence: 1, at: createdAt, event: 'created', state: 'preparing' }],
  })
}

async function writeAtomically(path, content, fs) {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  let movedExisting = false
  await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  try {
    try {
      await fs.rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await fs.rename(temporary, path)
    if (await fs.readFile(path, 'utf8') !== content) {
      throw new Error('free-mode session record did not verify after write')
    }
    if (movedExisting) await fs.rm(backup, { force: true })
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await fs.rm(path, { force: true }).catch(() => {})
      await fs.rename(backup, path).catch(() => {})
    }
    throw error
  }
}

export class FreeModeSessionError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'FreeModeSessionError'
    this.code = code
  }
}

/**
 * Creates app-owned, disposable DSH homes for user-approved free-mode runs.
 *
 * `prepareProfile`, when supplied, receives only the isolated DSH paths and
 * opaque approval identifiers. It can call `ensureDesktopProfile()` later,
 * but it never receives the original DSH home from this API.
 */
export class FreeModeSessionManager {
  constructor({
    appDataDir,
    originalDshHome,
    originalProfileName = 'desktop',
    prepareProfile,
    fs = DEFAULT_FS,
    now = () => new Date().toISOString(),
  } = {}) {
    this.appDataDir = assertAbsolutePath(appDataDir, 'free-mode app data directory')
    this.originalDshHome = assertAbsolutePath(originalDshHome, 'free-mode original DSH home')
    this.originalProfileName = assertProfileName(originalProfileName)
    if (prepareProfile !== undefined && typeof prepareProfile !== 'function') {
      throw new TypeError('free-mode profile preparation callback must be a function')
    }
    if (typeof now !== 'function') throw new TypeError('free-mode session clock must be a function')
    this.prepareProfile = prepareProfile
    this.fs = assertFileSystem(fs)
    this.now = now
    this.pathState = undefined
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  async #pathsNow() {
    if (this.pathState !== undefined) return this.pathState

    const appDataDir = await canonicalizePath(this.fs, this.appDataDir)
    const originalDshHome = await canonicalizePath(this.fs, this.originalDshHome)
    if (pathsOverlap(appDataDir, originalDshHome)) {
      throw new FreeModeSessionError(
        'free-mode-session-root-overlaps-original-home',
        'free-mode session storage must not overlap the original DSH home',
      )
    }

    const sessionRoot = join(appDataDir, FREE_MODE_SESSION_ROOT_NAME)
    await this.fs.mkdir(sessionRoot, { recursive: true, mode: 0o700 })
    const canonicalSessionRoot = await canonicalizePath(this.fs, sessionRoot)
    if (pathsOverlap(canonicalSessionRoot, originalDshHome)) {
      throw new FreeModeSessionError(
        'free-mode-session-root-overlaps-original-home',
        'free-mode session storage must not overlap the original DSH home',
      )
    }

    const activeRoot = join(canonicalSessionRoot, 'active')
    const recordRoot = join(canonicalSessionRoot, 'records')
    await Promise.all([
      this.fs.mkdir(activeRoot, { recursive: true, mode: 0o700 }),
      this.fs.mkdir(recordRoot, { recursive: true, mode: 0o700 }),
    ])
    const [canonicalActiveRoot, canonicalRecordRoot] = await Promise.all([
      canonicalizePath(this.fs, activeRoot),
      canonicalizePath(this.fs, recordRoot),
    ])
    if (pathsOverlap(canonicalActiveRoot, originalDshHome) || pathsOverlap(canonicalRecordRoot, originalDshHome)) {
      throw new FreeModeSessionError(
        'free-mode-session-root-overlaps-original-home',
        'free-mode session storage must not overlap the original DSH home',
      )
    }

    this.pathState = Object.freeze({
      appDataDir,
      originalDshHome,
      originalProfileDir: join(originalDshHome, 'profiles', this.originalProfileName),
      sessionRoot: canonicalSessionRoot,
      activeRoot: canonicalActiveRoot,
      recordRoot: canonicalRecordRoot,
    })
    return this.pathState
  }

  #sessionPaths(paths, sessionId) {
    const activeDir = assertContainedPath(paths.activeRoot, join(paths.activeRoot, sessionId), 'free-mode session directory')
    const recordPath = assertContainedPath(paths.recordRoot, join(paths.recordRoot, `${sessionId}.json`), 'free-mode session record')
    const dshHome = assertContainedPath(activeDir, join(activeDir, 'dsh'), 'free-mode DSH home')
    const profileName = freeModeProfileNameForSession(sessionId)
    const profileDir = assertContainedPath(dshHome, join(dshHome, 'profiles', profileName), 'free-mode profile directory')
    return Object.freeze({ activeDir, recordPath, dshHome, profileName, profileDir })
  }

  async #readRecord(recordPath) {
    let text
    try {
      text = await this.fs.readFile(recordPath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw error
    }
    try {
      return normalizeRecord(JSON.parse(text))
    } catch (error) {
      if (error instanceof FreeModeSessionError) throw error
      throw new FreeModeSessionError(
        'free-mode-session-record-invalid',
        'free-mode session record is invalid',
        { cause: error },
      )
    }
  }

  async #persistRecord(paths, record) {
    const verified = normalizeRecord(record)
    const content = `${JSON.stringify(verified, null, 2)}\n`
    await writeAtomically(paths.recordPath, content, this.fs)
    return verified
  }

  async #originFingerprint(paths) {
    const [homeFingerprint, profileFingerprint] = await Promise.all([
      fingerprintFixedEntries(
        this.fs,
        paths.originalDshHome,
        ORIGINAL_HOME_INTEGRITY_ENTRIES,
        'dsh-free-mode-original-home-config-v2;',
      ),
      fingerprintFixedEntries(
        this.fs,
        paths.originalProfileDir,
        ORIGINAL_PROFILE_INTEGRITY_ENTRIES,
        'dsh-free-mode-original-profile-config-v2;',
      ),
    ])
    return Object.freeze({ homeFingerprint, profileFingerprint })
  }

  async #removeActiveDirectory(paths) {
    assertContainedPath(paths.activeRoot, paths.activeDir, 'free-mode cleanup target')
    await this.fs.rm(paths.activeDir, { recursive: true, force: true })
  }

  #runtimeSession(record, paths) {
    return Object.freeze({
      sessionId: record.sessionId,
      dshHome: paths.dshHome,
      profileName: record.profileName,
      profileDir: paths.profileDir,
      mode: FREE_MODE_SESSION_MODE,
      permission: clonePermission(),
      ...(record.source === undefined ? {} : { source: Object.freeze({ ...record.source }) }),
      ...(record.grantId === undefined ? {} : { grantId: record.grantId }),
    })
  }

  async #failPreparation({ paths, record, failureCode }) {
    const failed = transitionRecord(record, {
      state: 'failed',
      event: failureCode === 'profile-preparation-failed'
        ? 'profile-preparation-failed'
        : 'original-integrity-failed',
      at: nowTimestamp(this.now),
      failureCode,
    })
    try {
      await this.#persistRecord(paths, failed)
    } finally {
      await this.#removeActiveDirectory(paths).catch(() => {})
    }
    return failed
  }

  create({ sessionId, source, grantId } = {}) {
    return this.#enqueue(async () => {
      const normalizedSessionId = assertSessionId(sessionId)
      const normalizedSource = assertSource(source)
      const normalizedGrantId = grantId === undefined
        ? undefined
        : assertOpaqueId(grantId, 'free-mode session grant ID')
      const paths = await this.#pathsNow()
      const sessionPaths = this.#sessionPaths(paths, normalizedSessionId)
      if (await exists(this.fs, sessionPaths.recordPath) || await exists(this.fs, sessionPaths.activeDir)) {
        throw new FreeModeSessionError(
          'free-mode-session-id-reserved',
          'free-mode session ID is already reserved',
        )
      }

      const beforeOrigin = await this.#originFingerprint(paths)
      try {
        await this.fs.mkdir(sessionPaths.activeDir, { recursive: false, mode: 0o700 })
        await this.fs.mkdir(sessionPaths.profileDir, { recursive: true, mode: 0o700 })
      } catch (error) {
        await this.#removeActiveDirectory({ ...paths, ...sessionPaths }).catch(() => {})
        throw error
      }

      let record = createInitialRecord({
        sessionId: normalizedSessionId,
        profileName: sessionPaths.profileName,
        source: normalizedSource,
        grantId: normalizedGrantId,
        origin: beforeOrigin,
        createdAt: nowTimestamp(this.now),
      })
      try {
        record = await this.#persistRecord(sessionPaths, record)
      } catch (error) {
        await this.#removeActiveDirectory({ ...paths, ...sessionPaths }).catch(() => {})
        throw error
      }

      let preparationError
      try {
        if (this.prepareProfile !== undefined) {
          await this.prepareProfile(this.#runtimeSession(record, sessionPaths))
          record = transitionRecord(record, {
            state: 'preparing',
            event: 'profile-prepared',
            at: nowTimestamp(this.now),
          })
          record = await this.#persistRecord(sessionPaths, record)
        }
      } catch (error) {
        preparationError = error
      }

      let afterOrigin
      try {
        afterOrigin = await this.#originFingerprint(paths)
      } catch (error) {
        preparationError ??= error
      }
      if (afterOrigin !== undefined) {
        const failureCode = afterOrigin.profileFingerprint !== beforeOrigin.profileFingerprint
          ? 'original-profile-mutated'
          : afterOrigin.homeFingerprint !== beforeOrigin.homeFingerprint
            ? 'original-home-mutated'
            : undefined
        if (failureCode !== undefined) {
          await this.#failPreparation({ paths: { ...paths, ...sessionPaths }, record, failureCode })
          throw new FreeModeSessionError(
            'free-mode-session-original-mutated',
            'profile preparation changed the original DSH state',
          )
        }
      }
      if (preparationError !== undefined) {
        await this.#failPreparation({
          paths: { ...paths, ...sessionPaths },
          record,
          failureCode: 'profile-preparation-failed',
        })
        throw new FreeModeSessionError(
          'free-mode-session-profile-prepare-failed',
          'free-mode profile preparation failed',
          { cause: preparationError },
        )
      }

      record = transitionRecord(record, {
        state: 'ready',
        event: 'ready',
        at: nowTimestamp(this.now),
      })
      record = await this.#persistRecord(sessionPaths, record)
      return this.#runtimeSession(record, sessionPaths)
    })
  }

  inspect(sessionId) {
    return this.#enqueue(async () => {
      const normalizedSessionId = assertSessionId(sessionId)
      const paths = await this.#pathsNow()
      const sessionPaths = this.#sessionPaths(paths, normalizedSessionId)
      const record = await this.#readRecord(sessionPaths.recordPath)
      return record === undefined ? undefined : publicRecord(record)
    })
  }

  cleanup(sessionId) {
    return this.#enqueue(async () => {
      const normalizedSessionId = assertSessionId(sessionId)
      const paths = await this.#pathsNow()
      const sessionPaths = this.#sessionPaths(paths, normalizedSessionId)
      const record = await this.#readRecord(sessionPaths.recordPath)
      if (record === undefined || record.state === 'cleaned') return false

      const cleaning = transitionRecord(record, {
        state: 'cleaning',
        event: 'cleanup-started',
        at: nowTimestamp(this.now),
      })
      await this.#persistRecord(sessionPaths, cleaning)
      try {
        await this.#removeActiveDirectory({ ...paths, ...sessionPaths })
      } catch (error) {
        throw new FreeModeSessionError(
          'free-mode-session-cleanup-failed',
          'free-mode session cleanup could not remove its isolated state',
          { cause: error },
        )
      }
      const cleaned = transitionRecord(cleaning, {
        state: 'cleaned',
        event: 'cleaned',
        at: nowTimestamp(this.now),
      })
      await this.#persistRecord(sessionPaths, cleaned)
      return true
    })
  }
}
