import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

export const EXTERNAL_PLUGIN_SOURCE_SCHEMA_VERSION = 1

/**
 * A source type describes the transport that pnpm will consume. `npm`, `git`,
 * and `https` are deliberately unresolved: resolving them must not download,
 * execute, or inspect unapproved third-party code.
 */
export const EXTERNAL_PLUGIN_SOURCE_TYPES = Object.freeze([
  'directory',
  'tarball',
  'npm',
  'git',
  'https',
])

/** The user-facing spelling that produced a source descriptor. */
export const EXTERNAL_PLUGIN_REFERENCE_TYPES = Object.freeze([
  'path',
  'file',
  'link',
  'workspace',
  'npm',
  'git',
  'https',
])

/** How confidently `package.name` represents the package pnpm will install. */
export const EXTERNAL_PLUGIN_PACKAGE_IDENTITIES = Object.freeze([
  'manifest',
  'npm',
  'npm-alias',
  'opaque',
])

/** What the descriptor fingerprint represents. */
export const EXTERNAL_PLUGIN_FINGERPRINT_KINDS = Object.freeze([
  'content',
  'reference',
])

const EXTERNAL_PLUGIN_SOURCE_TYPE_SET = new Set(EXTERNAL_PLUGIN_SOURCE_TYPES)
const EXTERNAL_PLUGIN_REFERENCE_TYPE_SET = new Set(EXTERNAL_PLUGIN_REFERENCE_TYPES)
const EXTERNAL_PLUGIN_PACKAGE_IDENTITY_SET = new Set(EXTERNAL_PLUGIN_PACKAGE_IDENTITIES)
const EXTERNAL_PLUGIN_FINGERPRINT_KIND_SET = new Set(EXTERNAL_PLUGIN_FINGERPRINT_KINDS)
const REMOTE_SOURCE_TYPES = new Set(['npm', 'git', 'https'])
const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u
const REMOTE_WHITESPACE_PATTERN = /\s/u
const REMOTE_SHELL_CHARACTER_PATTERN = /[`$;|<>"']/u
const REMOTE_SHELL_SEQUENCE_PATTERN = /&&/u
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu
const GIT_HOSTED_REFERENCE_PATTERN = /^(?:github|gitlab|bitbucket|gist):[^/\s][^\s]*$/iu
const GIT_SCP_REFERENCE_PATTERN = /^git@[^:/\s]+:[^\s]+$/u
const REMOTE_CANONICAL_PATH_PATTERN = /^remote:(npm|git|https):[a-f0-9]{64}$/u

function sourceError(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.code = code
  return error
}

function assertNonEmptyString(value, label) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function assertExternalPluginReference(value) {
  const reference = assertNonEmptyString(value, 'external plugin reference')
  if (reference.length > 8_192) {
    throw sourceError('external-plugin-source-invalid-reference', 'external plugin reference is too long')
  }
  if (reference.startsWith('-')) {
    throw sourceError('external-plugin-source-invalid-reference', 'external plugin reference must not start with an option prefix')
  }
  return reference
}

function assertRemoteReferenceSyntax(value) {
  if (
    REMOTE_WHITESPACE_PATTERN.test(value)
    || REMOTE_SHELL_CHARACTER_PATTERN.test(value)
    || REMOTE_SHELL_SEQUENCE_PATTERN.test(value)
  ) {
    throw sourceError('external-plugin-source-invalid-reference', 'external plugin remote reference contains unsafe characters')
  }
  return value
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function hashBytes(...values) {
  const hash = createHash('sha256')
  for (const value of values) hash.update(value)
  return `sha256:${hash.digest('hex')}`
}

function portablePath(path) {
  return path.replaceAll('\\', '/')
}

function isWindowsAbsolutePath(value) {
  return /^[a-z]:[\\/]/iu.test(value) || value.startsWith('\\\\')
}

function looksLikeLocalPath(value) {
  return value.startsWith('.') || isAbsolute(value) || isWindowsAbsolutePath(value)
}

function normalizeBaseDir(baseDir) {
  assertNonEmptyString(baseDir, 'baseDir')
  return resolve(baseDir)
}

function localPathFromFileReference(reference, baseDir) {
  const body = reference.slice('file:'.length)
  if (body.length === 0) {
    throw sourceError('external-plugin-source-invalid-reference', 'file reference must name a local path')
  }
  if (body.startsWith('//')) {
    try {
      return fileURLToPath(new URL(reference))
    } catch (error) {
      throw sourceError('external-plugin-source-invalid-reference', 'file reference is invalid', error)
    }
  }
  return resolve(baseDir, body)
}

function packageNameFromRegistrySpec(value) {
  if (typeof value !== 'string' || value.length === 0) return undefined
  let name
  if (value.startsWith('@')) {
    const slash = value.indexOf('/')
    if (slash < 2) return undefined
    const versionSeparator = value.indexOf('@', slash + 1)
    name = versionSeparator === -1 ? value : value.slice(0, versionSeparator)
  } else {
    const versionSeparator = value.indexOf('@')
    name = versionSeparator === -1 ? value : value.slice(0, versionSeparator)
  }
  return NPM_PACKAGE_NAME_PATTERN.test(name) ? name : undefined
}

function hasSafeRegistrySpecifier(value, packageName) {
  const suffix = value.slice(packageName.length)
  if (suffix.length === 0) return true
  if (!suffix.startsWith('@') || suffix.length === 1) return false
  // Registry tags and semver ranges need no URL, path, or shell syntax. A
  // non-registry source must use one of the explicit git/HTTPS/file forms.
  return !/[:\\/`$;|<>"']/u.test(suffix.slice(1))
}

