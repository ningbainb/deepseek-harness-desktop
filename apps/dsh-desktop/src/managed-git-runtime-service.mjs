import { createHash as nodeCreateHash } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import {
  MANAGED_GIT_ALLOWED_HOSTS,
  MANAGED_GIT_MANIFEST_SCHEMA_VERSION,
  MANAGED_GIT_PROBE_TIMEOUT_MS,
  installManagedGitArchive,
  normalizeManagedGitManifest,
  probeSystemGit,
  selectManagedGitRelease,
  verifyManagedGitArchive,
  verifyManagedGitInstall,
} from './managed-git.mjs'
import { MANAGED_GIT_MANIFEST } from './managed-git-manifest.mjs'

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])
const MAX_MANAGED_GIT_REDIRECTS = 4
const MAX_REDIRECT_URL_LENGTH = 8_192
const MAX_PATH_ENTRIES = 64

function managedGitRuntimeError(code, message, cause = undefined) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.code = code
  return error
}

function isManagedGitRuntimeError(error) {
  return typeof error?.code === 'string' && error.code.startsWith('MANAGED_GIT_')
}

function assertFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`)
  return value
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || value.includes('\0') || !isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path`)
  }
  return resolve(value)
}

function normalizeRelease(value) {
  return normalizeManagedGitManifest({
    schemaVersion: MANAGED_GIT_MANIFEST_SCHEMA_VERSION,
    releases: [value],
  }).releases[0]
}

function normalizeExistingPathEntries(value) {
  if (!Array.isArray(value) || value.length > MAX_PATH_ENTRIES) {
    throw new TypeError('runtime PATH entries must be a bounded array')
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 4_096 || entry.includes('\0')) {
      throw new TypeError('runtime PATH entry is invalid')
    }
    return entry
  }))
}

function windowsPathIdentity(value) {
  return value.replaceAll('/', '\\').replace(/\\+$/u, '').toLowerCase()
}

function assertDownloadPathInside(directory, path) {
  const root = assertAbsolutePath(directory, 'managed Git temporary directory')
  const candidate = assertAbsolutePath(path, 'managed Git downloaded archive')
  const difference = relative(root, candidate)
  if (difference === '' || difference.startsWith('..') || isAbsolute(difference)) {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_PATH_INVALID', 'managed Git downloader returned an archive outside its temporary directory')
  }
  return candidate
}

function readResponseHeader(response, name) {
  const headers = response?.headers
  if (!headers || typeof headers.get !== 'function') return undefined
  const value = headers.get(name)
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string' || value.length > 16_384) {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_RESPONSE_INVALID', 'managed Git download response header is invalid')
  }
  return value
}

function assertNotAborted(signal) {
  if (signal?.aborted === true) {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_CANCELLED', 'managed Git download was cancelled')
  }
}

function normalizeManagedGitRedirect(location, currentUrl, allowedHosts) {
  if (typeof location !== 'string' || location.length === 0 || location.length > MAX_REDIRECT_URL_LENGTH || /[\r\n\0]/u.test(location)) {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_REDIRECT_INVALID', 'managed Git download redirect is invalid')
  }
  let target
  try {
    target = new URL(location, currentUrl)
  } catch (cause) {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_REDIRECT_INVALID', 'managed Git download redirect is invalid', cause)
  }
  if (
    target.protocol !== 'https:'
    || target.username !== ''
    || target.password !== ''
    || target.port !== ''
    || target.hash !== ''
    || !allowedHosts.has(target.hostname)
    || target.pathname.length === 0
    || target.pathname.includes('\\')
    || target.pathname.includes('//')
    || /%(?:00|2f|5c)/iu.test(target.pathname)
  ) {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_REDIRECT_INVALID', 'managed Git download redirect is not an approved HTTPS asset host')
  }
  // The reviewed first-party release URL is query-free. A CDN redirect may
  // carry a short-lived server-issued signature, but GitHub itself must never
  // receive an arbitrary query controlled by this recovery service.
  if (target.hostname === 'github.com' && target.search !== '') {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_REDIRECT_INVALID', 'managed Git download redirect has an unexpected GitHub query')
  }
  return target.href
}

async function discardResponseBody(response) {
  try {
    await response?.body?.cancel?.()
  } catch {
    // A redirect body has no bearing on the pinned artifact and may already
    // be closed by the fetch implementation.
  }
}

