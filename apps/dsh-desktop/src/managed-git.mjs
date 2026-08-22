import { spawn as nodeSpawn } from 'node:child_process'
import { createHash as nodeCreateHash } from 'node:crypto'
import { createReadStream as nodeCreateReadStream } from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { unzipSync } from 'fflate'

/**
 * This module deliberately has no downloader, Electron IPC, or PATH wiring.
 * It is the small trusted foundation a future recovery action can call after
 * it has selected a bundled, reviewed manifest entry. In particular, callers
 * must not pass renderer-provided URLs, hashes, or executable paths here.
 */

export const MANAGED_GIT_MANIFEST_SCHEMA_VERSION = 1
export const MANAGED_GIT_INSTALL_STATE_SCHEMA_VERSION = 1
export const MANAGED_GIT_STATE_FILENAME = '.dsh-managed-git.json'
export const MANAGED_GIT_ALLOWED_HOSTS = Object.freeze([
  'github.com',
  'github-releases.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])
export const MANAGED_GIT_ARCHIVE_LIMITS = Object.freeze({
  archiveBytes: 512 * 1024 * 1024,
  entries: 50_000,
  entryBytes: 256 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024,
  compressionRatio: 300,
})
export const MANAGED_GIT_PROBE_TIMEOUT_MS = 2_500

const MAX_GIT_PROBE_TIMEOUT_MS = 10_000
const PROBE_KILL_GRACE_MS = 250
const MANAGED_GIT_RENAME_RETRY_DELAYS_MS = Object.freeze([25, 50, 100, 200])
const RETRIABLE_RENAME_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPERM'])
const MAX_GIT_PROBE_OUTPUT_BYTES = 8 * 1024
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const RELEASE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u
const ARCH_SET = new Set(['x64', 'arm64'])
const GIT_VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+){1,3}(?:\.[a-z][a-z0-9-]*(?:\.[0-9]+){0,3})?$/u
const SAFE_DIRECTORY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u
const SAFE_RELATIVE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u
const NORMALIZED_MANIFESTS = new WeakSet()
const NORMALIZED_RELEASES = new WeakSet()
const NORMALIZED_INSTALL_STATES = new WeakSet()

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertExactKeys(value, keys, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  const actual = Object.keys(value).toSorted()
  const expected = [...keys].toSorted()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unsupported or missing fields`)
  }
}

function managedGitError(code, message, cause = undefined) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.code = code
  return error
}

function normalizedSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`)
  }
  return value
}

function normalizedGitVersion(value, label) {
  if (typeof value !== 'string' || !GIT_VERSION_PATTERN.test(value) || value.length > 80) {
    throw new TypeError(`${label} must be a supported exact Git version`)
  }
  return value
}

function normalizedArchiveBytes(value, label, maximum = MANAGED_GIT_ARCHIVE_LIMITS.archiveBytes) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new TypeError(`${label} must be a bounded positive byte count`)
  }
  return value
}

function normalizedRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240 || !SAFE_RELATIVE_PATH_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a safe forward-slash relative path`)
  }
  const segments = value.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.length === 0)) {
    throw new TypeError(`${label} must be a safe forward-slash relative path`)
  }
  for (const segment of segments) assertWindowsSafePathSegment(segment, label)
  return value
}

function normalizedRootDirectory(value, label) {
  // `.` is an explicit, reviewed sentinel for official ZIPs such as MinGit
  // whose files live at the archive root. It is not interpreted as a local
  // filesystem path: extraction still accepts only independently validated
  // ZIP entry paths and always safe-joins them below a fresh staging root.
  if (value === '.') return value
  if (typeof value !== 'string' || !SAFE_DIRECTORY_NAME_PATTERN.test(value) || value === '..') {
    throw new TypeError(`${label} must be a single safe archive directory name`)
  }
  assertWindowsSafePathSegment(value, label)
  return value
}

function assertWindowsSafePathSegment(segment, label) {
  if (segment.endsWith('.') || segment.endsWith(' ')) {
    throw new TypeError(`${label} contains a Windows-ambiguous path segment`)
  }
  const stem = segment.split('.', 1)[0].toLowerCase()
  if (['con', 'prn', 'aux', 'nul'].includes(stem) || /^(?:com|lpt)[1-9]$/u.test(stem)) {
    throw new TypeError(`${label} contains a reserved Windows device name`)
  }
}

function normalizeAllowedHosts(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    throw new TypeError('managed Git allowed hosts must be a bounded non-empty array')
  }
  const hosts = value.map((host) => {
    if (typeof host !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(host)) {
      throw new TypeError('managed Git allowed host is invalid')
    }
    return host
  })
  if (new Set(hosts).size !== hosts.length) throw new TypeError('managed Git allowed hosts contain duplicates')
  return new Set(hosts)
}

/**
 * Normalize a direct, reviewed artifact URL. A future HTTP client must retain
 * the HTTPS, credential, host, and ZIP-path restrictions for redirects too;
 * a final server-issued signed-asset query needs a separately reviewed rule.
 */
export function normalizeManagedGitDownloadUrl(value, { allowedHosts = MANAGED_GIT_ALLOWED_HOSTS } = {}) {
  const hosts = normalizeAllowedHosts(allowedHosts)
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_000) {
    throw new TypeError('managed Git archive URL is invalid')
  }
  // URL() canonicalizes dot segments before exposing pathname. Reject them in
  // the original spelling as well, including encoded separators, so a review
  // of the pinned manifest sees the same asset path the downloader receives.
  const rawPath = value.split(/[?#]/u, 1)[0]
  if (/(?:^|\/)\.{1,2}(?:\/|$)/u.test(rawPath) || /%(?:2e|2f|5c|00)/iu.test(rawPath)) {
    throw new TypeError('managed Git archive URL path is invalid')
  }
  let parsed
  try {
    parsed = new URL(value)
  } catch (cause) {
    throw new TypeError('managed Git archive URL is invalid', { cause })
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.port !== '') {
    throw new TypeError('managed Git archive URL must use credential-free HTTPS')
  }
  if (!hosts.has(parsed.hostname) || parsed.search !== '' || parsed.hash !== '') {
    throw new TypeError('managed Git archive URL host or query is not allowed')
  }
  if (!parsed.pathname.toLowerCase().endsWith('.zip') || parsed.pathname.includes('\\')) {
    throw new TypeError('managed Git archive URL must identify a ZIP asset')
  }
  if (parsed.pathname.includes('//')) throw new TypeError('managed Git archive URL path is invalid')
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length === 0) throw new TypeError('managed Git archive URL path is invalid')
  for (const segment of segments) {
    let decoded
    try {
      decoded = decodeURIComponent(segment)
    } catch (cause) {
      throw new TypeError('managed Git archive URL path is invalid', { cause })
    }
    if (decoded.length === 0 || decoded === '.' || decoded === '..' || /[\\/\0]/u.test(decoded)) {
      throw new TypeError('managed Git archive URL path is invalid')
    }
  }
  return parsed.href
}

function normalizeManagedGitRelease(value, { allowedHosts = MANAGED_GIT_ALLOWED_HOSTS } = {}) {
  if (NORMALIZED_RELEASES.has(value)) return value
  assertExactKeys(value, new Set(['id', 'platform', 'arch', 'version', 'archive', 'git']), 'managed Git release')
  if (typeof value.id !== 'string' || !RELEASE_ID_PATTERN.test(value.id) || value.id.length > 120) {
    throw new TypeError('managed Git release id is invalid')
  }
  if (value.platform !== 'win32') throw new TypeError('managed Git release platform must be win32')
  if (!ARCH_SET.has(value.arch)) throw new TypeError('managed Git release architecture is invalid')
  const version = normalizedGitVersion(value.version, 'managed Git release version')

  assertExactKeys(value.archive, new Set(['format', 'url', 'sha256', 'bytes', 'rootDirectory']), 'managed Git release archive')
  if (value.archive.format !== 'zip') throw new TypeError('managed Git release archive format must be zip')
  const archive = Object.freeze({
    format: 'zip',
    url: normalizeManagedGitDownloadUrl(value.archive.url, { allowedHosts }),
    sha256: normalizedSha256(value.archive.sha256, 'managed Git release archive digest'),
    bytes: normalizedArchiveBytes(value.archive.bytes, 'managed Git release archive bytes'),
    rootDirectory: normalizedRootDirectory(value.archive.rootDirectory, 'managed Git release archive rootDirectory'),
  })

  assertExactKeys(value.git, new Set(['executablePath', 'sha256', 'bytes']), 'managed Git release git')
  const executablePath = normalizedRelativePath(value.git.executablePath, 'managed Git executable path')
  if (executablePath.split('/').at(-1).toLowerCase() !== 'git.exe') {
    throw new TypeError('managed Git executable path must end in git.exe')
  }
  const executableSha256 = normalizedSha256(value.git.sha256, 'managed Git executable digest')
  const executableBytes = normalizedArchiveBytes(value.git.bytes, 'managed Git executable bytes', MANAGED_GIT_ARCHIVE_LIMITS.entryBytes)

  const normalized = Object.freeze({
    id: value.id,
    platform: 'win32',
    arch: value.arch,
    version,
    archive,
    git: Object.freeze({ executablePath, sha256: executableSha256, bytes: executableBytes }),
  })
  NORMALIZED_RELEASES.add(normalized)
  return normalized
}

/** Parse the intentionally small, pinned Portable Git manifest surface. */
export function normalizeManagedGitManifest(value, { allowedHosts = MANAGED_GIT_ALLOWED_HOSTS } = {}) {
  if (NORMALIZED_MANIFESTS.has(value)) return value
  assertExactKeys(value, new Set(['schemaVersion', 'releases']), 'managed Git manifest')
  if (value.schemaVersion !== MANAGED_GIT_MANIFEST_SCHEMA_VERSION || !Array.isArray(value.releases) || value.releases.length === 0 || value.releases.length > 4) {
    throw new TypeError('managed Git manifest schema is invalid')
  }
  const releases = value.releases.map((release) => normalizeManagedGitRelease(release, { allowedHosts }))
  const ids = new Set()
  const platforms = new Set()
  for (const release of releases) {
    if (ids.has(release.id)) throw new TypeError('managed Git manifest contains duplicate release ids')
    ids.add(release.id)
    const target = `${release.platform}:${release.arch}`
    if (platforms.has(target)) throw new TypeError('managed Git manifest contains ambiguous platform releases')
    platforms.add(target)
  }
  const normalized = Object.freeze({
    schemaVersion: MANAGED_GIT_MANIFEST_SCHEMA_VERSION,
    releases: Object.freeze(releases),
  })
  NORMALIZED_MANIFESTS.add(normalized)
  return normalized
}

/** Read a bundled manifest before selecting a release; raw JSON never leaks to execution code. */
export async function readManagedGitManifest(path, {
  readFile = nodeFs.readFile,
  allowedHosts = MANAGED_GIT_ALLOWED_HOSTS,
} = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || typeof readFile !== 'function') {
    throw new TypeError('managed Git manifest path and readFile are required')
  }
  let parsed
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (cause) {
    throw managedGitError('MANAGED_GIT_MANIFEST_UNAVAILABLE', 'managed Git manifest could not be read', cause)
  }
  try {
    return normalizeManagedGitManifest(parsed, { allowedHosts })
  } catch (cause) {
    throw managedGitError('MANAGED_GIT_MANIFEST_INVALID', 'managed Git manifest is invalid', cause)
  }
}

/** Select the one pinned artifact that matches the local platform and architecture. */
export function selectManagedGitRelease(manifest, {
  platform = process.platform,
  arch = process.arch,
  allowedHosts = MANAGED_GIT_ALLOWED_HOSTS,
} = {}) {
  const normalized = NORMALIZED_MANIFESTS.has(manifest)
    ? manifest
    : normalizeManagedGitManifest(manifest, { allowedHosts })
  return normalized.releases.find((release) => release.platform === platform && release.arch === arch) ?? null
}

/** Derive every mutable managed-Git path from Electron's user-data directory. */
export function managedGitPaths(userDataDirectory) {
  if (typeof userDataDirectory !== 'string' || !isAbsolute(userDataDirectory)) {
    throw new TypeError('managed Git user-data directory must be an absolute path')
  }
  const rootDirectory = join(resolve(userDataDirectory), 'managed-git')
  const installDirectory = join(rootDirectory, 'current')
  return Object.freeze({
    rootDirectory,
    installDirectory,
    statePath: join(installDirectory, MANAGED_GIT_STATE_FILENAME),
  })
}

export function normalizeManagedGitInstallState(value, { release = undefined } = {}) {
  if (NORMALIZED_INSTALL_STATES.has(value)) {
    if (release !== undefined) assertManagedGitInstallStateMatchesRelease(value, normalizeManagedGitRelease(release))
    return value
  }
  assertExactKeys(value, new Set(['schemaVersion', 'releaseId', 'platform', 'arch', 'version', 'archiveSha256', 'executablePath', 'executableSha256', 'executableBytes', 'installedAt']), 'managed Git install state')
  if (value.schemaVersion !== MANAGED_GIT_INSTALL_STATE_SCHEMA_VERSION) {
    throw new TypeError('managed Git install state schema is invalid')
  }
  if (typeof value.releaseId !== 'string' || !RELEASE_ID_PATTERN.test(value.releaseId) || value.releaseId.length > 120) {
    throw new TypeError('managed Git install state release id is invalid')
  }
  if (value.platform !== 'win32' || !ARCH_SET.has(value.arch)) throw new TypeError('managed Git install state platform is invalid')
  const version = normalizedGitVersion(value.version, 'managed Git install state version')
  const archiveSha256 = normalizedSha256(value.archiveSha256, 'managed Git install state archive digest')
  const executablePath = normalizedRelativePath(value.executablePath, 'managed Git install state executable path')
  if (executablePath.split('/').at(-1).toLowerCase() !== 'git.exe') {
    throw new TypeError('managed Git install state executable path is invalid')
  }
  const executableSha256 = normalizedSha256(value.executableSha256, 'managed Git install state executable digest')
  const executableBytes = normalizedArchiveBytes(value.executableBytes, 'managed Git install state executable bytes', MANAGED_GIT_ARCHIVE_LIMITS.entryBytes)
  if (typeof value.installedAt !== 'string' || Number.isNaN(Date.parse(value.installedAt)) || new Date(value.installedAt).toISOString() !== value.installedAt) {
    throw new TypeError('managed Git install state installedAt is invalid')
  }
  const normalized = Object.freeze({
    schemaVersion: MANAGED_GIT_INSTALL_STATE_SCHEMA_VERSION,
    releaseId: value.releaseId,
    platform: 'win32',
    arch: value.arch,
    version,
    archiveSha256,
    executablePath,
    executableSha256,
    executableBytes,
    installedAt: value.installedAt,
  })
  if (release !== undefined) assertManagedGitInstallStateMatchesRelease(normalized, normalizeManagedGitRelease(release))
  NORMALIZED_INSTALL_STATES.add(normalized)
  return normalized
}

function assertManagedGitInstallStateMatchesRelease(state, expected) {
  if (
    state.releaseId !== expected.id
    || state.platform !== expected.platform
    || state.arch !== expected.arch
    || state.version !== expected.version
    || state.archiveSha256 !== expected.archive.sha256
    || state.executablePath !== expected.git.executablePath
    || state.executableSha256 !== expected.git.sha256
    || state.executableBytes !== expected.git.bytes
  ) {
    throw new TypeError('managed Git install state does not match its pinned release')
  }
}

/** Build the metadata that travels atomically with the installed directory. */
export function createManagedGitInstallState(release, { now = () => new Date() } = {}) {
  const normalizedRelease = normalizeManagedGitRelease(release)
  if (typeof now !== 'function') throw new TypeError('managed Git now must be a function')
  const time = now()
  if (!(time instanceof Date) || Number.isNaN(time.valueOf())) throw new TypeError('managed Git now must return a valid Date')
  return normalizeManagedGitInstallState({
    schemaVersion: MANAGED_GIT_INSTALL_STATE_SCHEMA_VERSION,
    releaseId: normalizedRelease.id,
    platform: normalizedRelease.platform,
    arch: normalizedRelease.arch,
    version: normalizedRelease.version,
    archiveSha256: normalizedRelease.archive.sha256,
    executablePath: normalizedRelease.git.executablePath,
    executableSha256: normalizedRelease.git.sha256,
    executableBytes: normalizedRelease.git.bytes,
    installedAt: time.toISOString(),
  }, { release: normalizedRelease })
}

/** Read only a schema-checked state record rooted in the current user-data install. */
export async function readManagedGitInstallState({
  userDataDirectory,
  release = undefined,
  readFile = nodeFs.readFile,
} = {}) {
  if (typeof readFile !== 'function') throw new TypeError('managed Git state readFile must be a function')
  const paths = managedGitPaths(userDataDirectory)
  let parsed
  try {
    parsed = JSON.parse(await readFile(paths.statePath, 'utf8'))
  } catch (cause) {
    throw managedGitError('MANAGED_GIT_STATE_UNAVAILABLE', 'managed Git install state could not be read', cause)
  }
  try {
    return normalizeManagedGitInstallState(parsed, { release })
  } catch (cause) {
    throw managedGitError('MANAGED_GIT_STATE_INVALID', 'managed Git install state is invalid', cause)
  }
}

function normalizedProbeTimeout(value) {
  if (!Number.isInteger(value) || value < 25 || value > MAX_GIT_PROBE_TIMEOUT_MS) {
    throw new TypeError(`managed Git probe timeout must be an integer between 25 and ${MAX_GIT_PROBE_TIMEOUT_MS} milliseconds`)
  }
  return value
}

function parseGitVersion(output) {
  const match = /(?:^|\r?\n)git version ([0-9][0-9A-Za-z.-]{0,79})(?:\r?\n|$)/iu.exec(output)
  if (match === null || !GIT_VERSION_PATTERN.test(match[1])) return null
  return match[1]
}

function appendBounded(current, chunk) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  if (current.length + bytes.length > MAX_GIT_PROBE_OUTPUT_BYTES) {
    return Object.freeze({ value: current, exceeded: true })
  }
  return Object.freeze({ value: Buffer.concat([current, bytes]), exceeded: false })
}

function resultUnavailable(reason) {
  return Object.freeze({ available: false, reason })
}

/**
 * Execute only `git --version`, with an output and wall-clock bound. No shell
 * is involved, which keeps both the system probe and staged binary check from
 * interpreting an executable path as a command line.
 */
export async function probeGitExecutable({
  executable,
  spawn = nodeSpawn,
  timeoutMs = MANAGED_GIT_PROBE_TIMEOUT_MS,
} = {}) {
  if (typeof executable !== 'string' || executable.length === 0 || executable.length > 4_096 || executable.includes('\0') || (executable !== 'git' && !isAbsolute(executable))) {
    throw new TypeError('managed Git executable is invalid')
  }
  if (typeof spawn !== 'function') throw new TypeError('managed Git spawn must be a function')
  const boundedTimeout = normalizedProbeTimeout(timeoutMs)

  return new Promise((resolveProbe) => {
    let settled = false
    let timedOut = false
    let outputLimitExceeded = false
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let child
    let timeout
    let hardTimeout
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(hardTimeout)
      resolveProbe(Object.freeze(result))
    }
    const terminate = () => {
      try {
        child?.kill?.()
      } catch {
        // A process that already exited needs no further action.
      }
    }

    try {
      child = spawn(executable, ['--version'], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (cause) {
      finish(resultUnavailable(cause?.code === 'ENOENT' ? 'not-found' : 'spawn-failed'))
      return
    }
    if (!child || typeof child.once !== 'function') {
      finish(resultUnavailable('spawn-failed'))
      return
    }

    const append = (destination, chunk) => {
      const result = appendBounded(destination, chunk)
      if (result.exceeded) {
        outputLimitExceeded = true
        terminate()
      }
      return result.value
    }
    child.stdout?.on?.('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr?.on?.('data', (chunk) => { stderr = append(stderr, chunk) })
    child.once('error', (error) => {
      if (timedOut) {
        finish(resultUnavailable('timeout'))
        return
      }
      finish(resultUnavailable(error?.code === 'ENOENT' ? 'not-found' : 'spawn-failed'))
    })
    child.once('close', (code) => {
      if (timedOut) {
        finish(resultUnavailable('timeout'))
        return
      }
      if (outputLimitExceeded) {
        finish(resultUnavailable('output-limit'))
        return
      }
      if (code !== 0) {
        finish(resultUnavailable('exit-nonzero'))
        return
      }
      const version = parseGitVersion(stdout.toString('utf8'))
      if (version === null) {
        finish(resultUnavailable('invalid-version-output'))
        return
      }
      // Read stderr so a hostile binary cannot emit unbounded data, but do not
      // return it: it is not trusted diagnostic content.
      void stderr
      finish({ available: true, version })
    })
    timeout = setTimeout(() => {
      timedOut = true
      terminate()
      hardTimeout = setTimeout(() => finish(resultUnavailable('timeout')), PROBE_KILL_GRACE_MS)
    }, boundedTimeout)
  })
}

/** Probe only the normal OS command lookup; it does not alter PATH or install anything. */
export function probeSystemGit(options = {}) {
  return probeGitExecutable({ ...options, executable: 'git' })
}

async function verifyPinnedManagedGitFile({
  filePath,
  expectedSha256,
  expectedBytes,
  createReadStream,
  createHash,
  label,
  unavailableCode,
  sizeMismatchCode,
  hashMismatchCode,
  maximumBytes = MANAGED_GIT_ARCHIVE_LIMITS.archiveBytes,
}) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new TypeError(`${label} path must be absolute`)
  const digest = normalizedSha256(expectedSha256, `${label} expected digest`)
  const bytesExpected = normalizedArchiveBytes(expectedBytes, `${label} expected bytes`, maximumBytes)
  if (typeof createReadStream !== 'function' || typeof createHash !== 'function') {
    throw new TypeError(`${label} verification dependencies are invalid`)
  }
  let stream
  let hash
  try {
    stream = createReadStream(filePath)
    hash = createHash('sha256')
    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function' || !hash || typeof hash.update !== 'function' || typeof hash.digest !== 'function') {
      throw new TypeError(`${label} verification dependencies are invalid`)
    }
  } catch (cause) {
    throw managedGitError(unavailableCode, `${label} could not be opened`, cause)
  }
  let bytes = 0
  try {
    for await (const chunk of stream) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += data.byteLength
      if (bytes > bytesExpected) {
        stream.destroy?.()
        throw managedGitError(sizeMismatchCode, `${label} byte count does not match its pinned manifest`)
      }
      hash.update(data)
    }
  } catch (cause) {
    if (cause?.code?.startsWith?.('MANAGED_GIT_')) throw cause
    throw managedGitError(unavailableCode, `${label} could not be read`, cause)
  }
  const actual = hash.digest('hex')
  if (bytes !== bytesExpected) {
    throw managedGitError(sizeMismatchCode, `${label} byte count does not match its pinned manifest`)
  }
  if (actual !== digest) {
    throw managedGitError(hashMismatchCode, `${label} checksum does not match its pinned manifest`)
  }
  return Object.freeze({ filePath, bytes, sha256: actual })
}

/** Stream and verify the exact byte count and SHA-256 pinned by a manifest release. */
export async function verifyManagedGitArchive({
  archivePath,
  expectedSha256,
  expectedBytes,
  createReadStream = nodeCreateReadStream,
  createHash = nodeCreateHash,
} = {}) {
  const result = await verifyPinnedManagedGitFile({
    filePath: archivePath,
    expectedSha256,
    expectedBytes,
    createReadStream,
    createHash,
    label: 'managed Git archive',
    unavailableCode: 'MANAGED_GIT_ARCHIVE_UNAVAILABLE',
    sizeMismatchCode: 'MANAGED_GIT_ARCHIVE_SIZE_MISMATCH',
    hashMismatchCode: 'MANAGED_GIT_ARCHIVE_HASH_MISMATCH',
  })
  return Object.freeze({ archivePath: result.filePath, bytes: result.bytes, sha256: result.sha256 })
}

function normalizeZipLimits(value) {
  if (!isRecord(value)) throw new TypeError('managed Git ZIP limits must be an object')
  const keys = ['archiveBytes', 'entries', 'entryBytes', 'totalBytes', 'compressionRatio']
  for (const key of keys) {
    if (!Number.isSafeInteger(value[key]) || value[key] <= 0) throw new TypeError(`managed Git ZIP limit ${key} is invalid`)
  }
  if (value.archiveBytes > MANAGED_GIT_ARCHIVE_LIMITS.archiveBytes || value.entries > MANAGED_GIT_ARCHIVE_LIMITS.entries
    || value.entryBytes > MANAGED_GIT_ARCHIVE_LIMITS.entryBytes || value.totalBytes > MANAGED_GIT_ARCHIVE_LIMITS.totalBytes
    || value.compressionRatio > MANAGED_GIT_ARCHIVE_LIMITS.compressionRatio) {
    throw new TypeError('managed Git ZIP limits cannot exceed the built-in maximums')
  }
  return Object.freeze({
    archiveBytes: value.archiveBytes,
    entries: value.entries,
    entryBytes: value.entryBytes,
    totalBytes: value.totalBytes,
    compressionRatio: value.compressionRatio,
  })
}

function normalizeZipPath(rawName) {
  if (!Buffer.isBuffer(rawName) || rawName.length === 0 || rawName.length > 1_024) {
    throw new TypeError('managed Git ZIP contains an invalid path')
  }
  const text = rawName.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(rawName) || text.includes('\\') || text.includes('\0') || text.includes(':') || text.startsWith('/')) {
    throw new TypeError('managed Git ZIP contains an invalid path')
  }
  const directory = text.endsWith('/')
  const trimmed = directory ? text.slice(0, -1) : text
  if (trimmed.length === 0 || trimmed.startsWith('/')) throw new TypeError('managed Git ZIP contains an invalid path')
  const segments = trimmed.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new TypeError('managed Git ZIP path traversal is not allowed')
  }
  for (const segment of segments) assertWindowsSafePathSegment(segment, 'managed Git ZIP path')
  return Object.freeze({ name: directory ? `${trimmed}/` : trimmed, key: trimmed.toLowerCase(), directory })
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new TypeError('managed Git ZIP is missing a central directory')
}

function assertSafeZipPathGraph(path, { filePaths, directoryPaths, descendantPaths }) {
  const segments = path.key.split('/')
  for (let index = 1; index < segments.length; index += 1) {
    const parent = segments.slice(0, index).join('/')
    if (filePaths.has(parent)) throw new TypeError(`managed Git ZIP has a file parent for ${path.name}`)
    descendantPaths.add(parent)
  }
  if (path.directory) {
    if (filePaths.has(path.key)) throw new TypeError(`managed Git ZIP has conflicting entries for ${path.name}`)
    directoryPaths.add(path.key)
    return
  }
  if (directoryPaths.has(path.key) || descendantPaths.has(path.key)) {
    throw new TypeError(`managed Git ZIP has conflicting entries for ${path.name}`)
  }
  filePaths.add(path.key)
}

/**
 * Inspect central-directory metadata before decompression. This rejects ZIP64,
 * encrypted entries, symlinks, path traversal, duplicate Windows paths, and
 * resource-exhaustion layouts before fflate is allowed to allocate payloads.
 */
export function inspectManagedGitZip(raw, limits = MANAGED_GIT_ARCHIVE_LIMITS) {
  if (!(Buffer.isBuffer(raw) || raw instanceof Uint8Array)) throw new TypeError('managed Git ZIP bytes are invalid')
  const policy = normalizeZipLimits(limits)
  const buffer = Buffer.from(raw)
  if (buffer.length === 0 || buffer.length > policy.archiveBytes) throw new TypeError('managed Git ZIP size is invalid')
  const endOffset = findEndOfCentralDirectory(buffer)
  const disk = buffer.readUInt16LE(endOffset + 4)
  const centralDisk = buffer.readUInt16LE(endOffset + 6)
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8)
  const entryCount = buffer.readUInt16LE(endOffset + 10)
  const centralSize = buffer.readUInt32LE(endOffset + 12)
  const centralOffset = buffer.readUInt32LE(endOffset + 16)
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount === 0 || entryCount > policy.entries) {
    throw new TypeError('managed Git ZIP uses unsupported multi-disk or entry metadata')
  }
  if (centralOffset + centralSize > endOffset || centralOffset < 0) throw new TypeError('managed Git ZIP central directory is out of bounds')

  let offset = centralOffset
  let totalBytes = 0
  const entries = []
  const names = new Set()
  const filePaths = new Set()
  const directoryPaths = new Set()
  const descendantPaths = new Set()
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new TypeError('managed Git ZIP central directory is malformed')
    }
    const madeBy = buffer.readUInt16LE(offset + 4)
    const flags = buffer.readUInt16LE(offset + 8)
    const compression = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const externalAttributes = buffer.readUInt32LE(offset + 38)
    const localOffset = buffer.readUInt32LE(offset + 42)
    if ([compressedSize, size, localOffset].includes(0xffffffff)) throw new TypeError('managed Git ZIP64 archives are not supported')
    if ((flags & ~0x0808) !== 0 || (flags & 0x1) !== 0 || ![0, 8].includes(compression)) {
      throw new TypeError('managed Git ZIP encrypted or unsupported entries are not allowed')
    }
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd + extraLength + commentLength > buffer.length) throw new TypeError('managed Git ZIP entry metadata is out of bounds')
    const path = normalizeZipPath(buffer.subarray(nameStart, nameEnd))
    if (names.has(path.key)) throw new TypeError(`managed Git ZIP contains duplicate entry ${path.name}`)
    names.add(path.key)
    assertSafeZipPathGraph(path, { filePaths, directoryPaths, descendantPaths })

    const unixMode = externalAttributes >>> 16
    const unixType = unixMode & 0xf000
    if ((madeBy >>> 8) === 3 && unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000) {
      throw new TypeError(`managed Git ZIP contains a symbolic link or special file: ${path.name}`)
    }
    if (path.directory && unixType !== 0 && unixType !== 0x4000) {
      throw new TypeError(`managed Git ZIP directory metadata is invalid: ${path.name}`)
    }
    if (!path.directory && unixType === 0x4000) {
      throw new TypeError(`managed Git ZIP file metadata is invalid: ${path.name}`)
    }
    if (path.directory && (externalAttributes & 0x10) === 0 && (madeBy >>> 8) !== 3) {
      throw new TypeError(`managed Git ZIP directory metadata is invalid: ${path.name}`)
    }
    if (size > policy.entryBytes) throw new TypeError(`managed Git ZIP entry exceeds the size limit: ${path.name}`)
    totalBytes += size
    if (totalBytes > policy.totalBytes) throw new TypeError('managed Git ZIP expands beyond the total size limit')
    if (size > 64 * 1024 && (compressedSize === 0 || size / compressedSize > policy.compressionRatio)) {
      throw new TypeError(`managed Git ZIP entry has an unsafe compression ratio: ${path.name}`)
    }

    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new TypeError(`managed Git ZIP local header is invalid for ${path.name}`)
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6)
    const localCompression = buffer.readUInt16LE(localOffset + 8)
    const localCompressedSize = buffer.readUInt32LE(localOffset + 18)
    const localSize = buffer.readUInt32LE(localOffset + 22)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const localNameStart = localOffset + 30
    const dataStart = localNameStart + localNameLength + localExtraLength
    if (localFlags !== flags || localCompression !== compression || dataStart + compressedSize > centralOffset) {
      throw new TypeError(`managed Git ZIP local header is invalid for ${path.name}`)
    }
    if ((flags & 0x8) === 0 && (localCompressedSize !== compressedSize || localSize !== size)) {
      throw new TypeError(`managed Git ZIP local header sizes disagree for ${path.name}`)
    }
    const localPath = normalizeZipPath(buffer.subarray(localNameStart, localNameStart + localNameLength))
    if (localPath.name !== path.name) throw new TypeError(`managed Git ZIP header names disagree for ${path.name}`)
    entries.push(Object.freeze({ name: path.name, compressedSize, size, directory: path.directory }))
    offset = nameEnd + extraLength + commentLength
  }
  if (offset !== centralOffset + centralSize) throw new TypeError('managed Git ZIP central directory length is invalid')
  return Object.freeze(entries)
}

function safeJoin(root, relativePath, label) {
  const target = resolve(root, ...relativePath.split('/'))
  const difference = relative(resolve(root), target)
  if (difference === '' || difference.startsWith('..') || isAbsolute(difference)) {
    throw new TypeError(`${label} escapes its managed Git directory`)
  }
  return target
}

function managedGitArchiveRootPrefix(release) {
  return release.archive.rootDirectory === '.' ? '' : `${release.archive.rootDirectory}/`
}

function assertManagedGitArchiveLayout(entries, release) {
  const rootPrefix = managedGitArchiveRootPrefix(release)
  const expectedExecutable = `${rootPrefix}${release.git.executablePath}`
  let executableFound = false
  for (const entry of entries) {
    if (rootPrefix !== '' && entry.name === rootPrefix) continue
    if (rootPrefix !== '' && !entry.name.startsWith(rootPrefix)) {
      throw managedGitError('MANAGED_GIT_ARCHIVE_LAYOUT_INVALID', 'managed Git ZIP contains files outside its pinned root directory')
    }
    const relativePath = entry.name.slice(rootPrefix.length)
    if (relativePath.split('/').some((segment) => segment.toLowerCase() === MANAGED_GIT_STATE_FILENAME.toLowerCase())) {
      throw managedGitError('MANAGED_GIT_ARCHIVE_LAYOUT_INVALID', 'managed Git ZIP attempts to provide Desktop install metadata')
    }
    if (!entry.directory && entry.name === expectedExecutable) executableFound = true
  }
  if (!executableFound) {
    throw managedGitError('MANAGED_GIT_ARCHIVE_LAYOUT_INVALID', 'managed Git ZIP is missing its pinned git executable')
  }
}

async function extractManagedGitZip({ raw, entries, release, destinationDirectory, fs }) {
  assertManagedGitArchiveLayout(entries, release)
  let unzipped
  try {
    unzipped = unzipSync(new Uint8Array(raw))
  } catch (cause) {
    throw managedGitError('MANAGED_GIT_ARCHIVE_INVALID', 'managed Git ZIP decompression failed', cause)
  }
  const fileEntries = entries.filter((entry) => !entry.directory)
  const expectedEntries = new Map(entries.map((entry) => [entry.name, entry]))
  for (const name of Object.keys(unzipped)) {
    const entry = expectedEntries.get(name)
    if (entry === undefined) {
      throw managedGitError('MANAGED_GIT_ARCHIVE_INVALID', 'managed Git ZIP decompression produced an unexpected entry')
    }
    // fflate materializes explicit empty directory entries while other ZIPs
    // omit them. Both are safe after central-directory validation, but a
    // directory must never materialize payload bytes that extraction ignores.
    if (entry.directory && (!(unzipped[name] instanceof Uint8Array) || unzipped[name].byteLength !== 0)) {
      throw managedGitError('MANAGED_GIT_ARCHIVE_INVALID', 'managed Git ZIP decompression produced invalid directory data')
    }
  }
  await fs.mkdir(destinationDirectory, { recursive: true })
  const rootPrefix = managedGitArchiveRootPrefix(release)
  for (const entry of fileEntries) {
    const bytes = unzipped[entry.name]
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== entry.size) {
      throw managedGitError('MANAGED_GIT_ARCHIVE_INVALID', `managed Git ZIP decompression did not match ${entry.name}`)
    }
    const relativePath = entry.name.slice(rootPrefix.length)
    const destination = safeJoin(destinationDirectory, relativePath, 'managed Git ZIP entry')
    await fs.mkdir(dirname(destination), { recursive: true })
    await fs.writeFile(destination, bytes, { flag: 'wx' })
  }
}

function normalizedInstallRelease(value) {
  return NORMALIZED_RELEASES.has(value) ? value : normalizeManagedGitRelease(value)
}

async function replaceManagedGitDirectory({ paths, stagedInstallDirectory, stagingDirectory, fs }) {
  const stageName = basename(stagingDirectory)
  if (!stageName.startsWith('.stage-')) throw new TypeError('managed Git staging directory is invalid')
  const previousDirectory = join(paths.rootDirectory, `.previous-${stageName.slice('.stage-'.length)}`)
  let previousExists = false
  try {
    await renameManagedGitDirectory(fs, paths.installDirectory, previousDirectory)
    previousExists = true
  } catch (cause) {
    if (cause?.code !== 'ENOENT') {
      throw managedGitError('MANAGED_GIT_ATOMIC_SWAP_FAILED', 'managed Git existing install could not be staged for replacement', cause)
    }
  }
  try {
    await renameManagedGitDirectory(fs, stagedInstallDirectory, paths.installDirectory)
  } catch (cause) {
    if (previousExists) {
      try {
        await renameManagedGitDirectory(fs, previousDirectory, paths.installDirectory)
      } catch (restoreCause) {
        const error = managedGitError('MANAGED_GIT_ATOMIC_SWAP_FAILED', 'managed Git replacement failed and the previous install could not be restored', cause)
        error.restoreCause = restoreCause
        throw error
      }
    }
    throw managedGitError('MANAGED_GIT_ATOMIC_SWAP_FAILED', 'managed Git replacement could not be activated', cause)
  }
  // Retain the previous directory instead of recursively deleting it. Besides
  // making failure recovery possible, this avoids treating an existing
  // user-data directory as an installer-owned destructive cleanup target.
  return previousExists ? previousDirectory : null
}

async function renameManagedGitDirectory(fs, source, destination) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(source, destination)
      return
    } catch (error) {
      const retryDelay = MANAGED_GIT_RENAME_RETRY_DELAYS_MS[attempt]
      if (retryDelay === undefined || !RETRIABLE_RENAME_ERROR_CODES.has(error?.code)) throw error
      await delay(retryDelay)
    }
  }
}

function assertFsDependencies(fs, required) {
  if (!isRecord(fs) || required.some((name) => typeof fs[name] !== 'function')) {
    throw new TypeError('managed Git filesystem dependencies are invalid')
  }
}

/**
 * Install a previously downloaded archive into a user-data-scoped directory.
 * The archive is copied to a private staging directory, hash-checked, ZIP-
 * checked, extracted, and exercised with `git --version` before one rename
 * makes it current. This routine never downloads, changes PATH, or talks to
 * Electron.
 */
export async function installManagedGitArchive({
  userDataDirectory,
  archivePath,
  release,
  fs = nodeFs,
  createReadStream = nodeCreateReadStream,
  spawn = nodeSpawn,
  now = () => new Date(),
  timeoutMs = MANAGED_GIT_PROBE_TIMEOUT_MS,
} = {}) {
  assertFsDependencies(fs, ['mkdir', 'mkdtemp', 'copyFile', 'readFile', 'writeFile', 'stat', 'rename', 'rm'])
  if (typeof archivePath !== 'string' || !isAbsolute(archivePath)) throw new TypeError('managed Git archive path must be absolute')
  const normalizedRelease = normalizedInstallRelease(release)
  const paths = managedGitPaths(userDataDirectory)
  await fs.mkdir(paths.rootDirectory, { recursive: true })
  let stagingDirectory
  let result
  try {
    stagingDirectory = await fs.mkdtemp(join(paths.rootDirectory, '.stage-'))
    const stagedArchive = join(stagingDirectory, 'archive.zip')
    const stagedInstallDirectory = join(stagingDirectory, 'current')
    await fs.copyFile(archivePath, stagedArchive)
    await verifyManagedGitArchive({
      archivePath: stagedArchive,
      expectedSha256: normalizedRelease.archive.sha256,
      expectedBytes: normalizedRelease.archive.bytes,
      createReadStream,
    })
    const raw = await fs.readFile(stagedArchive)
    if (raw.byteLength !== normalizedRelease.archive.bytes || nodeCreateHash('sha256').update(raw).digest('hex') !== normalizedRelease.archive.sha256) {
      throw managedGitError('MANAGED_GIT_ARCHIVE_HASH_MISMATCH', 'managed Git staged archive changed after verification')
    }
    const entries = inspectManagedGitZip(raw, {
      ...MANAGED_GIT_ARCHIVE_LIMITS,
      archiveBytes: normalizedRelease.archive.bytes,
    })
    await extractManagedGitZip({ raw, entries, release: normalizedRelease, destinationDirectory: stagedInstallDirectory, fs })
    const stagedExecutable = safeJoin(stagedInstallDirectory, normalizedRelease.git.executablePath, 'managed Git executable')
    let executableStat
    try {
      executableStat = await fs.stat(stagedExecutable)
    } catch (cause) {
      throw managedGitError('MANAGED_GIT_POST_INSTALL_VERIFICATION_FAILED', 'managed Git executable was not extracted', cause)
    }
    if (typeof executableStat?.isFile !== 'function' || !executableStat.isFile()) {
      throw managedGitError('MANAGED_GIT_POST_INSTALL_VERIFICATION_FAILED', 'managed Git executable is not a regular file')
    }
    try {
      await verifyPinnedManagedGitFile({
        filePath: stagedExecutable,
        expectedSha256: normalizedRelease.git.sha256,
        expectedBytes: normalizedRelease.git.bytes,
        createReadStream,
        createHash: nodeCreateHash,
        label: 'managed Git executable',
        unavailableCode: 'MANAGED_GIT_EXECUTABLE_UNAVAILABLE',
        sizeMismatchCode: 'MANAGED_GIT_EXECUTABLE_SIZE_MISMATCH',
        hashMismatchCode: 'MANAGED_GIT_EXECUTABLE_HASH_MISMATCH',
        maximumBytes: MANAGED_GIT_ARCHIVE_LIMITS.entryBytes,
      })
    } catch (cause) {
      throw managedGitError('MANAGED_GIT_POST_INSTALL_VERIFICATION_FAILED', 'managed Git executable does not match its pinned artifact', cause)
    }
    const probe = await probeGitExecutable({ executable: stagedExecutable, spawn, timeoutMs })
    if (!probe.available || probe.version !== normalizedRelease.version) {
      throw managedGitError('MANAGED_GIT_POST_INSTALL_VERIFICATION_FAILED', 'managed Git executable did not report its pinned version')
    }
    const state = createManagedGitInstallState(normalizedRelease, { now })
    await fs.writeFile(join(stagedInstallDirectory, MANAGED_GIT_STATE_FILENAME), `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    const previousInstallDirectory = await replaceManagedGitDirectory({
      paths,
      stagedInstallDirectory,
      stagingDirectory,
      fs,
    })
    result = Object.freeze({
      paths,
      state,
      executablePath: safeJoin(paths.installDirectory, normalizedRelease.git.executablePath, 'managed Git executable'),
      previousInstallDirectory,
    })
  } finally {
    if (stagingDirectory !== undefined) {
      try {
        await fs.rm(stagingDirectory, { recursive: true, force: true })
      } catch {
        // A failed private staging cleanup cannot invalidate an installed,
        // already post-verified current directory.
      }
    }
  }
  return result
}