function createRemoteReference({ reference, sourceType, referenceType, packageName, packageIdentity }) {
  return Object.freeze({
    kind: 'remote',
    reference,
    sourceType,
    referenceType,
    installSpec: reference,
    ...(packageName === undefined ? {} : { packageName }),
    ...(packageIdentity === undefined ? {} : { packageIdentity }),
  })
}

function parseNpmReference(reference, { includeBare = false } = {}) {
  if (reference.startsWith('npm:')) {
    const target = reference.slice('npm:'.length)
    const packageName = packageNameFromRegistrySpec(target)
    if (packageName === undefined || !hasSafeRegistrySpecifier(target, packageName)) {
      throw sourceError('external-plugin-source-invalid-reference', 'npm reference must name a registry package')
    }
    return createRemoteReference({
      reference,
      sourceType: 'npm',
      referenceType: 'npm',
      packageName,
      packageIdentity: 'npm',
    })
  }

  const aliasSeparator = reference.indexOf('@npm:')
  if (aliasSeparator > 0) {
    const alias = reference.slice(0, aliasSeparator)
    const target = reference.slice(aliasSeparator + '@npm:'.length)
    const packageName = packageNameFromRegistrySpec(target)
    if (!NPM_PACKAGE_NAME_PATTERN.test(alias) || packageName === undefined || !hasSafeRegistrySpecifier(target, packageName)) {
      throw sourceError('external-plugin-source-invalid-reference', 'npm alias reference is invalid')
    }
    return createRemoteReference({
      reference,
      sourceType: 'npm',
      referenceType: 'npm',
      packageName: alias,
      packageIdentity: 'npm-alias',
    })
  }

  const packageName = packageNameFromRegistrySpec(reference)
  if (packageName === undefined) return undefined
  if (!hasSafeRegistrySpecifier(reference, packageName)) return undefined
  if (!includeBare && !reference.startsWith('@') && !reference.includes('@')) return undefined
  return createRemoteReference({
    reference,
    sourceType: 'npm',
    referenceType: 'npm',
    packageName,
    packageIdentity: 'npm',
  })
}

function validateRemoteUrl(reference, protocols, message, { allowSshUsername = false } = {}) {
  let url
  try {
    url = new URL(reference)
  } catch (error) {
    throw sourceError('external-plugin-source-invalid-reference', message, error)
  }
  const protocol = url.protocol.toLowerCase()
  const usernameAllowed = allowSshUsername
    && (protocol === 'git+ssh:' || protocol === 'ssh:')
    && /^[a-z0-9._-]+$/iu.test(url.username)
  if (
    !protocols.has(protocol)
    || (protocol !== 'git+file:' && url.hostname.length === 0)
    || (url.username.length > 0 && !usernameAllowed)
    || url.password.length > 0
  ) {
    throw sourceError('external-plugin-source-invalid-reference', message)
  }
  return url
}

function parseGitReference(reference) {
  if (GIT_HOSTED_REFERENCE_PATTERN.test(reference) || GIT_SCP_REFERENCE_PATTERN.test(reference)) {
    return createRemoteReference({ reference, sourceType: 'git', referenceType: 'git' })
  }

  if (/^(?:git\+(?:https|ssh|file)|git|ssh):/iu.test(reference)) {
    validateRemoteUrl(
      reference,
      new Set(['git+https:', 'git+ssh:', 'git+file:', 'git:', 'ssh:']),
      'git reference is invalid',
      { allowSshUsername: true },
    )
    return createRemoteReference({ reference, sourceType: 'git', referenceType: 'git' })
  }
  return undefined
}