async function fetchPinnedManagedGitArchive({
  url,
  fetchImpl,
  signal,
  allowedHosts,
  maxRedirects,
}) {
  let currentUrl = url
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    assertNotAborted(signal)
    let response
    try {
      response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal,
        headers: {
          accept: 'application/octet-stream',
          'accept-encoding': 'identity',
          'user-agent': 'DeepSeek-Harness-Desktop-Managed-Git/1',
        },
      })
    } catch (cause) {
      if (signal?.aborted === true) {
        throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_CANCELLED', 'managed Git download was cancelled', cause)
      }
      throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_UNAVAILABLE', 'managed Git archive could not be downloaded', cause)
    }
    if (!response || !Number.isInteger(response.status)) {
      throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_RESPONSE_INVALID', 'managed Git download response is invalid')
    }
    if (REDIRECT_STATUS_CODES.has(response.status)) {
      if (redirects >= maxRedirects) {
        await discardResponseBody(response)
        throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_REDIRECT_LIMIT', 'managed Git download followed too many redirects')
      }
      const location = readResponseHeader(response, 'location')
      await discardResponseBody(response)
      currentUrl = normalizeManagedGitRedirect(location, currentUrl, allowedHosts)
      continue
    }
    if (response.status !== 200) {
      await discardResponseBody(response)
      throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_HTTP_STATUS', 'managed Git archive download returned an unexpected HTTP status')
    }
    if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
      throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_RESPONSE_INVALID', 'managed Git download response has no readable body')
    }
    return response
  }
  throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_REDIRECT_LIMIT', 'managed Git download followed too many redirects')
}

function assertContentLength(response, expectedBytes) {
  const contentEncoding = readResponseHeader(response, 'content-encoding')
  if (contentEncoding !== undefined && contentEncoding.trim().toLowerCase() !== 'identity') {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_RESPONSE_INVALID', 'managed Git archive response encoding is not identity')
  }
  const rawLength = readResponseHeader(response, 'content-length')
  if (rawLength === undefined) return
  if (!/^(?:0|[1-9][0-9]*)$/u.test(rawLength)) {
    throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_RESPONSE_INVALID', 'managed Git archive response length is invalid')
  }
  const declared = Number(rawLength)
  if (!Number.isSafeInteger(declared) || declared !== expectedBytes) {
    throw managedGitRuntimeError('MANAGED_GIT_ARCHIVE_SIZE_MISMATCH', 'managed Git archive response size does not match its pinned manifest')
  }
}

/**
 * Download one already-selected, pinned archive into a caller-owned temporary
 * directory. Redirects stay on the small GitHub release/CDN allowlist, bytes
 * stream directly to disk, and the archive must exactly match the reviewed
 * size and SHA-256 before its path is returned.
 */
export async function downloadManagedGitArchive({
  release,
  destinationDirectory,
  fetchImpl = globalThis.fetch,
  fs = nodeFs,
  createHash = nodeCreateHash,
  signal = undefined,
  maxRedirects = MAX_MANAGED_GIT_REDIRECTS,
} = {}) {
  const normalizedRelease = normalizeRelease(release)
  const directory = assertAbsolutePath(destinationDirectory, 'managed Git temporary directory')
  if (typeof fetchImpl !== 'function') throw new TypeError('managed Git fetch implementation must be a function')
  if (!fs || typeof fs.mkdir !== 'function' || typeof fs.open !== 'function' || typeof fs.rm !== 'function') {
    throw new TypeError('managed Git download filesystem dependencies are invalid')
  }
  if (typeof createHash !== 'function') throw new TypeError('managed Git download hash factory must be a function')
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 8) {
    throw new TypeError('managed Git download redirect limit is invalid')
  }
  const hostSet = new Set(MANAGED_GIT_ALLOWED_HOSTS)
  assertNotAborted(signal)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const archivePath = join(directory, 'archive.zip')
  let handle
  let createdArchive = false
  let response
  try {
    response = await fetchPinnedManagedGitArchive({
      url: normalizedRelease.archive.url,
      fetchImpl,
      signal,
      allowedHosts: hostSet,
      maxRedirects,
    })
    assertContentLength(response, normalizedRelease.archive.bytes)
    try {
      handle = await fs.open(archivePath, 'wx', 0o600)
      createdArchive = true
    } catch (cause) {
      throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_WRITE_FAILED', 'managed Git temporary archive could not be created', cause)
    }
    let hash
    try {
      hash = createHash('sha256')
      if (!hash || typeof hash.update !== 'function' || typeof hash.digest !== 'function') throw new TypeError('hash is invalid')
    } catch (cause) {
      throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_WRITE_FAILED', 'managed Git archive hash could not be initialized', cause)
    }
    let bytes = 0
    try {
      for await (const chunk of response.body) {
        assertNotAborted(signal)
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += data.byteLength
        if (bytes > normalizedRelease.archive.bytes) {
          throw managedGitRuntimeError('MANAGED_GIT_ARCHIVE_SIZE_MISMATCH', 'managed Git archive exceeds its pinned byte count')
        }
        hash.update(data)
        await handle.write(data)
      }
      assertNotAborted(signal)
    } catch (cause) {
      if (isManagedGitRuntimeError(cause)) throw cause
      if (signal?.aborted === true) {
        throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_CANCELLED', 'managed Git download was cancelled', cause)
      }
      throw managedGitRuntimeError('MANAGED_GIT_DOWNLOAD_UNAVAILABLE', 'managed Git archive could not be read while downloading', cause)
    }
    if (bytes !== normalizedRelease.archive.bytes) {
      throw managedGitRuntimeError('MANAGED_GIT_ARCHIVE_SIZE_MISMATCH', 'managed Git archive byte count does not match its pinned manifest')
    }
    const sha256 = hash.digest('hex')
    if (sha256 !== normalizedRelease.archive.sha256) {
      throw managedGitRuntimeError('MANAGED_GIT_ARCHIVE_HASH_MISMATCH', 'managed Git archive checksum does not match its pinned manifest')
    }
    await handle.close()
    handle = undefined
    return Object.freeze({ archivePath, bytes, sha256 })
  } catch (error) {
    await discardResponseBody(response)
    try {
      await handle?.close()
    } catch {
      // The temporary file is removed below even if closing it raced with the
      // network failure.
    }
    if (createdArchive) await fs.rm(archivePath, { force: true }).catch(() => {})
    throw error
  }
}

