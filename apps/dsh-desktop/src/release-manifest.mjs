import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { parseDocument } from 'yaml'

import { DESKTOP_API_VERSION } from './desktop-contract.mjs'
import { normalizeUpdateChannel } from './release-channel.mjs'

const executeFile = promisify(execFile)
const APP_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = resolve(APP_DIRECTORY, '../..')
const RELEASE_MANIFEST_NAME = 'release-manifest.json'
const RELEASE_ARTIFACT_NAMES = new Set(['latest.yml', 'beta.yml', 'SHA256SUMS.txt'])
const RELEASE_MANIFEST_SCHEMA_VERSION = 1
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const SHA512_PATTERN = /^sha512-[A-Za-z0-9+/]+=*$/u
// electron-updater serializes the raw 64-byte SHA-512 digest as standard base64,
// rather than the SRI-style `sha512-...` runtime-integrity representation.
const UPDATER_SHA512_PATTERN = /^[A-Za-z0-9+/]{86}==$/u
const SIGNATURE_STATUSES = new Set(['valid', 'unsigned', 'not-applicable'])
const WINDOWS_INSTALLER_PATTERN = /^DeepSeek-Harness-Desktop-Setup-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-x64\.exe$/u
const WINDOWS_INSTALLER_BLOCKMAP_PATTERN = /^DeepSeek-Harness-Desktop-Setup-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-x64\.exe\.blockmap$/u

export { RELEASE_MANIFEST_NAME, RELEASE_MANIFEST_SCHEMA_VERSION }

function nonEmptyText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`)
  return value.trim()
}

function exactVersion(value, label) {
  const version = nonEmptyText(value, label)
  if (!VERSION_PATTERN.test(version)) throw new TypeError(`${label} must be an exact SemVer version`)
  return version
}

function safeRelativePath(value, label) {
  const path = nonEmptyText(value, label).replaceAll('\\', '/')
  if (isAbsolute(path) || path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new TypeError(`${label} must be a relative path`)
  }
  return path
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function updaterSha512(content) {
  return createHash('sha512').update(content).digest('base64')
}

function requiredSigningValue(value) {
  const normalized = normalizedEnvironmentValue(value)
  if (normalized === '') return false
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  throw new TypeError('REQUIRE_SIGNING must be true or false')
}

function normalizedEnvironmentValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** Report configuration without returning certificate material. */
export function releaseSigningConfiguration(environment = process.env) {
  const required = requiredSigningValue(environment?.REQUIRE_SIGNING)
  const source = ['CSC_LINK', 'WIN_CSC_LINK', 'CSC_NAME'].find((name) => (
    typeof environment?.[name] === 'string' && environment[name].trim().length > 0
  ))
  return Object.freeze({ required, configured: source !== undefined, source })
}

/** Enforce certificate presence only when a caller deliberately enables release signing. */
export function assertSigningConfiguration(environment = process.env) {
  const configuration = releaseSigningConfiguration(environment)
  if (configuration.required && !configuration.configured) {
    throw new Error('REQUIRE_SIGNING=true requires CSC_LINK, WIN_CSC_LINK, or CSC_NAME')
  }
  return configuration
}

function normalizeOptionalSignatureText(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** Convert the Windows Authenticode surface into a compact release-manifest record. */
export function normalizeWindowsSignature(value, { requireTimestamp = false } = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const statusText = normalizedEnvironmentValue(source.status ?? source.Status)
  if (statusText === 'valid') {
    const signer = normalizeOptionalSignatureText(source.signer ?? source.Signer)
    const timestamp = normalizeOptionalSignatureText(source.timestamp ?? source.Timestamp)
    if (!signer) throw new Error('signature verification did not return a signer')
    if (requireTimestamp && !timestamp) throw new Error('signature verification did not return a timestamp')
    return Object.freeze({
      status: 'valid',
      signer,
      ...(timestamp ? { timestamp } : {}),
    })
  }
  if (['unsigned', 'notsigned', 'not signed', 'unknownerror'].includes(statusText)) {
    return Object.freeze({ status: 'unsigned' })
  }
  return Object.freeze({ status: 'unsigned' })
}

function powerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

async function defaultRunPowerShell(script) {
  const { stdout } = await executeFile('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command', script,
  ], { windowsHide: true, maxBuffer: 1024 * 1024 })
  return stdout
}

/**
 * Verify a Windows executable after signing. The injectable PowerShell runner keeps the policy
 * testable without a certificate or Windows host.
 */
export async function verifyWindowsSignature(path, {
  requireTimestamp = false,
  runPowerShell = defaultRunPowerShell,
} = {}) {
  if (process.platform !== 'win32' && runPowerShell === defaultRunPowerShell) {
    return Object.freeze({ status: 'unsigned' })
  }
  const script = [
    `$signature = Get-AuthenticodeSignature -LiteralPath ${powerShellLiteral(path)}`,
    '$signer = if ($null -eq $signature.SignerCertificate) { $null } else { $signature.SignerCertificate.Subject }',
    '$timestamp = if ($null -eq $signature.TimeStamperCertificate) { $null } else { $signature.TimeStamperCertificate.Subject }',
    '[PSCustomObject]@{ status = [string]$signature.Status; signer = $signer; timestamp = $timestamp } | ConvertTo-Json -Compress',
  ].join('; ')
  const output = await runPowerShell(script)
  let parsed
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output
  } catch (error) {
    throw new Error(`signature verification returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  return normalizeWindowsSignature(parsed, { requireTimestamp })
}