/**
 * Content staging accepts only a closed regular-file tree. Resolve-time link
 * detection turns linked sources into one-time references; repeat the lstat
 * guard here so a link introduced after consent cannot be followed or copied.
 */
async function copyPluginEntry(source, destination) {
  const metadata = await lstat(source)
  if (metadata.isSymbolicLink()) {
    throw sourceError('external-plugin-source-staging-linked-entry', 'external plugin source contains a linked entry and cannot be content-staged')
  }
  if (metadata.isDirectory()) {
    await mkdir(destination, { recursive: false, mode: 0o700 })
    const entries = await readdir(source, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      await copyPluginEntry(join(source, entry.name), join(destination, entry.name))
    }
    return
  }
  if (!metadata.isFile()) {
    throw sourceError('external-plugin-source-staging-unsupported-entry', 'external plugin source contains an unsupported entry')
  }
  await copyFile(source, destination, 0)
}

function parseHttpsReference(reference) {
  if (!/^https:/iu.test(reference)) return undefined
  validateRemoteUrl(reference, new Set(['https:']), 'HTTPS reference is invalid')
  return createRemoteReference({ reference, sourceType: 'https', referenceType: 'https' })
}

/**
 * Parse a pnpm source that cannot be inspected until after the user accepts a
 * native full-permission prompt. This function is intentionally side-effect
 * free: it neither invokes pnpm nor reaches the network.
 */
export function parseRemoteExternalPluginReference(reference, options = {}) {
  const rawReference = assertExternalPluginReference(reference)
  assertRemoteReferenceSyntax(rawReference)
  const npm = parseNpmReference(rawReference, options)
  if (npm !== undefined) return npm
  const git = parseGitReference(rawReference)
  if (git !== undefined) return git
  const https = parseHttpsReference(rawReference)
  if (https !== undefined) return https
  return undefined
}

function hasExplicitRemoteSyntax(reference) {
  if (
    reference.startsWith('@')
    || reference.startsWith('npm:')
    || reference.includes('@npm:')
    || GIT_SCP_REFERENCE_PATTERN.test(reference)
    || /^(?:github|gitlab|bitbucket|gist|git\+(?:https|ssh|file)|git|ssh|https):/iu.test(reference)
  ) {
    return true
  }
  return reference.includes('@') && packageNameFromRegistrySpec(reference) !== undefined
}

/**
 * Parse a local source or a side-effect-free remote pnpm reference.
 * `workspace:` values deliberately require a real path; a package-only value
 * such as `workspace:*` cannot be reproduced in an isolated recovery profile
 * without first resolving it. Bare values remain paths at this stage so an
 * existing local `plugin` directory keeps its historical meaning; `resolve()`
 * falls back to a bare npm package only when that local path is absent.
 */
export function parseExternalPluginReference(reference, { baseDir = process.cwd() } = {}) {
  const rawReference = assertExternalPluginReference(reference)
  const normalizedBaseDir = normalizeBaseDir(baseDir)
  let referenceType = 'path'
  let path

  if (rawReference.startsWith('file:')) {
    referenceType = 'file'
    path = localPathFromFileReference(rawReference, normalizedBaseDir)
  } else if (rawReference.startsWith('link:')) {
    referenceType = 'link'
    const target = rawReference.slice('link:'.length)
    assertNonEmptyString(target, 'link reference target')
    path = resolve(normalizedBaseDir, target)
  } else if (rawReference.startsWith('workspace:')) {
    referenceType = 'workspace'
    const target = rawReference.slice('workspace:'.length)
    assertNonEmptyString(target, 'workspace reference target')
    if (!looksLikeLocalPath(target)) {
      throw sourceError(
        'external-plugin-source-workspace-unresolved',
        'workspace reference must be resolved to a local directory before use',
      )
    }
    path = resolve(normalizedBaseDir, target)
  } else {
    if (hasExplicitRemoteSyntax(rawReference)) {
      const remote = parseRemoteExternalPluginReference(rawReference)
      if (remote !== undefined) return Object.freeze({ ...remote, baseDir: normalizedBaseDir })
      if (
        rawReference.startsWith('@')
        || rawReference.includes('@npm:')
        || (rawReference.includes('@') && packageNameFromRegistrySpec(rawReference) !== undefined)
      ) {
        throw sourceError('external-plugin-source-invalid-reference', 'external plugin npm reference is invalid')
      }
    }

    // A protocol other than Windows drive syntax is neither a local source nor
    // one of the explicitly supported pnpm remote forms.
    if (/^[a-z][a-z0-9+.-]*:/iu.test(rawReference) && !isWindowsAbsolutePath(rawReference)) {
      throw sourceError('external-plugin-source-remote-unsupported', 'external plugin source protocol is unsupported')
    }
    path = resolve(normalizedBaseDir, rawReference)
  }

  return Object.freeze({
    kind: 'local',
    reference: rawReference,
    referenceType,
    path,
    baseDir: normalizedBaseDir,
  })
}