/**
 * Returns a new, Windows-case-insensitive-deduplicated list that makes the
 * verified managed cmd directory win over normal Runtime bins. It never
 * writes process.env, the registry, or a user/system PATH setting.
 */
export function prependManagedGitPathEntry(executablePath, pathEntries = []) {
  const executable = assertAbsolutePath(executablePath, 'managed Git executable')
  const existing = normalizeExistingPathEntries(pathEntries)
  const commandDirectory = dirname(executable)
  const seen = new Set([windowsPathIdentity(commandDirectory)])
  const entries = [commandDirectory]
  for (const entry of existing) {
    const identity = windowsPathIdentity(entry)
    if (seen.has(identity)) continue
    seen.add(identity)
    entries.push(entry)
  }
  return Object.freeze(entries)
}

function normalizeSystemGitProbe(value) {
  if (value?.available === true && typeof value.version === 'string' && value.version.length > 0 && value.version.length <= 80) {
    return Object.freeze({ available: true, version: value.version })
  }
  if (value?.available === false && typeof value.reason === 'string' && value.reason.length > 0 && value.reason.length <= 80) {
    return Object.freeze({ available: false, reason: value.reason })
  }
  throw new TypeError('managed Git system probe result is invalid')
}

function resultWithEntries(result, pathEntries) {
  return Object.freeze({ ...result, pathEntries: Object.freeze(pathEntries) })
}

/**
 * Main-process-only managed Git orchestrator. The caller supplies native
 * confirmation; this module has no renderer IPC and cannot receive a URL,
 * hash, install path, or command from a renderer.
 */