function isReleaseArtifact(name) {
  return RELEASE_ARTIFACT_NAMES.has(name)
    || WINDOWS_INSTALLER_PATTERN.test(name)
    || WINDOWS_INSTALLER_BLOCKMAP_PATTERN.test(name)
}

export async function collectReleaseArtifactNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const unexpectedExecutables = entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.exe' && !WINDOWS_INSTALLER_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .toSorted()
  if (unexpectedExecutables.length > 0) {
    throw new Error(`unexpected top-level Windows executable; publish only the Setup installer: ${unexpectedExecutables.join(', ')}`)
  }
  const installers = entries
    .filter((entry) => entry.isFile() && WINDOWS_INSTALLER_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .toSorted()
  if (installers.length !== 1) {
    throw new Error(`expected exactly one top-level Setup installer; found ${installers.length === 0 ? 'none' : installers.join(', ')}`)
  }
  const artifacts = entries
    .filter((entry) => entry.isFile() && isReleaseArtifact(entry.name))
    .map((entry) => entry.name)
    .toSorted()
  if (artifacts.length === 0) throw new Error(`no release artifacts found in ${directory}`)
  return artifacts
}

/**
 * Find every Windows executable that is expected to be signed for a packaged release.
 * The installer is published from the release directory; the app executable remains in
 * electron-builder's `win-unpacked` staging directory and must be checked separately.
 */
export async function collectWindowsExecutablePaths(directory, { requireUnpacked = true } = {}) {
  const normalizedDirectory = resolve(nonEmptyText(directory, 'release directory'))
  const artifactNames = await collectReleaseArtifactNames(normalizedDirectory)
  const installers = artifactNames.filter((name) => extname(name).toLowerCase() === '.exe')
  if (installers.length === 0) throw new Error(`no Windows installer executable found in ${normalizedDirectory}`)

  const unpackedDirectory = join(normalizedDirectory, 'win-unpacked')
  let unpackedEntries = []
  try {
    unpackedEntries = await readdir(unpackedDirectory, { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const unpacked = unpackedEntries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.exe')
    .map((entry) => `win-unpacked/${entry.name}`)
    .toSorted()
  if (requireUnpacked && unpacked.length === 0) {
    throw new Error(`no unpacked Windows application executable found in ${unpackedDirectory}`)
  }

  return Object.freeze([...installers, ...unpacked].map((file) => Object.freeze({
    file,
    path: join(normalizedDirectory, ...file.split('/')),
  })))
}

/** Verify installers and the unpacked app executable with one consistent signing policy. */
export async function verifyWindowsExecutableSignatures({
  directory,
  requireSigning = false,
  signatureVerifier = verifyWindowsSignature,
} = {}) {
  const executables = await collectWindowsExecutablePaths(directory)
  const signatures = await Promise.all(executables.map(async ({ file, path }) => ({
    file,
    signature: await signatureVerifier(path, { requireTimestamp: requireSigning }),
  })))
  if (requireSigning && signatures.some((entry) => entry.signature.status !== 'valid' || !entry.signature.timestamp)) {
    throw new Error('REQUIRE_SIGNING=true requires valid timestamped signatures for every executable')
  }
  return Object.freeze(signatures.map((entry) => Object.freeze({
    file: entry.file,
    signature: normalizedSignature(entry.signature, { executable: true }),
  })))
}

function normalizedSignature(value, { executable = false } = {}) {
  if (!executable) return Object.freeze({ status: 'not-applicable' })
  const signature = value && typeof value === 'object' ? value : { status: 'unsigned' }
  const status = nonEmptyText(signature.status, 'artifact signature status').toLowerCase()
  if (!SIGNATURE_STATUSES.has(status) || status === 'not-applicable') {
    throw new TypeError('executable signature status must be valid or unsigned')
  }
  if (status === 'unsigned') return Object.freeze({ status })
  const signer = nonEmptyText(signature.signer, 'artifact signer')
  const timestamp = normalizeOptionalSignatureText(signature.timestamp)
  return Object.freeze({ status, signer, ...(timestamp ? { timestamp } : {}) })
}

function normalizedMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('release metadata must be an object')
  }
  const channel = nonEmptyText(metadata.channel, 'release channel').toLowerCase()
  if (!['stable', 'beta'].includes(channel)) throw new TypeError('release channel must be stable or beta')
  const runtime = metadata.runtime
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) throw new TypeError('release runtime metadata is required')
  const integrity = nonEmptyText(runtime.integrity, 'runtime integrity')
  if (!SHA512_PATTERN.test(integrity)) throw new TypeError('runtime integrity must be sha512')
  const taskSchema = Number(metadata.taskSchema)
  if (!Number.isInteger(taskSchema) || taskSchema < 1) throw new TypeError('task schema must be a positive integer')
  return Object.freeze({
    version: exactVersion(metadata.version, 'release version'),
    channel,
    runtime: Object.freeze({ version: exactVersion(runtime.version, 'runtime version'), integrity }),
    provider: nonEmptyText(metadata.provider, 'provider'),
    desktopApi: exactVersion(metadata.desktopApi, 'Desktop API version'),
    presetSchema: nonEmptyText(metadata.presetSchema, 'Preset schema'),
    taskSchema,
    matrixArtifact: safeRelativePath(metadata.matrixArtifact, 'matrix artifact'),
  })
}