function packageManifestError(message, cause) {
  return sourceError('external-plugin-source-package-manifest-invalid', message, cause)
}

function normalizePackageManifest(value) {
  if (!isPlainObject(value)) throw packageManifestError('plugin package manifest must be a JSON object')
  const name = assertNonEmptyString(value.name, 'plugin package name')
  const version = typeof value.version === 'string' && value.version.length > 0 ? value.version : undefined
  const bundlePatch = typeof value.dsh?.bundle?.patch === 'string' && value.dsh.bundle.patch.length > 0
    ? value.dsh.bundle.patch
    : undefined
  return Object.freeze({
    name,
    ...(version === undefined ? {} : { version }),
    ...(bundlePatch === undefined ? {} : { bundlePatch }),
  })
}

async function readDirectoryManifest(directory) {
  let raw
  try {
    raw = await readFile(join(directory, 'package.json'), 'utf8')
  } catch (error) {
    throw packageManifestError('plugin directory must contain a readable package.json', error)
  }
  try {
    return normalizePackageManifest(JSON.parse(raw))
  } catch (error) {
    if (error?.code === 'external-plugin-source-package-manifest-invalid') throw error
    throw packageManifestError('plugin package.json is invalid JSON', error)
  }
}

function allZero(buffer) {
  for (const byte of buffer) {
    if (byte !== 0) return false
  }
  return true
}

function tarString(field) {
  const end = field.indexOf(0)
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8').trim()
}

function tarSize(field) {
  const text = tarString(field)
  if (text.length === 0) return 0
  if (!/^[0-7]+$/u.test(text)) {
    throw packageManifestError('plugin tarball has an invalid entry size')
  }
  const size = Number.parseInt(text, 8)
  if (!Number.isSafeInteger(size) || size < 0) {
    throw packageManifestError('plugin tarball entry size is invalid')
  }
  return size
}

function tarEntryPath(header) {
  const name = tarString(header.subarray(0, 100))
  const prefix = tarString(header.subarray(345, 500))
  return prefix.length === 0 ? name : `${prefix}/${name}`
}

function readTarPackageManifest(compressed) {
  let archive
  try {
    archive = gunzipSync(compressed)
  } catch (error) {
    throw packageManifestError('plugin tarball is not a readable gzip archive', error)
  }
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (allZero(header)) break
    const size = tarSize(header.subarray(124, 136))
    const contentStart = offset + 512
    const contentEnd = contentStart + size
    if (contentEnd > archive.length) {
      throw packageManifestError('plugin tarball entry extends beyond the archive')
    }
    const entryPath = tarEntryPath(header)
    if (entryPath === 'package/package.json' || entryPath === 'package.json') {
      try {
        return normalizePackageManifest(JSON.parse(archive.subarray(contentStart, contentEnd).toString('utf8')))
      } catch (error) {
        if (error?.code === 'external-plugin-source-package-manifest-invalid') throw error
        throw packageManifestError('plugin tarball package.json is invalid JSON', error)
      }
    }
    offset = contentStart + Math.ceil(size / 512) * 512
  }
  throw packageManifestError('plugin tarball must contain package/package.json')
}

async function fingerprintDirectory(directory) {
  const hash = createHash('sha256')
  hash.update('dsh-external-plugin-directory-v1\0')
  let hasLinkedEntries = false

  async function visit(current, relativePath) {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    for (const entry of entries) {
      const absolutePath = join(current, entry.name)
      const relative = relativePath.length === 0 ? entry.name : `${relativePath}/${entry.name}`
      const metadata = await lstat(absolutePath)
      if (metadata.isDirectory()) {
        hash.update(`directory\0${relative}\0`)
        await visit(absolutePath, relative)
      } else if (metadata.isFile()) {
        const content = await readFile(absolutePath)
        hash.update(`file\0${relative}\0${content.length}\0`)
        hash.update(content)
        hash.update('\0')
      } else if (metadata.isSymbolicLink()) {
        hasLinkedEntries = true
        // Do not follow a link merely to decide whether it targets a file or a
        // directory. A junction can point outside the chosen source and be
        // retargeted after approval. Any local tree containing a link is thus
        // an opaque, one-time reference: never a content fingerprint or an
        // input to content staging.
        hash.update(`linked-entry\0${relative}\0`)
      } else {
        // It is not meaningful to make a runtime plugin descriptor for a
        // device, socket, or FIFO. Fail rather than silently hashing less than
        // the user approved.
        throw sourceError('external-plugin-source-unsupported-entry', `plugin source contains unsupported entry: ${relative}`)
      }
    }
  }

  await visit(directory, '')
  return Object.freeze({
    fingerprint: `sha256:${hash.digest('hex')}`,
    hasLinkedEntries,
  })
}