/** Re-check the install state and executable before a future caller uses it. */
export async function verifyManagedGitInstall({
  userDataDirectory,
  release,
  fs = nodeFs,
  createReadStream = nodeCreateReadStream,
  spawn = nodeSpawn,
  timeoutMs = MANAGED_GIT_PROBE_TIMEOUT_MS,
} = {}) {
  assertFsDependencies(fs, ['readFile', 'stat'])
  const normalizedRelease = normalizedInstallRelease(release)
  const paths = managedGitPaths(userDataDirectory)
  const state = await readManagedGitInstallState({
    userDataDirectory,
    release: normalizedRelease,
    readFile: fs.readFile,
  })
  const executablePath = safeJoin(paths.installDirectory, state.executablePath, 'managed Git executable')
  let executableStat
  try {
    executableStat = await fs.stat(executablePath)
  } catch (cause) {
    throw managedGitError('MANAGED_GIT_INSTALL_UNAVAILABLE', 'managed Git executable could not be read', cause)
  }
  if (typeof executableStat?.isFile !== 'function' || !executableStat.isFile()) {
    throw managedGitError('MANAGED_GIT_INSTALL_UNAVAILABLE', 'managed Git executable is not a regular file')
  }
  try {
    await verifyPinnedManagedGitFile({
      filePath: executablePath,
      expectedSha256: normalizedRelease.git.sha256,
      expectedBytes: normalizedRelease.git.bytes,
      createReadStream,
      createHash: nodeCreateHash,
      label: 'managed Git executable',
      unavailableCode: 'MANAGED_GIT_EXECUTABLE_UNAVAILABLE',
      sizeMismatchCode: 'MANAGED_GIT_EXECUTABLE_SIZE_MISMATCH',
      hashMismatchCode: 'MANAGED_GIT_EXECUTABLE_HASH_MISMATCH',
      maximumBytes: MANAGED_GIT_ARCHIVE_LIMITS.entryBytes,
    })
  } catch (cause) {
    throw managedGitError('MANAGED_GIT_INSTALL_INVALID', 'managed Git executable no longer matches its pinned artifact', cause)
  }
  const probe = await probeGitExecutable({ executable: executablePath, spawn, timeoutMs })
  if (!probe.available || probe.version !== normalizedRelease.version) {
    throw managedGitError('MANAGED_GIT_INSTALL_INVALID', 'managed Git executable did not report its pinned version')
  }
  return Object.freeze({ paths, state, executablePath, version: probe.version })
}
