import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  REPOSITORY_ROOT,
} from './generate-runtime-support.mjs'
import { validateCandidateVersion } from './prepare-dsh-candidate.mjs'
import { RUNTIME_PROVENANCE_FILES } from '../apps/dsh-desktop/src/runtime-support-policy.mjs'

export const RUNTIME_SUPPORT_STATUSES = Object.freeze(['known-good', 'supported', 'candidate', 'blocked'])
export const STABLE_RUNTIME_SUPPORT_STATUSES = Object.freeze(['known-good', 'supported'])
export const RUNTIME_SUPPORT_MATRIX_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  'apps/dsh-desktop/runtime-support/supported-runtimes.source.json',
)
export const RUNTIME_SUPPORT_MATRIX_PATH = resolve(
  REPOSITORY_ROOT,
  'apps/dsh-desktop/runtime-support/supported-runtimes.json',
)

const STATUS_SET = new Set(RUNTIME_SUPPORT_STATUSES)
const STABLE_STATUS_SET = new Set(STABLE_RUNTIME_SUPPORT_STATUSES)
const CAPABILITY_STATUS = new Set(['available', 'unavailable', 'unsupported'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const RELATIVE_ARTIFACT_PATTERN = /^(?![\\/])(?!(?:.*(?:^|[\\/])\.\.(?:[\\/]|$)))[A-Za-z0-9@._/\\-]+$/u
const PATCH_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactVersion(value, label) {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) throw new TypeError(`${label} must be an exact version`)
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 2_000) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function normalizedDate(value, label) {
  const date = nonEmptyString(value, label)
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!DATE_PATTERN.test(date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new TypeError(`${label} must be an ISO calendar date`)
  }
  return date
}

function normalizedStatus(value, label = 'runtime support status') {
  if (!STATUS_SET.has(value)) throw new TypeError(`${label} must be one of ${RUNTIME_SUPPORT_STATUSES.join(', ')}`)
  return value
}

function normalizedArtifact(value, label = 'matrix artifact') {
  const artifact = nonEmptyString(value, label).replaceAll('\\', '/')
  if (!RELATIVE_ARTIFACT_PATTERN.test(artifact)) throw new TypeError(`${label} must be a repository-relative path`)
  return artifact
}

function normalizedStringList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  const normalized = value.map((item) => nonEmptyString(item, label))
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} must not contain duplicates`)
  return normalized.toSorted()
}

function normalizedCapabilities(value, label = 'capabilities') {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  const ids = new Set()
  const capabilities = value.map((item) => {
    if (!isRecord(item)) throw new TypeError(`${label} contains an invalid capability`)
    const id = nonEmptyString(item.id, `${label} id`)
    if (!/^[a-z][a-z0-9.-]{1,127}$/u.test(id) || ids.has(id)) throw new TypeError(`${label} contains an invalid or duplicate id`)
    const status = nonEmptyString(item.status, `${label} status`)
    if (!CAPABILITY_STATUS.has(status)) throw new TypeError(`${label} contains an unsupported capability status`)
    ids.add(id)
    return { id, status }
  })
  return capabilities.toSorted((left, right) => left.id.localeCompare(right.id))
}

function normalizedPeerDependencies(value) {
  if (!isRecord(value)) throw new TypeError('peer dependencies must be an object')
  const result = {}
  for (const [name, range] of Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right))) {
    result[nonEmptyString(name, 'peer dependency name')] = nonEmptyString(range, 'peer dependency range')
  }
  return result
}

function normalizedRuntimeFileHashes(value) {
  if (!isRecord(value)) throw new TypeError('runtime file evidence must be an object')
  const expectedKeys = [...RUNTIME_PROVENANCE_FILES].toSorted()
  const actualKeys = Object.keys(value).toSorted()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError('runtime file evidence must contain exactly the Runtime entrypoint files')
  }
  const hashes = {}
  for (const file of RUNTIME_PROVENANCE_FILES) {
    const digest = nonEmptyString(value[file], `runtime file digest ${file}`)
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new TypeError(`runtime file digest ${file} must be a lowercase SHA-256 digest`)
    hashes[file] = digest
  }
  return hashes
}

function normalizedEvidence(evidence, { allowUnavailable = false } = {}) {
  if (!isRecord(evidence)) {
    if (allowUnavailable) return { available: false }
    throw new TypeError('runtime support evidence must be an object')
  }
  const runtime = evidence.runtime
  const provider = evidence.provider
  const compatPatches = evidence.compatPatches
  const packagedRuntime = evidence.packagedRuntimeIdentity
  const lockfile = evidence.lockfile
  if (!isRecord(runtime) || !isRecord(provider) || !isRecord(compatPatches) || !isRecord(packagedRuntime) || !isRecord(lockfile)) {
    if (allowUnavailable) return { available: false }
    throw new TypeError('runtime support evidence is incomplete')
  }
  const packageName = nonEmptyString(runtime.packageName, 'runtime package name')
  const version = exactVersion(runtime.version, 'runtime version')
  const integrity = nonEmptyString(runtime.integrity, 'runtime integrity')
  if (!integrity.startsWith('sha512-')) throw new TypeError('runtime integrity must be sha512')
  const files = normalizedRuntimeFileHashes(runtime.files)
  const providerId = nonEmptyString(provider.providerId, 'provider id')
  const capabilities = normalizedCapabilities(provider.capabilities)
  const slots = normalizedStringList(evidence.clientSlots?.ids ?? [], 'client slots')
  const patchIds = normalizedStringList(compatPatches.ids ?? [], 'compatibility patch ids')
  if (patchIds.length === 0 || patchIds.some((id) => !PATCH_ID_PATTERN.test(id))) {
    throw new TypeError('compatibility patch ids must be non-empty canonical patch identifiers')
  }
  const patchRegistry = normalizedArtifact(compatPatches.registry, 'patch registry')
  const patchRegistrySha256 = nonEmptyString(compatPatches.sha256, 'patch registry sha256')
  if (!/^[a-f0-9]{64}$/u.test(patchRegistrySha256)) {
    throw new TypeError('patch registry sha256 must be a lowercase SHA-256 digest')
  }
  const lockfileSha256 = nonEmptyString(lockfile.sha256, 'lockfile sha256')
  if (!/^[a-f0-9]{64}$/u.test(lockfileSha256)) throw new TypeError('lockfile sha256 must be a lowercase SHA-256 digest')
  return {
    available: true,
    upstreamVersion: version,
    providerId,
    capabilities,
    evidence: {
      package: { name: packageName, version, integrity, files },
      peers: normalizedPeerDependencies(runtime.peerDependencies ?? {}),
      lockfile: {
        path: normalizedArtifact(lockfile.path ?? 'pnpm-lock.yaml', 'lockfile path'),
        sha256: lockfileSha256,
      },
      slots,
      patches: {
        registry: patchRegistry,
        sha256: patchRegistrySha256,
        ids: patchIds,
      },
      packagedRuntime: {
        packageRoot: normalizedArtifact(packagedRuntime.packageRoot, 'packaged runtime package root'),
        cli: normalizedArtifact(packagedRuntime.cli, 'packaged runtime cli'),
        profileName: nonEmptyString(packagedRuntime.profileName, 'packaged runtime profile name'),
        executionMode: nonEmptyString(packagedRuntime.executionMode, 'packaged runtime execution mode'),
        requiredFiles: normalizedStringList(packagedRuntime.requiredFiles, 'packaged runtime required files'),
      },
    },
  }
}

function normalizedSource(source) {
  if (!isRecord(source) || source.schemaVersion !== 1) throw new TypeError('supported runtime source schemaVersion must be 1')
  const allowed = new Set(['schemaVersion', 'status', 'verifiedAt', 'desktopRange', 'matrixArtifact', 'knownIssues'])
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new TypeError(`supported runtime source contains unsupported field ${key}`)
  }
  const status = normalizedStatus(source.status, 'supported runtime source status')
  if (!STABLE_STATUS_SET.has(status)) throw new TypeError('supported runtime source may only describe known-good or supported Stable runtime')
  const desktopRange = nonEmptyString(source.desktopRange, 'Desktop range')
  return {
    status,
    verifiedAt: normalizedDate(source.verifiedAt, 'verifiedAt'),
    desktopRange,
    matrixArtifact: normalizedArtifact(source.matrixArtifact),
    knownIssues: normalizedStringList(source.knownIssues, 'known issues'),
  }
}

function entryFromEvidence({ status, evidence, verifiedAt, desktopRange, matrixArtifact, knownIssues, fallbackVersion = undefined }) {
  const supportStatus = normalizedStatus(status)
  const normalized = normalizedEvidence(evidence, { allowUnavailable: supportStatus === 'blocked' })
  const shared = {
    status: supportStatus,
    upstreamVersion: normalized.available ? normalized.upstreamVersion : exactVersion(fallbackVersion, 'blocked candidate version'),
    providerId: normalized.available ? normalized.providerId : 'unavailable',
    desktopRange: nonEmptyString(desktopRange, 'Desktop range'),
    capabilities: normalized.available ? normalized.capabilities : [],
    verifiedAt: normalizedDate(verifiedAt, 'verifiedAt'),
    matrixArtifact: normalizedArtifact(matrixArtifact),
    knownIssues: normalizedStringList(knownIssues, 'known issues'),
    evidence: normalized.evidence ?? { available: false },
  }
  return shared
}

function matrixAuthority() {
  return {
    stableEvidence: 'apps/dsh-desktop/runtime-support/known-good.json',
    source: 'apps/dsh-desktop/runtime-support/supported-runtimes.source.json',
    packageManifest: 'apps/dsh-desktop/package.json',
    lockfile: 'pnpm-lock.yaml',
  }
}

export function validateRuntimeSupportMatrix(matrix, { stableOnly = false } = {}) {
  if (!isRecord(matrix) || matrix.schemaVersion !== 1 || matrix.derived !== true || !isRecord(matrix.authority)) {
    throw new TypeError('runtime support matrix schema is invalid')
  }
  if (!Array.isArray(matrix.entries) || matrix.entries.length === 0) throw new TypeError('runtime support matrix requires entries')
  const seenVersions = new Set()
  const entries = matrix.entries.map((entry) => {
    if (!isRecord(entry)) throw new TypeError('runtime support matrix contains an invalid entry')
    const allowed = new Set([
      'status',
      'upstreamVersion',
      'providerId',
      'desktopRange',
      'capabilities',
      'verifiedAt',
      'matrixArtifact',
      'knownIssues',
      'evidence',
    ])
    for (const key of Object.keys(entry)) {
      if (!allowed.has(key)) throw new TypeError(`runtime support matrix entry contains unsupported field ${key}`)
    }
    const status = normalizedStatus(entry.status)
    if (stableOnly && !STABLE_STATUS_SET.has(status)) {
      throw new TypeError('Stable runtime selection may only reference known-good or supported entries')
    }
    const upstreamVersion = exactVersion(entry.upstreamVersion, 'upstreamVersion')
    const duplicateKey = `${status}:${upstreamVersion}`
    if (seenVersions.has(duplicateKey)) throw new TypeError('runtime support matrix contains duplicate status/version entries')
    seenVersions.add(duplicateKey)
    const normalized = normalizedEvidence({
      runtime: {
        packageName: entry.evidence?.package?.name,
        version: entry.evidence?.package?.version,
        integrity: entry.evidence?.package?.integrity,
        files: entry.evidence?.package?.files,
        peerDependencies: entry.evidence?.peers,
      },
      provider: {
        providerId: entry.providerId,
        capabilities: entry.capabilities,
      },
      compatPatches: {
        registry: entry.evidence?.patches?.registry,
        sha256: entry.evidence?.patches?.sha256,
        ids: entry.evidence?.patches?.ids,
      },
      clientSlots: { ids: entry.evidence?.slots },
      packagedRuntimeIdentity: entry.evidence?.packagedRuntime,
      lockfile: entry.evidence?.lockfile,
    }, { allowUnavailable: status === 'blocked' })
    if (normalized.available && normalized.upstreamVersion !== upstreamVersion) {
      throw new TypeError('runtime support matrix evidence version differs from upstreamVersion')
    }
    if (status !== 'blocked' && !normalized.available) throw new TypeError('non-blocked runtime support entry requires evidence')
    return entryFromEvidence({
      status,
      evidence: normalized.available ? {
        runtime: {
          packageName: normalized.evidence.package.name,
          version: normalized.evidence.package.version,
          integrity: normalized.evidence.package.integrity,
          files: normalized.evidence.package.files,
          peerDependencies: normalized.evidence.peers,
        },
        lockfile: normalized.evidence.lockfile,
        provider: { providerId: normalized.providerId, capabilities: normalized.capabilities },
        clientSlots: { ids: normalized.evidence.slots },
        compatPatches: normalized.evidence.patches,
        packagedRuntimeIdentity: normalized.evidence.packagedRuntime,
      } : undefined,
      verifiedAt: entry.verifiedAt,
      desktopRange: entry.desktopRange,
      matrixArtifact: entry.matrixArtifact,
      knownIssues: entry.knownIssues,
      fallbackVersion: upstreamVersion,
    })
  })
  return {
    schemaVersion: 1,
    derived: true,
    authority: structuredClone(matrix.authority),
    entries: entries.toSorted((left, right) => (
      left.upstreamVersion.localeCompare(right.upstreamVersion) || left.status.localeCompare(right.status)
    )),
  }
}

export function stableRuntimeEntry(matrix, upstreamVersion) {
  const normalized = validateRuntimeSupportMatrix(matrix, { stableOnly: true })
  const version = exactVersion(upstreamVersion, 'upstreamVersion')
  const entry = normalized.entries.find((candidate) => candidate.upstreamVersion === version)
  if (entry === undefined) throw new Error(`Stable runtime ${version} is absent from the supported runtime matrix`)
  return Object.freeze(entry)
}

export async function createSupportedRuntimeMatrix({
  root = REPOSITORY_ROOT,
  supportEvidence = undefined,
  source = undefined,
} = {}) {
  const [evidence, sourceInput] = await Promise.all([
    supportEvidence === undefined ? readFile(resolve(root, 'apps/dsh-desktop/runtime-support/known-good.json'), 'utf8').then(JSON.parse) : supportEvidence,
    source === undefined ? readFile(resolve(root, 'apps/dsh-desktop/runtime-support/supported-runtimes.source.json'), 'utf8').then(JSON.parse) : source,
  ])
  const metadata = normalizedSource(sourceInput)
  const stable = entryFromEvidence({
    status: metadata.status,
    evidence,
    verifiedAt: metadata.verifiedAt,
    desktopRange: metadata.desktopRange === 'current' ? `=${exactVersion(evidence?.desktop?.version, 'Desktop version')}` : metadata.desktopRange,
    matrixArtifact: metadata.matrixArtifact,
    knownIssues: metadata.knownIssues,
  })
  return validateRuntimeSupportMatrix({
    schemaVersion: 1,
    derived: true,
    authority: matrixAuthority(),
    entries: [stable],
  }, { stableOnly: true })
}

export async function createCandidateRuntimeMatrix({
  root = REPOSITORY_ROOT,
  supportEvidence = undefined,
  source = undefined,
  candidateEvidence = undefined,
  candidateVersion,
  candidateStatus,
  verifiedAt,
  knownIssues = [],
  matrixArtifact = 'artifacts/dsh-candidate-report.json',
} = {}) {
  const stable = await createSupportedRuntimeMatrix({ root, supportEvidence, source })
  const status = normalizedStatus(candidateStatus, 'candidate status')
  if (!['candidate', 'blocked'].includes(status)) throw new TypeError('candidate status must be candidate or blocked')
  const stableDesktopRange = stable.entries[0]?.desktopRange
  const fallbackDesktopVersion = typeof stableDesktopRange === 'string' && stableDesktopRange.startsWith('=')
    ? stableDesktopRange.slice(1)
    : undefined
  const candidate = entryFromEvidence({
    status,
    evidence: candidateEvidence,
    verifiedAt,
    desktopRange: `=${exactVersion((candidateEvidence ?? {}).desktop?.version ?? (supportEvidence ?? {}).desktop?.version ?? fallbackDesktopVersion ?? '0.0.0', 'candidate Desktop version')}`,
    matrixArtifact,
    knownIssues,
    fallbackVersion: validateCandidateVersion(candidateVersion),
  })
  return validateRuntimeSupportMatrix({
    schemaVersion: 1,
    derived: true,
    authority: matrixAuthority(),
    entries: [...stable.entries, candidate],
  })
}

export function renderRuntimeSupportMatrix(matrix) {
  return `${JSON.stringify(validateRuntimeSupportMatrix(matrix), null, 2)}\n`
}

export async function atomicWriteValidated(path, content, validate) {
  const target = resolve(path)
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  const backup = `${target}.bak-${process.pid}-${Date.now()}`
  const validator = typeof validate === 'function' ? validate : JSON.parse
  const validateContent = (value) => validator(JSON.parse(value))
  validateContent(content)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  try {
    validateContent(await readFile(temporary, 'utf8'))
    let movedExisting = false
    try {
      await rename(target, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    try {
      await rename(temporary, target)
      if (movedExisting) await rm(backup, { force: true })
    } catch (error) {
      await rm(temporary, { force: true })
      if (movedExisting) {
        await rm(target, { force: true })
        await rename(backup, target)
      }
      throw error
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const output = argumentValue('--output')
  const candidateEvidencePath = argumentValue('--candidate-evidence')
  const candidateVersion = argumentValue('--candidate-version')
  const candidateStatus = argumentValue('--candidate-status')
  const candidateVerifiedAt = argumentValue('--candidate-verified-at')
  const candidateReportPath = argumentValue('--candidate-report')
  const candidateMode = candidateEvidencePath !== undefined || candidateVersion !== undefined || candidateStatus !== undefined || candidateVerifiedAt !== undefined
  if (candidateMode && (!candidateEvidencePath || !candidateVersion || !candidateStatus || !candidateVerifiedAt || !output)) {
    throw new Error('candidate matrix requires --candidate-evidence, --candidate-version, --candidate-status, --candidate-verified-at, and --output')
  }
  const matrix = candidateMode
    ? await (async () => {
      const candidateReport = candidateReportPath === undefined
        ? undefined
        : JSON.parse(await readFile(resolve(candidateReportPath), 'utf8'))
      return createCandidateRuntimeMatrix({
        candidateEvidence: JSON.parse(await readFile(resolve(candidateEvidencePath), 'utf8')),
        candidateVersion,
        candidateStatus,
        verifiedAt: candidateVerifiedAt,
        knownIssues: Array.isArray(candidateReport?.blockingReasons) ? candidateReport.blockingReasons : [],
      })
    })()
    : await createSupportedRuntimeMatrix()
  const content = renderRuntimeSupportMatrix(matrix)
  if (process.argv.includes('--stdout')) {
    process.stdout.write(content)
    return
  }
  const target = resolve(output ?? RUNTIME_SUPPORT_MATRIX_PATH)
  if (process.argv.includes('--check')) {
    const actual = await readFile(target, 'utf8')
    if (actual !== content) throw new Error('Supported runtime matrix is stale; run node scripts/generate-runtime-support-matrix.mjs --write')
    validateRuntimeSupportMatrix(JSON.parse(actual), { stableOnly: true })
    console.log('Supported runtime matrix is current')
    return
  }
  if (!process.argv.includes('--write') && !candidateMode) throw new Error('use --write, --check, or --stdout')
  await atomicWriteValidated(target, content, validateRuntimeSupportMatrix)
  console.log(`wrote runtime support matrix to ${target}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