function descriptorIdentity(sourceType, canonicalPath) {
  return hashBytes('dsh-external-plugin-source-v1\0', sourceType, '\0', portablePath(canonicalPath))
}

function descriptorCandidateId(sourceId, contentFingerprint) {
  return hashBytes('dsh-external-plugin-candidate-v1\0', sourceId, '\0', contentFingerprint)
}

function remoteReferenceFingerprint(sourceType, installSpec) {
  return hashBytes('dsh-external-plugin-remote-reference-v1\0', sourceType, '\0', installSpec)
}

/**
 * A directory which contains a junction/symlink is not a closed content tree:
 * its target can change after the native prompt. Keep a path-free opaque
 * identity for the one-time source approval, but never present a partial tree
 * hash as a content identity.
 */
function localLinkedReferenceFingerprint(sourceType, canonicalPath) {
  return hashBytes(
    'dsh-external-plugin-linked-reference-v1\0',
    sourceType,
    '\0',
    portablePath(canonicalPath),
  )
}

function opaqueRemoteCanonicalPath(sourceType, referenceFingerprint) {
  return `remote:${sourceType}:${referenceFingerprint.slice('sha256:'.length)}`
}

function opaqueRemotePackageName(sourceId) {
  return `external-source-${sourceId.slice('sha256:'.length, 'sha256:'.length + 24)}`
}

function installSpecFor({ sourceType, referenceType, canonicalPath }) {
  if (sourceType === 'directory' && (referenceType === 'link' || referenceType === 'workspace')) {
    return `link:${portablePath(canonicalPath)}`
  }
  return pathToFileURL(canonicalPath).href
}

function loaderFor(sourceType, manifest, installSpec, { packageIdentity = 'manifest' } = {}) {
  return Object.freeze({
    sourceType,
    installSpec,
    packageName: manifest.name,
    packageIdentity,
    ...(manifest.bundlePatch === undefined
      ? { declaredDshBundle: false }
      : { declaredDshBundle: true, bundlePatch: manifest.bundlePatch }),
  })
}

function approvalFor(fingerprintKind, { hasLinkedEntries = false } = {}) {
  return Object.freeze({
    mode: 'native-confirmation',
    // Only a resolved local content fingerprint can safely be granted beyond
    // the current confirmation. A remote URL, mutable git ref, or local tree
    // with linked entries is merely a reference, not evidence of stable bytes.
    maximumTrustScope: fingerprintKind === 'content' && !hasLinkedEntries ? 'source' : 'once',
  })
}

function createRemoteDescriptor(parsed) {
  const sourceType = parsed.sourceType
  const contentFingerprint = remoteReferenceFingerprint(sourceType, parsed.installSpec)
  const canonicalPath = opaqueRemoteCanonicalPath(sourceType, contentFingerprint)
  const sourceId = descriptorIdentity(sourceType, canonicalPath)
  const candidateId = descriptorCandidateId(sourceId, contentFingerprint)
  const packageIdentity = parsed.packageIdentity ?? 'opaque'
  const packageName = parsed.packageName ?? opaqueRemotePackageName(sourceId)
  const packageInfo = Object.freeze({
    name: packageName,
    identity: packageIdentity,
  })
  const manifest = Object.freeze({ name: packageName })
  const descriptor = Object.freeze({
    schemaVersion: EXTERNAL_PLUGIN_SOURCE_SCHEMA_VERSION,
    sourceId,
    candidateId,
    sourceType,
    referenceType: parsed.referenceType,
    canonicalPath,
    installSpec: parsed.installSpec,
    contentFingerprint,
    fingerprintKind: 'reference',
    hasLinkedEntries: false,
    displayName: sourceType === 'npm' ? packageName : `External ${sourceType} source`,
    package: packageInfo,
    loader: loaderFor(sourceType, manifest, parsed.installSpec, { packageIdentity }),
    approval: approvalFor('reference'),
  })
  return assertExternalPluginDescriptor(descriptor)
}

/**
 * Assert the descriptor shape shared with the private trust store. The
 * descriptor intentionally includes the canonical filesystem path because it
 * is only a main-process object; callers must project it before renderer IPC.
 */
