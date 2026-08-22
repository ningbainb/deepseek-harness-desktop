import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

import semver from 'semver'

export const RUNTIME_MATRIX_STATUSES = Object.freeze(['known-good', 'supported', 'candidate', 'blocked'])
export const STABLE_RUNTIME_MATRIX_STATUSES = Object.freeze(['known-good', 'supported'])
// These are the small executable identity surface that Desktop launches from
// the unpacked Runtime. The support artifacts carry their byte digests so an
// altered same-version CLI cannot be admitted merely by reporting its version.
export const RUNTIME_PROVENANCE_FILES = Object.freeze(['package.json', 'lib/bin.js'])

const MATRIX_STATUS_SET = new Set(RUNTIME_MATRIX_STATUSES)
const STABLE_STATUS_SET = new Set(STABLE_RUNTIME_MATRIX_STATUSES)
// The file reader returns a validated, immutable projection. Keep an internal
// identity marker so assessment does not mistake that projection for raw JSON
// and attempt to parse its intentionally flattened evidence a second time.
const NORMALIZED_RUNTIME_MATRICES = new WeakSet()
const RUNTIME_SUPPORT_LOG_REASONS = new Set([
  'runtime-matrix-unavailable',
  'runtime-version-not-in-matrix',
  'runtime-provider-not-in-matrix',
  'desktop-version-not-in-matrix',
  'runtime-integrity-not-in-matrix',
  'runtime-lockfile-not-in-matrix',
  'runtime-file-integrity-not-in-matrix',
  'runtime-patch-evidence-not-in-matrix',
  'runtime-matrix-status-candidate',
  'runtime-matrix-status-blocked',
])
const RUNTIME_SUPPORT_LOG_STAGES = new Set([
  'matrix-read',
  'known-good-read',
  'cli-resolve',
  'file-evidence',
  'assess',
])
const SAFE_RUNTIME_SUPPORT_LOG_MESSAGE = /^[A-Za-z0-9 .,:;_@=()'-]{1,240}$/u
const SAFE_RUNTIME_SUPPORT_LOG_VERSION = /^[0-9A-Za-z.-]{1,64}$/u
const PATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const RELATIVE_ARTIFACT_PATH = /^(?![\\/])(?!(?:.*(?:^|[\\/])\.\.(?:[\\/]|$)))[A-Za-z0-9@._/\\-]+$/u

function exactVersion(value, label) {
  if (typeof value !== 'string' || semver.valid(value) === null) {
    throw new TypeError(`${label} must be an exact semantic version`)
  }
  return value
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256Digest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`)
  }
  return value
}

function runtimeIntegrity(value, label) {
  if (typeof value !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new TypeError(`${label} must be sha512 integrity evidence`)
  }
  return value
}

function runtimeFileHashes(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  const expectedKeys = [...RUNTIME_PROVENANCE_FILES].toSorted()
  const actualKeys = Object.keys(value).toSorted()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError(`${label} must contain exactly the Runtime entrypoint files`)
  }
  const normalized = {}
  for (const file of RUNTIME_PROVENANCE_FILES) {
    normalized[file] = sha256Digest(value[file], `${label} ${file}`)
  }
  return Object.freeze(normalized)
}

function sameRuntimeFileHashes(left, right) {
  return RUNTIME_PROVENANCE_FILES.every((file) => left[file] === right[file])
}

function relativeArtifactPath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_000) {
    throw new TypeError(`${label} must be a repository-relative path`)
  }
  const normalized = value.replaceAll('\\', '/')
  if (!RELATIVE_ARTIFACT_PATH.test(normalized)) {
    throw new TypeError(`${label} must be a repository-relative path`)
  }
  return normalized
}

/**
 * Compatibility patches are part of the reviewed Runtime identity, not an
 * advisory note. Canonicalize their identifiers so independently generated
 * known-good and matrix artifacts can agree even when source ordering differs.
 */
function runtimePatchEvidence(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  if (!Array.isArray(value.ids) || value.ids.length === 0) {
    throw new TypeError(`${label} ids must be a non-empty array`)
  }
  const ids = value.ids.map((id) => {
    if (typeof id !== 'string' || !PATCH_ID.test(id)) {
      throw new TypeError(`${label} ids must contain canonical patch identifiers`)
    }
    return id
  })
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(`${label} ids must not contain duplicates`)
  }
  return Object.freeze({
    registry: relativeArtifactPath(value.registry, `${label} registry`),
    sha256: sha256Digest(value.sha256, `${label} sha256`),
    ids: Object.freeze(ids.toSorted()),
  })
}

function sameRuntimePatchEvidence(left, right) {
  return left.registry === right.registry
    && left.sha256 === right.sha256
    && left.ids.length === right.ids.length
    && left.ids.every((id, index) => id === right.ids[index])
}

function provenanceError(code, message, file, cause = undefined) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.code = code
  error.file = file
  return error
}

/**
 * Keep packaged startup diagnostics useful without recording paths, Runtime
 * stderr, or user-controlled data in the bounded Desktop log.
 */
export function runtimeSupportStartupLogDetails({
  reason,
  stage,
  desktopVersion,
  runtimeVersion,
  error,
} = {}) {
  const safeReason = RUNTIME_SUPPORT_LOG_REASONS.has(reason)
    ? reason
    : 'runtime-support-assessment-failed'
  const safeStage = RUNTIME_SUPPORT_LOG_STAGES.has(stage)
    ? stage
    : 'assess'
  const safeDesktopVersion = SAFE_RUNTIME_SUPPORT_LOG_VERSION.test(desktopVersion)
    ? desktopVersion
    : 'unknown'
  const safeRuntimeVersion = SAFE_RUNTIME_SUPPORT_LOG_VERSION.test(runtimeVersion)
    ? runtimeVersion
    : 'unknown'
  if (!(error instanceof Error)) {
    return Object.freeze({
      reason: safeReason,
      stage: safeStage,
      desktopVersion: safeDesktopVersion,
      runtimeVersion: safeRuntimeVersion,
      errorCode: 'none',
      errorName: 'none',
      errorMessage: 'none',
    })
  }
  const errorName = error.name === 'TypeError' ? 'TypeError' : 'Error'
  const errorCode = typeof error.code === 'string' && /^[A-Z0-9_]{1,80}$/u.test(error.code)
    ? error.code
    : 'none'
  const message = String(error.message ?? '')
  const errorMessage = SAFE_RUNTIME_SUPPORT_LOG_MESSAGE.test(message)
    ? message
    : 'unclassified runtime support validation failure'
  return Object.freeze({
    reason: safeReason,
    stage: safeStage,
    desktopVersion: safeDesktopVersion,
    runtimeVersion: safeRuntimeVersion,
    errorCode,
    errorName,
    errorMessage,
  })
}

/**
 * Verify the executable Runtime identity surface before it is launched. The
 * expected digests come from the reviewed release evidence, while the bytes
 * are read from the actually resolved package (not a version string).
 */
export async function verifyRuntimeFileEvidence({
  cliPath,
  expectedFileHashes,
  readFile,
} = {}) {
  if (typeof cliPath !== 'string' || cliPath.length === 0) {
    throw new TypeError('runtime CLI path is required for provenance verification')
  }
  if (typeof readFile !== 'function') throw new TypeError('runtime provenance readFile is required')
  const expected = runtimeFileHashes(expectedFileHashes, 'runtime provenance evidence')
  const packageRoot = dirname(dirname(cliPath))
  const paths = {
    'package.json': join(packageRoot, 'package.json'),
    'lib/bin.js': cliPath,
  }
  const actual = {}
  for (const file of RUNTIME_PROVENANCE_FILES) {
    let bytes
    try {
      bytes = await readFile(paths[file])
    } catch (cause) {
      throw provenanceError(
        'DSH_DESKTOP_RUNTIME_PROVENANCE_UNAVAILABLE',
        `runtime integrity evidence could not read ${file}; reinstall Desktop`,
        file,
        cause,
      )
    }
    actual[file] = createHash('sha256').update(bytes).digest('hex')
  }
  const normalizedActual = Object.freeze(actual)
  if (!sameRuntimeFileHashes(expected, normalizedActual)) {
    const file = RUNTIME_PROVENANCE_FILES.find((candidate) => expected[candidate] !== normalizedActual[candidate])
    throw provenanceError(
      'DSH_DESKTOP_RUNTIME_PROVENANCE_MISMATCH',
      `runtime integrity checksum mismatch for ${file}; reinstall Desktop`,
      file,
    )
  }
  return normalizedActual
}

/**
 * Read the Runtime version from the same package root as the CLI bytes that
 * Desktop will execute. Profile dependencies are intentionally not an input:
 * a legacy migration profile can retain an older DSH declaration while the
 * packaged Runtime remains the reviewed executable identity.
 */
export async function readRuntimePackageVersion({
  cliPath,
  readFile,
} = {}) {
  if (typeof cliPath !== 'string' || cliPath.length === 0) {
    throw new TypeError('runtime CLI path is required for identity verification')
  }
  if (typeof readFile !== 'function') throw new TypeError('runtime identity readFile is required')
  const manifestPath = join(dirname(dirname(cliPath)), 'package.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (cause) {
    throw provenanceError(
      'DSH_DESKTOP_RUNTIME_PROVENANCE_UNAVAILABLE',
      'runtime identity evidence could not read package.json; reinstall Desktop',
      'package.json',
      cause,
    )
  }
  if (!isRecord(manifest) || manifest.name !== '@deepseek-ai/dsh') {
    throw provenanceError(
      'DSH_DESKTOP_RUNTIME_PROVENANCE_MISMATCH',
      'runtime identity package is not @deepseek-ai/dsh; reinstall Desktop',
      'package.json',
    )
  }
  try {
    return exactVersion(manifest.version, 'runtime package version')
  } catch (cause) {
    throw provenanceError(
      'DSH_DESKTOP_RUNTIME_PROVENANCE_MISMATCH',
      'runtime identity package version is invalid; reinstall Desktop',
      'package.json',
      cause,
    )
  }
}

/**
 * Parse the independently generated Known Good evidence used to bind the
 * installed Runtime to a supported-runtime matrix entry. This intentionally
 * accepts only the small immutable identity surface needed at startup.
 */
export function normalizeKnownGoodRuntimeEvidence(document) {
  if (!isRecord(document) || document.schemaVersion !== 1) {
    throw new TypeError('known-good runtime evidence is invalid')
  }
  const desktopVersion = exactVersion(document.desktop?.version, 'known-good Desktop version')
  const runtimeVersion = exactVersion(document.runtime?.version, 'known-good runtime version')
  const integrity = runtimeIntegrity(document.runtime?.integrity, 'known-good runtime integrity')
  const fileHashes = runtimeFileHashes(document.runtime?.files, 'known-good runtime file evidence')
  const lockfilePath = document.lockfile?.path
  if (typeof lockfilePath !== 'string' || lockfilePath.length === 0) {
    throw new TypeError('known-good lockfile path is invalid')
  }
  const lockfileSha256 = sha256Digest(document.lockfile?.sha256, 'known-good lockfile digest')
  const providerId = document.provider?.providerId
  if (typeof providerId !== 'string' || providerId.length === 0) {
    throw new TypeError('known-good providerId is invalid')
  }
  const providerVersion = exactVersion(document.provider?.upstreamVersion, 'known-good provider runtime version')
  if (providerVersion !== runtimeVersion) {
    throw new TypeError('known-good provider runtime version does not match runtime evidence')
  }
  if (!STABLE_STATUS_SET.has(document.supportStatus) || !STABLE_STATUS_SET.has(document.provider?.supportStatus)) {
    throw new TypeError('known-good support status is not Stable eligible')
  }
  const patches = runtimePatchEvidence(document.compatPatches, 'known-good compatibility patch evidence')
  return Object.freeze({
    schemaVersion: 1,
    desktopVersion,
    runtimeVersion,
    integrity,
    fileHashes,
    providerId,
    lockfile: Object.freeze({ path: lockfilePath, sha256: lockfileSha256 }),
    patches,
  })
}

/** Parse only the stable, clone-safe subset required to gate a Desktop Runtime. */
export function normalizeRuntimeSupportMatrix(matrix) {
  if (!isRecord(matrix) || matrix.schemaVersion !== 1 || !Array.isArray(matrix.entries)) {
    throw new TypeError('runtime support matrix is invalid')
  }
  const entries = matrix.entries.map((entry) => {
    if (!isRecord(entry) || !MATRIX_STATUS_SET.has(entry.status)) {
      throw new TypeError('runtime support matrix entry is invalid')
    }
    const upstreamVersion = exactVersion(entry.upstreamVersion, 'runtime matrix upstreamVersion')
    if (typeof entry.providerId !== 'string' || entry.providerId.length === 0) {
      throw new TypeError('runtime matrix providerId is invalid')
    }
    if (typeof entry.desktopRange !== 'string' || !semver.validRange(entry.desktopRange)) {
      throw new TypeError('runtime matrix desktopRange is invalid')
    }
    const integrity = runtimeIntegrity(entry.evidence?.package?.integrity, 'runtime matrix integrity evidence')
    const fileHashes = runtimeFileHashes(entry.evidence?.package?.files, 'runtime matrix runtime file evidence')
    const lockfile = entry.evidence?.lockfile
    if (!isRecord(lockfile) || typeof lockfile.path !== 'string' || lockfile.path.length === 0
      || typeof lockfile.sha256 !== 'string') {
      throw new TypeError('runtime matrix lockfile evidence is invalid')
    }
    const patches = runtimePatchEvidence(entry.evidence?.patches, 'runtime matrix compatibility patch evidence')
    return Object.freeze({
      status: entry.status,
      upstreamVersion,
      providerId: entry.providerId,
      desktopRange: entry.desktopRange,
      integrity,
      fileHashes,
      lockfile: Object.freeze({ path: lockfile.path, sha256: sha256Digest(lockfile.sha256, 'runtime matrix lockfile evidence') }),
      patches,
      verifiedAt: typeof entry.verifiedAt === 'string' ? entry.verifiedAt : undefined,
      matrixArtifact: typeof entry.matrixArtifact === 'string' ? entry.matrixArtifact : undefined,
      requiredPatches: patches.ids,
      knownIssues: Array.isArray(entry.knownIssues) ? [...entry.knownIssues] : [],
    })
  })
  const normalized = Object.freeze({ schemaVersion: 1, entries: Object.freeze(entries) })
  NORMALIZED_RUNTIME_MATRICES.add(normalized)
  return normalized
}

/** Return a stable selection or an explicit blocked assessment; never promote a Candidate at runtime. */
export function assessRuntimeSupport(matrix, {
  upstreamVersion,
  providerId,
  desktopVersion,
  integrity,
  lockfileSha256,
  fileHashes,
  patchEvidence,
} = {}) {
  const normalized = NORMALIZED_RUNTIME_MATRICES.has(matrix)
    ? matrix
    : normalizeRuntimeSupportMatrix(matrix)
  const version = exactVersion(upstreamVersion, 'runtime version')
  const desktop = exactVersion(desktopVersion, 'Desktop version')
  if (typeof providerId !== 'string' || providerId.length === 0) throw new TypeError('runtime providerId is required')
  const runtimePackageIntegrity = runtimeIntegrity(integrity, 'runtime integrity')
  const runtimeLockfileSha256 = sha256Digest(lockfileSha256, 'runtime lockfile provenance')
  const runtimeFileEvidence = runtimeFileHashes(fileHashes, 'runtime file provenance')
  const runtimePatchEvidenceInput = runtimePatchEvidence(patchEvidence, 'runtime compatibility patch provenance')
  const candidates = normalized.entries.filter((entry) => entry.upstreamVersion === version)
  if (candidates.length === 0) {
    return Object.freeze({ status: 'blocked', reason: 'runtime-version-not-in-matrix', upstreamVersion: version })
  }
  const matchingProvider = candidates.filter((entry) => entry.providerId === providerId)
  if (matchingProvider.length === 0) {
    return Object.freeze({ status: 'blocked', reason: 'runtime-provider-not-in-matrix', upstreamVersion: version })
  }
  const matchingDesktop = matchingProvider.filter((entry) => semver.satisfies(desktop, entry.desktopRange, { includePrerelease: true }))
  if (matchingDesktop.length === 0) {
    return Object.freeze({ status: 'blocked', reason: 'desktop-version-not-in-matrix', upstreamVersion: version })
  }
  const matchingIntegrity = matchingDesktop.filter((entry) => entry.integrity === runtimePackageIntegrity)
  if (matchingIntegrity.length === 0) {
    return Object.freeze({ status: 'blocked', reason: 'runtime-integrity-not-in-matrix', upstreamVersion: version })
  }
  const matchingLockfile = matchingIntegrity.filter((entry) => entry.lockfile.sha256 === runtimeLockfileSha256)
  if (matchingLockfile.length === 0) {
    return Object.freeze({ status: 'blocked', reason: 'runtime-lockfile-not-in-matrix', upstreamVersion: version })
  }
  const matchingFiles = matchingLockfile.filter((entry) => sameRuntimeFileHashes(entry.fileHashes, runtimeFileEvidence))
  if (matchingFiles.length === 0) {
    return Object.freeze({ status: 'blocked', reason: 'runtime-file-integrity-not-in-matrix', upstreamVersion: version })
  }
  const matchingPatches = matchingFiles.filter((entry) => sameRuntimePatchEvidence(entry.patches, runtimePatchEvidenceInput))
  if (matchingPatches.length === 0) {
    return Object.freeze({ status: 'blocked', reason: 'runtime-patch-evidence-not-in-matrix', upstreamVersion: version })
  }
  const entry = matchingPatches[0]
  if (!STABLE_STATUS_SET.has(entry.status)) {
    return Object.freeze({
      status: 'blocked',
      reason: `runtime-matrix-status-${entry.status}`,
      upstreamVersion: version,
      entry,
    })
  }
  return Object.freeze({ status: entry.status, reason: 'supported', upstreamVersion: version, entry })
}

export async function readRuntimeSupportMatrix(path, { readFile } = {}) {
  if (typeof path !== 'string' || path.length === 0 || typeof readFile !== 'function') {
    throw new TypeError('runtime support matrix path and readFile are required')
  }
  let parsed
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error('runtime support matrix could not be read', { cause: error })
  }
  return normalizeRuntimeSupportMatrix(parsed)
}

/** Read and normalize the Known Good artifact without exposing raw JSON to feature code. */
export async function readKnownGoodRuntimeEvidence(path, { readFile } = {}) {
  if (typeof path !== 'string' || path.length === 0 || typeof readFile !== 'function') {
    throw new TypeError('known-good runtime evidence path and readFile are required')
  }
  let parsed
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error('known-good runtime evidence could not be read', { cause: error })
  }
  return normalizeKnownGoodRuntimeEvidence(parsed)
}