export function validateReleaseManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('release manifest must be an object')
  if (value.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) throw new TypeError('release manifest schema version is unsupported')
  const metadata = normalizedMetadata(value)
  if (!Array.isArray(value.files) || value.files.length === 0) throw new TypeError('release manifest files are required')
  const seen = new Set()
  const files = value.files.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('release manifest file is invalid')
    const file = safeRelativePath(entry.file, 'release artifact file')
    if (seen.has(file)) throw new TypeError(`release manifest contains duplicate artifact: ${file}`)
    seen.add(file)
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new TypeError(`release artifact size is invalid: ${file}`)
    const digest = nonEmptyText(entry.sha256, 'release artifact sha256').toLowerCase()
    if (!SHA256_PATTERN.test(digest)) throw new TypeError(`release artifact sha256 is invalid: ${file}`)
    const executable = extname(file).toLowerCase() === '.exe'
    return Object.freeze({
      file,
      size: entry.size,
      sha256: digest,
      signature: normalizedSignature(entry.signature, { executable }),
    })
  }).toSorted((left, right) => left.file.localeCompare(right.file))
  return Object.freeze({ schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION, ...metadata, files: Object.freeze(files) })
}

async function signatureForArtifact(path, file, signatureVerifier) {
  if (extname(file).toLowerCase() !== '.exe') return Object.freeze({ status: 'not-applicable' })
  return normalizedSignature(await signatureVerifier(path), { executable: true })
}

export async function createReleaseManifest({ directory, metadata, signatureVerifier = verifyWindowsSignature } = {}) {
  const normalizedDirectory = resolve(nonEmptyText(directory, 'release directory'))
  const normalized = normalizedMetadata(metadata)
  const names = await collectReleaseArtifactNames(normalizedDirectory)
  const files = await Promise.all(names.map(async (file) => {
    const path = resolve(normalizedDirectory, file)
    const insideDirectory = relative(normalizedDirectory, path)
    if (insideDirectory === '..' || /^\.\.[\\/]/u.test(insideDirectory) || isAbsolute(insideDirectory)) {
      throw new Error(`release artifact escapes directory: ${file}`)
    }
    const [content, details] = await Promise.all([readFile(path), stat(path)])
    return {
      file,
      size: details.size,
      sha256: sha256(content),
      signature: await signatureForArtifact(path, file, signatureVerifier),
    }
  }))
  return validateReleaseManifest({ schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION, ...normalized, files })
}