export function assertExternalPluginDescriptor(value) {
  if (!isPlainObject(value)) throw new TypeError('external plugin descriptor must be an object')
  if (value.schemaVersion !== EXTERNAL_PLUGIN_SOURCE_SCHEMA_VERSION) {
    throw new TypeError('external plugin descriptor schema version is unsupported')
  }
  if (!EXTERNAL_PLUGIN_SOURCE_TYPE_SET.has(value.sourceType)) throw new TypeError('external plugin descriptor source type is invalid')
  if (!EXTERNAL_PLUGIN_REFERENCE_TYPE_SET.has(value.referenceType)) throw new TypeError('external plugin descriptor reference type is invalid')
  for (const [key, label] of [
    ['sourceId', 'source ID'],
    ['candidateId', 'candidate ID'],
    ['contentFingerprint', 'content fingerprint'],
  ]) {
    if (typeof value[key] !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(value[key])) {
      throw new TypeError(`external plugin descriptor ${label} is invalid`)
    }
  }
  assertNonEmptyString(value.canonicalPath, 'external plugin descriptor canonical path')
  assertNonEmptyString(value.installSpec, 'external plugin descriptor install spec')
  const fingerprintKind = value.fingerprintKind ?? 'content'
  if (!EXTERNAL_PLUGIN_FINGERPRINT_KIND_SET.has(fingerprintKind)) {
    throw new TypeError('external plugin descriptor fingerprint kind is invalid')
  }
  const hasLinkedEntries = value.hasLinkedEntries ?? false
  if (typeof hasLinkedEntries !== 'boolean') {
    throw new TypeError('external plugin descriptor linked entry flag is invalid')
  }
  if (REMOTE_SOURCE_TYPES.has(value.sourceType)) {
    if (value.referenceType !== value.sourceType) {
      throw new TypeError('external plugin descriptor remote reference type is invalid')
    }
    if (fingerprintKind !== 'reference') {
      throw new TypeError('external plugin descriptor remote fingerprint must identify a reference')
    }
    if (hasLinkedEntries) {
      throw new TypeError('external plugin descriptor remote source cannot contain local linked entries')
    }
    if (!REMOTE_CANONICAL_PATH_PATTERN.test(value.canonicalPath)) {
      throw new TypeError('external plugin descriptor remote canonical path is invalid')
    }
    assertExternalPluginReference(value.installSpec)
    assertRemoteReferenceSyntax(value.installSpec)
    const parsedRemote = parseRemoteExternalPluginReference(value.installSpec, { includeBare: true })
    if (
      parsedRemote === undefined
      || parsedRemote.sourceType !== value.sourceType
      || parsedRemote.referenceType !== value.referenceType
    ) {
      throw new TypeError('external plugin descriptor remote install spec is invalid')
    }
  } else if (hasLinkedEntries && fingerprintKind !== 'reference') {
    throw new TypeError('external plugin descriptor linked local source must identify a reference')
  } else if (fingerprintKind === 'reference') {
    if (!hasLinkedEntries) {
      throw new TypeError('external plugin descriptor local reference must identify linked entries')
    }
  } else if (fingerprintKind !== 'content') {
    throw new TypeError('external plugin descriptor local fingerprint must identify content or linked reference')
  }
  if (!isPlainObject(value.package)) throw new TypeError('external plugin descriptor package is invalid')
  assertNonEmptyString(value.package.name, 'external plugin descriptor package name')
  const packageIdentity = value.package.identity ?? 'manifest'
  if (!EXTERNAL_PLUGIN_PACKAGE_IDENTITY_SET.has(packageIdentity)) {
    throw new TypeError('external plugin descriptor package identity is invalid')
  }
  if (REMOTE_SOURCE_TYPES.has(value.sourceType) && packageIdentity === 'manifest') {
    throw new TypeError('external plugin descriptor remote package identity is invalid')
  }
  if (
    (value.sourceType === 'npm' && !['npm', 'npm-alias'].includes(packageIdentity))
    || (value.sourceType !== 'npm' && REMOTE_SOURCE_TYPES.has(value.sourceType) && packageIdentity !== 'opaque')
  ) {
    throw new TypeError('external plugin descriptor remote package identity does not match source type')
  }
  if (!isPlainObject(value.loader)) throw new TypeError('external plugin descriptor loader is invalid')
  if (value.loader.sourceType !== undefined && value.loader.sourceType !== value.sourceType) {
    throw new TypeError('external plugin descriptor loader source type is invalid')
  }
  if (value.loader.installSpec !== undefined && value.loader.installSpec !== value.installSpec) {
    throw new TypeError('external plugin descriptor loader install spec is invalid')
  }
  if (value.loader.packageName !== undefined && value.loader.packageName !== value.package.name) {
    throw new TypeError('external plugin descriptor loader package name is invalid')
  }
  if (value.loader.packageIdentity !== undefined && value.loader.packageIdentity !== packageIdentity) {
    throw new TypeError('external plugin descriptor loader package identity is invalid')
  }
  if (value.loader.declaredDshBundle !== undefined && typeof value.loader.declaredDshBundle !== 'boolean') {
    throw new TypeError('external plugin descriptor loader DSH bundle flag is invalid')
  }
  if (REMOTE_SOURCE_TYPES.has(value.sourceType) && value.approval === undefined) {
    throw new TypeError('external plugin descriptor remote approval is required')
  }
  if (value.approval !== undefined) {
    if (!isPlainObject(value.approval) || value.approval.mode !== 'native-confirmation') {
      throw new TypeError('external plugin descriptor approval is invalid')
    }
    if (!['once', 'source'].includes(value.approval.maximumTrustScope)) {
      throw new TypeError('external plugin descriptor approval scope is invalid')
    }
    if (fingerprintKind === 'reference' && value.approval.maximumTrustScope !== 'once') {
      throw new TypeError('external plugin descriptor unresolved source requires one-time approval')
    }
  }
  return value
}