export function createManagedGitRuntimeService({
  userDataDirectory,
  bundledGitDirectory = undefined,
  manifest = MANAGED_GIT_MANIFEST,
  platform = process.platform,
  arch = process.arch,
  confirm,
  probeSystemGitFn = probeSystemGit,
  verifyManagedGitInstallFn = verifyManagedGitInstall,
  verifyManagedGitArchiveFn = verifyManagedGitArchive,
  installManagedGitArchiveFn = installManagedGitArchive,
  downloadManagedGitArchiveFn = downloadManagedGitArchive,
  mkdtempFn = nodeFs.mkdtemp,
  rmFn = nodeFs.rm,
  temporaryDirectory = tmpdir(),
  spawn = undefined,
  timeoutMs = MANAGED_GIT_PROBE_TIMEOUT_MS,
  now = undefined,
} = {}) {
  const normalizedUserDataDirectory = assertAbsolutePath(userDataDirectory, 'managed Git user-data directory')
  const normalizedBundledGitDirectory = bundledGitDirectory === undefined
    ? undefined
    : assertAbsolutePath(bundledGitDirectory, 'bundled Git directory')
  const normalizedTemporaryDirectory = assertAbsolutePath(temporaryDirectory, 'managed Git temporary base directory')
  const normalizedManifest = normalizeManagedGitManifest(manifest)
  if (typeof platform !== 'string' || typeof arch !== 'string') throw new TypeError('managed Git platform and architecture are required')
  const release = selectManagedGitRelease(normalizedManifest, { platform, arch })
  const confirmRepair = assertFunction(confirm, 'managed Git confirmation')
  const systemProbe = assertFunction(probeSystemGitFn, 'managed Git system probe')
  const verifyInstall = assertFunction(verifyManagedGitInstallFn, 'managed Git install verifier')
  const verifyArchive = assertFunction(verifyManagedGitArchiveFn, 'managed Git archive verifier')
  const installArchive = assertFunction(installManagedGitArchiveFn, 'managed Git archive installer')
  const downloadArchive = assertFunction(downloadManagedGitArchiveFn, 'managed Git archive downloader')
  const createTemporaryDirectory = assertFunction(mkdtempFn, 'managed Git temporary directory creator')
  const remove = assertFunction(rmFn, 'managed Git temporary directory remover')
  let activeRepair

  const inspect = async (pathEntries = []) => {
    const existingEntries = normalizeExistingPathEntries(pathEntries)
    if (release !== null && normalizedBundledGitDirectory !== undefined) {
      try {
        const installed = await verifyInstall({
          userDataDirectory: normalizedBundledGitDirectory,
          release,
          spawn,
          timeoutMs,
        })
        const executablePath = assertAbsolutePath(installed?.executablePath, 'verified bundled Git executable')
        return resultWithEntries({
          status: 'bundled-git-available',
          source: 'bundled',
          version: installed.version,
          executablePath,
        }, prependManagedGitPathEntry(executablePath, existingEntries))
      } catch {
        // A damaged package resource cannot become process-global authority.
        // Continue to the existing system/user-managed fallbacks so Recovery
        // Shell remains usable and can offer a verified replacement download.
      }
    }
    let systemGit
    try {
      systemGit = normalizeSystemGitProbe(await systemProbe({ spawn, timeoutMs }))
    } catch (cause) {
      throw managedGitRuntimeError('MANAGED_GIT_SYSTEM_PROBE_FAILED', 'system Git availability could not be determined', cause)
    }
    if (systemGit.available) {
      return resultWithEntries({
        status: 'system-git-available',
        source: 'system',
        version: systemGit.version,
      }, existingEntries)
    }
    if (release === null) {
      return resultWithEntries({
        status: 'managed-git-unsupported',
        source: 'unavailable',
        reason: 'unsupported-platform',
      }, existingEntries)
    }
    try {
      const installed = await verifyInstall({
        userDataDirectory: normalizedUserDataDirectory,
        release,
        spawn,
        timeoutMs,
      })
      const executablePath = assertAbsolutePath(installed?.executablePath, 'verified managed Git executable')
      return resultWithEntries({
        status: 'managed-git-available',
        source: 'managed',
        version: installed.version,
        executablePath,
      }, prependManagedGitPathEntry(executablePath, existingEntries))
    } catch {
      return resultWithEntries({
        status: 'managed-git-needed',
        source: 'unavailable',
        reason: systemGit.reason,
      }, existingEntries)
    }
  }

  const performRepair = async (pathEntries = []) => {
    const initial = await inspect(pathEntries)
    if (initial.status !== 'managed-git-needed') return initial
    const accepted = await confirmRepair(Object.freeze({
      releaseId: release.id,
      version: release.version,
      archiveBytes: release.archive.bytes,
    }))
    if (accepted !== true) {
      return resultWithEntries({
        status: 'managed-git-cancelled',
        source: 'unavailable',
        reason: 'user-cancelled',
      }, initial.pathEntries)
    }
    let stagingDirectory
    try {
      stagingDirectory = await createTemporaryDirectory(join(normalizedTemporaryDirectory, 'dsh-managed-git-download-'))
      const directory = assertAbsolutePath(stagingDirectory, 'managed Git temporary directory')
      const downloaded = await downloadArchive({ release, destinationDirectory: directory })
      const archivePath = assertDownloadPathInside(directory, downloaded?.archivePath)
      await verifyArchive({
        archivePath,
        expectedSha256: release.archive.sha256,
        expectedBytes: release.archive.bytes,
      })
      const installed = await installArchive({
        userDataDirectory: normalizedUserDataDirectory,
        archivePath,
        release,
        spawn,
        timeoutMs,
        ...(now === undefined ? {} : { now }),
      })
      const executablePath = assertAbsolutePath(installed?.executablePath, 'installed managed Git executable')
      return resultWithEntries({
        status: 'managed-git-installed',
        source: 'managed',
        version: release.version,
        executablePath,
      }, prependManagedGitPathEntry(executablePath, initial.pathEntries))
    } finally {
      if (stagingDirectory !== undefined) {
        await remove(stagingDirectory, { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  const repair = (pathEntries = []) => {
    if (activeRepair !== undefined) return activeRepair
    let operation
    operation = performRepair(pathEntries).finally(() => {
      if (activeRepair === operation) activeRepair = undefined
    })
    activeRepair = operation
    return operation
  }

  return Object.freeze({
    inspect,
    repair,
  })
}