function checksumRows(value) {
  const rows = new Map()
  for (const line of String(value).replace(/\r\n?/gu, '\n').split('\n')) {
    const match = /^([a-f0-9]{64})\s+\*?(.+?)\s*$/iu.exec(line)
    if (match) rows.set(match[2], match[1].toLowerCase())
  }
  return rows
}

function parseUpdaterMetadata(content, metadataFile) {
  const document = parseDocument(content, { uniqueKeys: true })
  if (document.errors.length > 0) {
    throw new Error(`${metadataFile} is invalid updater YAML: ${document.errors[0].message}`)
  }
  const value = document.toJS()
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${metadataFile} must contain an updater metadata object`)
  }
  return value
}

async function verifyUpdaterMetadata(directory, manifest) {
  const metadataFile = manifest.channel === 'beta' ? 'beta.yml' : 'latest.yml'
  const updateMetadata = manifest.files.find((entry) => entry.file === metadataFile)
  if (!updateMetadata) throw new Error(`release manifest is missing ${metadataFile}`)
  const content = await readFile(join(directory, updateMetadata.file), 'utf8')
  const updater = parseUpdaterMetadata(content, metadataFile)
  if (updater.version !== manifest.version) {
    throw new Error(`${metadataFile} version does not match release manifest`)
  }
  if (typeof updater.path !== 'string') {
    throw new Error(`${metadataFile} path must be an installer filename`)
  }
  const installer = manifest.files.find((entry) => entry.file === updater.path && entry.file.endsWith('.exe'))
  if (!installer) {
    throw new Error(`${metadataFile} path does not match installer artifact`)
  }
  if (typeof updater.sha512 !== 'string' || !UPDATER_SHA512_PATTERN.test(updater.sha512)) {
    throw new Error(`${metadataFile} sha512 must be a base64 SHA-512 digest`)
  }
  const installerContent = await readFile(join(directory, installer.file))
  if (updater.sha512 !== updaterSha512(installerContent)) {
    throw new Error(`${metadataFile} sha512 does not match ${installer.file}`)
  }
}

async function verifyChecksumFile(directory, manifest) {
  const sums = manifest.files.find((entry) => entry.file === 'SHA256SUMS.txt')
  if (!sums) throw new Error('release manifest is missing SHA256SUMS.txt')
  const rows = checksumRows(await readFile(join(directory, sums.file), 'utf8'))
  for (const artifact of manifest.files.filter((entry) => entry.file.endsWith('.exe'))) {
    if (rows.get(artifact.file) !== artifact.sha256) {
      throw new Error(`SHA256SUMS.txt does not match ${artifact.file}`)
    }
  }
}

async function writeTextAtomically(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  return path
}

/** Rebuild the publish checksum file from the single installer in the release directory. */
export async function writeReleaseChecksums(directory) {
  const normalizedDirectory = resolve(nonEmptyText(directory, 'release directory'))
  const names = await collectReleaseArtifactNames(normalizedDirectory)
  const installer = names.find((file) => WINDOWS_INSTALLER_PATTERN.test(file))
  if (installer === undefined) {
    throw new Error(`no top-level Setup installer found in ${normalizedDirectory}`)
  }
  const content = await readFile(join(normalizedDirectory, installer))
  return writeTextAtomically(
    join(normalizedDirectory, 'SHA256SUMS.txt'),
    `${sha256(content)}  ${installer}\n`,
  )
}
/** Rehash artifacts and re-check signatures without trusting the release manifest itself. */
export async function verifyReleaseManifest({
  directory,
  manifest,
  requireSigning = false,
  signatureVerifier = verifyWindowsSignature,
} = {}) {
  const normalizedDirectory = resolve(nonEmptyText(directory, 'release directory'))
  const normalized = validateReleaseManifest(manifest)
  for (const artifact of normalized.files) {
    const path = resolve(normalizedDirectory, artifact.file)
    const insideDirectory = relative(normalizedDirectory, path)
    if (insideDirectory === '..' || /^\.\.[\\/]/u.test(insideDirectory) || isAbsolute(insideDirectory)) {
      throw new Error(`release artifact escapes directory: ${artifact.file}`)
    }
    const [content, details] = await Promise.all([readFile(path), stat(path)])
    if (details.size !== artifact.size) throw new Error(`release artifact size mismatch: ${artifact.file}`)
    if (sha256(content) !== artifact.sha256) throw new Error(`release artifact sha256 mismatch: ${artifact.file}`)
    if (artifact.file.endsWith('.exe')) {
      const observed = normalizedSignature(await signatureVerifier(path), { executable: true })
      if (requireSigning && (observed.status !== 'valid' || !observed.timestamp)) {
        throw new Error(`signature verification failed for ${artifact.file}`)
      }
      if (observed.status !== artifact.signature.status) {
        throw new Error(`release artifact signature status mismatch: ${artifact.file}`)
      }
      if (observed.status === 'valid' && (
        observed.signer !== artifact.signature.signer || observed.timestamp !== artifact.signature.timestamp
      )) {
        throw new Error(`release artifact signature identity mismatch: ${artifact.file}`)
      }
    }
  }
  await Promise.all([
    verifyUpdaterMetadata(normalizedDirectory, normalized),
    verifyChecksumFile(normalizedDirectory, normalized),
  ])
  return normalized
}

export async function writeReleaseManifest(directory, manifest) {
  const normalizedDirectory = resolve(nonEmptyText(directory, 'release directory'))
  const normalized = validateReleaseManifest(manifest)
  const path = join(normalizedDirectory, RELEASE_MANIFEST_NAME)
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  try {
    JSON.parse(await readFile(temporary, 'utf8'))
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  return path
}

const DEFAULT_CHANNEL_FROM_ENV = normalizeUpdateChannel(process.env.DSH_DESKTOP_UPDATE_CHANNEL)

export async function defaultReleaseMetadata({ channel = DEFAULT_CHANNEL_FROM_ENV } = {}) {
  const [desktopManifestText, supportText] = await Promise.all([
    readFile(join(APP_DIRECTORY, 'package.json'), 'utf8'),
    readFile(join(REPOSITORY_ROOT, 'apps/dsh-desktop/runtime-support/known-good.json'), 'utf8'),
  ])
  const desktopManifest = JSON.parse(desktopManifestText)
  const support = JSON.parse(supportText)
  return normalizedMetadata({
    version: desktopManifest.version,
    channel: normalizeUpdateChannel(channel),
    runtime: {
      version: support?.runtime?.version,
      integrity: support?.runtime?.integrity,
    },
    provider: support?.provider?.providerId,
    desktopApi: DESKTOP_API_VERSION,
    presetSchema: 'dshpreset-v1',
    taskSchema: 3,
    matrixArtifact: 'runtime-support/supported-runtimes.json',
  })
}

function optionValue(argumentsList, name) {
  const index = argumentsList.indexOf(name)
  return index >= 0 ? argumentsList[index + 1] : undefined
}

async function main() {
  const argumentsList = process.argv.slice(2)
  if (argumentsList.includes('--assert-signing')) {
    const configuration = assertSigningConfiguration()
    console.log(`signing configuration: ${configuration.required ? 'required' : 'optional'}${configuration.source ? ` (${configuration.source})` : ''}`)
    return
  }
  const directory = resolve(process.cwd(), optionValue(argumentsList, '--directory') ?? 'dist')
  const configuration = assertSigningConfiguration()
  if (argumentsList.includes('--verify-signatures')) {
    const signatures = await verifyWindowsExecutableSignatures({
      directory,
      requireSigning: configuration.required,
      signatureVerifier: verifyWindowsSignature,
    })
    console.log(JSON.stringify(signatures))
    return
  }
  if (argumentsList.includes('--write')) {
    const metadata = await defaultReleaseMetadata({ channel: optionValue(argumentsList, '--channel') ?? DEFAULT_CHANNEL_FROM_ENV })
    const checksumPath = await writeReleaseChecksums(directory)
    const manifest = await createReleaseManifest({
      directory,
      metadata,
      signatureVerifier: (path) => verifyWindowsSignature(path, { requireTimestamp: configuration.required }),
    })
    const path = await writeReleaseManifest(directory, manifest)
    console.log(`wrote ${checksumPath}`)
    console.log(`wrote ${path}`)
    return
  }
  if (argumentsList.includes('--verify')) {
    const manifest = JSON.parse(await readFile(join(directory, RELEASE_MANIFEST_NAME), 'utf8'))
    await verifyReleaseManifest({
      directory,
      manifest,
      requireSigning: configuration.required,
      signatureVerifier: (path) => verifyWindowsSignature(path, { requireTimestamp: configuration.required }),
    })
    console.log(`verified ${RELEASE_MANIFEST_NAME}`)
    return
  }
  throw new Error('use --assert-signing, --verify-signatures, --write, or --verify')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