/** Create a renderer-safe descriptor summary with no original filesystem path. */
export function createExternalPluginSourceSummary(descriptor) {
  const value = assertExternalPluginDescriptor(descriptor)
  return Object.freeze({
    schemaVersion: EXTERNAL_PLUGIN_SOURCE_SCHEMA_VERSION,
    candidateId: value.candidateId,
    sourceId: value.sourceId,
    sourceType: value.sourceType,
    referenceType: value.referenceType,
    displayName: value.displayName ?? value.package.name ?? basename(value.canonicalPath),
    contentFingerprint: value.contentFingerprint,
    fingerprintKind: value.fingerprintKind ?? 'content',
    hasLinkedEntries: value.hasLinkedEntries === true,
    approval: Object.freeze({
      maximumTrustScope: value.approval?.maximumTrustScope ?? 'source',
    }),
    package: Object.freeze({
      name: value.package.name,
      identity: value.package.identity ?? 'manifest',
      ...(value.package.version === undefined ? {} : { version: value.package.version }),
      declaredDshBundle: value.loader.declaredDshBundle === true,
    }),
  })
}

/**
 * Resolve user-selected local sources, or classify an explicit pnpm remote
 * source without touching the network. It performs no installation,
 * mutation, compatibility judgement, or loading; the caller must obtain a
 * separate trust decision before passing the result to a free-mode session.
 */
export class ExternalPluginSourceResolver {
  constructor({ baseDir = process.cwd() } = {}) {
    this.baseDir = normalizeBaseDir(baseDir)
  }

  async resolve(reference, { baseDir = this.baseDir } = {}) {
    const parsed = parseExternalPluginReference(reference, { baseDir })
    if (parsed.kind === 'remote') return createRemoteDescriptor(parsed)

    let canonicalPath
    try {
      canonicalPath = await realpath(parsed.path)
    } catch (error) {
      // A bare package name historically meant a relative path. Preserve that
      // precedence, but allow `plugin-name` to become a registry request when
      // no such local source exists. Explicit `npm:` remains unambiguous.
      if (
        parsed.referenceType === 'path'
        && !looksLikeLocalPath(parsed.reference)
        && NPM_PACKAGE_NAME_PATTERN.test(parsed.reference)
      ) {
        const remote = parseRemoteExternalPluginReference(parsed.reference, { includeBare: true })
        if (remote !== undefined) return createRemoteDescriptor(remote)
      }
      throw sourceError('external-plugin-source-not-found', 'external plugin source could not be resolved', error)
    }

    let metadata
    try {
      metadata = await lstat(canonicalPath)
    } catch (error) {
      throw sourceError('external-plugin-source-not-found', 'external plugin source could not be inspected', error)
    }

    let sourceType
    let contentFingerprint
    let hasLinkedEntries = false
    let packageManifest
    if (metadata.isDirectory()) {
      sourceType = 'directory'
      packageManifest = await readDirectoryManifest(canonicalPath)
      const fingerprint = await fingerprintDirectory(canonicalPath)
      contentFingerprint = fingerprint.fingerprint
      hasLinkedEntries = fingerprint.hasLinkedEntries
    } else if (metadata.isFile()) {
      if (extname(canonicalPath).toLowerCase() !== '.tgz') {
        throw sourceError('external-plugin-source-unsupported-file', 'external plugin files must use the .tgz extension')
      }
      sourceType = 'tarball'
      let archive
      try {
        archive = await readFile(canonicalPath)
      } catch (error) {
        throw sourceError('external-plugin-source-not-readable', 'external plugin tarball could not be read', error)
      }
      contentFingerprint = hashBytes('dsh-external-plugin-tarball-v1\0', archive)
      packageManifest = readTarPackageManifest(archive)
    } else {
      throw sourceError('external-plugin-source-unsupported', 'external plugin source must be a directory or .tgz file')
    }

    const sourceId = descriptorIdentity(sourceType, canonicalPath)
    const fingerprintKind = hasLinkedEntries ? 'reference' : 'content'
    const descriptorFingerprint = fingerprintKind === 'reference'
      ? localLinkedReferenceFingerprint(sourceType, canonicalPath)
      : contentFingerprint
    const candidateId = descriptorCandidateId(sourceId, descriptorFingerprint)
    const installSpec = installSpecFor({ sourceType, referenceType: parsed.referenceType, canonicalPath })
    const packageInfo = Object.freeze({
      name: packageManifest.name,
      identity: 'manifest',
      ...(packageManifest.version === undefined ? {} : { version: packageManifest.version }),
      ...(packageManifest.bundlePatch === undefined ? {} : { bundlePatch: packageManifest.bundlePatch }),
    })
    const descriptor = Object.freeze({
      schemaVersion: EXTERNAL_PLUGIN_SOURCE_SCHEMA_VERSION,
      sourceId,
      candidateId,
      sourceType,
      referenceType: parsed.referenceType,
      canonicalPath,
      installSpec,
      contentFingerprint: descriptorFingerprint,
      fingerprintKind,
      hasLinkedEntries,
      package: packageInfo,
      loader: loaderFor(sourceType, packageManifest, installSpec),
      approval: approvalFor(fingerprintKind, { hasLinkedEntries }),
    })
    return assertExternalPluginDescriptor(descriptor)
  }
}

/**
 * Materialize a confirmed local source inside a Desktop-owned Free Mode
 * session before pnpm sees it. Re-resolving the staged bytes closes the gap
 * between user confirmation and installation: a directory or .tgz changed
 * during the copy is rejected rather than silently becoming new code.
 *
 * This is deliberately unavailable for remote references. Their descriptors
 * identify only a mutable reference and are always one-time confirmations.
 */
export async function stageExternalPluginSource(descriptor, { stagingDirectory } = {}) {
  const original = assertExternalPluginDescriptor(descriptor)
  if ((original.fingerprintKind ?? 'content') !== 'content') {
    throw sourceError('external-plugin-source-staging-unsupported', 'only local content-addressed plugin sources can be staged')
  }
  if (typeof stagingDirectory !== 'string' || stagingDirectory.length === 0) {
    throw new TypeError('external plugin staging directory is required')
  }
  const root = resolve(stagingDirectory)
  const digest = original.contentFingerprint.slice('sha256:'.length)
  const stagedPath = join(root, original.sourceType === 'tarball' ? `${digest}.tgz` : digest)
  const sourcePath = original.canonicalPath
  await mkdir(root, { recursive: true, mode: 0o700 })
  try {
    // Never merge into a pre-existing staging target. A Free Mode session has
    // a private root, so a collision indicates unexpected recovery state.
    await lstat(stagedPath).then(
      () => { throw sourceError('external-plugin-source-staging-exists', 'external plugin staging target already exists') },
      (error) => {
        if (error?.code !== 'ENOENT') throw error
      },
    )
    if (original.sourceType === 'directory') {
      await copyPluginEntry(sourcePath, stagedPath)
    } else if (original.sourceType === 'tarball') {
      await copyFile(sourcePath, stagedPath, 0)
    } else {
      throw sourceError('external-plugin-source-staging-unsupported', 'external plugin source type cannot be staged')
    }

    const staged = await new ExternalPluginSourceResolver({ baseDir: root }).resolve(stagedPath)
    if (
      staged.sourceType !== original.sourceType
      || staged.contentFingerprint !== original.contentFingerprint
      || staged.package.name !== original.package.name
    ) {
      throw sourceError('external-plugin-source-staging-mismatch', 'external plugin source changed while staging')
    }
    // Retain the original source/candidate identity for the permission store,
    // but make pnpm consume the verified staged copy. The renderer never sees
    // either install spec or canonical path.
    return assertExternalPluginDescriptor(Object.freeze({
      ...original,
      installSpec: staged.installSpec,
      loader: Object.freeze({ ...original.loader, installSpec: staged.installSpec }),
    }))
  } catch (error) {
    await rm(stagedPath, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/** Convenience form for one-off main-process resolution. */
export async function resolveExternalPluginSource(reference, options = {}) {
  const resolver = new ExternalPluginSourceResolver(options)
  return resolver.resolve(reference, options)
}
