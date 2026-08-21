import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import semver from 'semver'
import YAML from 'yaml'

export const PRESET_FORMAT_VERSION = 1
export const PRESET_EXTENSION = 'dshpreset'
export const PRESET_LIMITS = Object.freeze({
  archiveBytes: 24 * 1024 * 1024,
  entries: 512,
  entryBytes: 4 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  compressionRatio: 100,
})

const REQUIRED_FILES = Object.freeze([
  'dsh-preset.json',
  'packages.lock.json',
  'settings.json',
  'task-templates.json',
  'README.md',
  'integrity.json',
])
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const SHA512_PATTERN = /^sha512-[a-z0-9+/]+={0,2}$/iu
const SECRET_NAME_PATTERN = /(?:api[-_]?key|credential|password|private[-_]?key|secret|token)/iu
const SECRET_VALUE_PATTERN = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|gh[pousr])[-_][a-z0-9]{12,}|(?:api[-_ ]?key|password|private[-_ ]?key|secret|token)["']?\s*[:=]\s*["']?[^\s"']{8,})/iu
const SENSITIVE_PATH_PATTERN = /(?:^|[._-])(?:api[-_]?key|credentials?|passwords?|private[-_]?key|secrets?|tokens?|cookies?)(?:[._-]|$)/iu
const REQUIRED_SECRET_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/u
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u
const ALLOWED_SETTINGS = new Set([
  'appearance',
  'language',
  'defaultModel',
  'modelParameters',
  'apiRetry',
  'ui',
  'live-stats',
  'pet',
  'remote-web-ui',
  'skin-background',
  'task-board',
])
const ALLOWED_SKILL_EXTENSIONS = new Set(['.json', '.md', '.txt', '.yaml', '.yml'])
const FORBIDDEN_ARCHIVE_SUFFIXES = [
  '.bat', '.cmd', '.com', '.dll', '.exe', '.js', '.mjs', '.cjs', '.ps1', '.sh', '.vbs', '.wasm',
]

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(strFromU8(bytes))
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error })
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported field ${key}`)
  }
}

function assertSafeText(value, label) {
  if (typeof value !== 'string') return
  if (/\0/u.test(value)) throw new TypeError(`${label} contains a NUL byte`)
  if (
    /(?:^|[\s"'])(?:[a-z]:[\\/]|\\\\|\/(?:home|users?|var|etc|private|tmp)\/)/iu.test(value)
    || /(?:file:|git(?:\+ssh|\+https)?:|github:|https?:\/\/[^\s]+\.git(?:\s|$))/iu.test(value)
  ) {
    throw new TypeError(`${label} contains a local path or Git URL`)
  }
  if (SECRET_VALUE_PATTERN.test(value)) throw new TypeError(`${label} contains a secret value`)
}

function assertNoSecretsOrUnsafeValues(value, label, depth = 0) {
  if (depth > 24) throw new TypeError(`${label} is nested too deeply`)
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new TypeError(`${label} contains too many values`)
    value.forEach((item, index) => assertNoSecretsOrUnsafeValues(item, `${label}[${index}]`, depth + 1))
    return
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_NAME_PATTERN.test(key)) throw new TypeError(`${label} contains secret field ${key}`)
      assertNoSecretsOrUnsafeValues(item, `${label}.${key}`, depth + 1)
    }
    return
  }
  if (typeof value === 'string') assertSafeText(value, label)
  else if (value !== null && !['number', 'boolean'].includes(typeof value)) {
    throw new TypeError(`${label} contains an unsupported value`)
  }
}

function normalizeArchivePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240 || value.includes('\\') || value.includes('\0') || value.includes(':')) {
    throw new TypeError('preset archive contains an invalid path')
  }
  if (value.startsWith('/') || /^[a-z]:/iu.test(value)) throw new TypeError(`preset archive path is absolute: ${value}`)
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(`preset archive path traversal is not allowed: ${value}`)
  }
  return segments.join('/')
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new TypeError('preset archive is missing a ZIP central directory')
}

/** Inspect ZIP metadata before decompression so hostile archives cannot allocate unbounded memory. */
export function inspectPresetZip(raw, limits = PRESET_LIMITS) {
  const buffer = Buffer.from(raw)
  if (buffer.length === 0 || buffer.length > limits.archiveBytes) throw new TypeError('preset archive size is invalid')
  const endOffset = findEndOfCentralDirectory(buffer)
  const disk = buffer.readUInt16LE(endOffset + 4)
  const centralDisk = buffer.readUInt16LE(endOffset + 6)
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8)
  const entryCount = buffer.readUInt16LE(endOffset + 10)
  const centralSize = buffer.readUInt32LE(endOffset + 12)
  const centralOffset = buffer.readUInt32LE(endOffset + 16)
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount === 0 || entryCount > limits.entries) {
    throw new TypeError('preset archive uses unsupported multi-disk or entry metadata')
  }
  if (centralOffset + centralSize > endOffset) throw new TypeError('preset archive central directory is out of bounds')

  let offset = centralOffset
  let totalBytes = 0
  const entries = []
  const names = new Set()
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new TypeError('preset archive central directory is malformed')
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
    if ([compressedSize, size, localOffset].includes(0xffffffff)) throw new TypeError('ZIP64 preset archives are not supported')
    if ((flags & 0x1) !== 0 || ![0, 8].includes(compression)) throw new TypeError('encrypted or unsupported preset entries are not allowed')
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd + extraLength + commentLength > buffer.length) throw new TypeError('preset archive entry metadata is out of bounds')
    const name = normalizeArchivePath(buffer.subarray(nameStart, nameEnd).toString('utf8'))
    if (names.has(name)) throw new TypeError(`preset archive contains duplicate entry ${name}`)
    names.add(name)
    const unixMode = externalAttributes >>> 16
    if ((madeBy >>> 8) === 3 && (unixMode & 0xf000) !== 0 && (unixMode & 0xf000) !== 0x8000) {
      throw new TypeError(`preset archive contains a symbolic link or special file: ${name}`)
    }
    if (size > limits.entryBytes) throw new TypeError(`preset archive entry exceeds the size limit: ${name}`)
    totalBytes += size
    if (totalBytes > limits.totalBytes) throw new TypeError('preset archive expands beyond the total size limit')
    if (size > 64 * 1024 && (compressedSize === 0 || size / compressedSize > limits.compressionRatio)) {
      throw new TypeError(`preset archive entry has an unsafe compression ratio: ${name}`)
    }

    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new TypeError(`preset archive local header is invalid for ${name}`)
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (dataStart + compressedSize > centralOffset) throw new TypeError(`preset archive data is out of bounds for ${name}`)
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8')
    if (localName !== name) throw new TypeError(`preset archive header names disagree for ${name}`)
    entries.push(Object.freeze({ name, compressedSize, size }))
    offset = nameEnd + extraLength + commentLength
  }
  if (offset !== centralOffset + centralSize) throw new TypeError('preset archive central directory length is invalid')
  return Object.freeze(entries)
}

function validateManifest(value) {
  if (!isPlainObject(value)) throw new TypeError('dsh-preset.json must be an object')
  if (!Number.isInteger(value.formatVersion) || value.formatVersion < 1) throw new TypeError('preset formatVersion is invalid')
  if (value.formatVersion !== PRESET_FORMAT_VERSION) {
    const direction = value.formatVersion > PRESET_FORMAT_VERSION
      ? 'Upgrade DeepSeek Harness Desktop to import this preset.'
      : 'Use the Desktop migration assistant before importing this preset.'
    throw new TypeError(`preset format major ${value.formatVersion} is unsupported. ${direction}`)
  }
  if (typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 100) throw new TypeError('preset name is invalid')
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 500)) {
    throw new TypeError('preset description is invalid')
  }
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) throw new TypeError('preset createdAt is invalid')
  if (!isPlainObject(value.source)) throw new TypeError('preset source must be an object')
  if (semver.valid(value.source.desktopVersion) === null || semver.valid(value.source.runtimeVersion) === null) {
    throw new TypeError('preset source versions must be exact semantic versions')
  }
  if (!Array.isArray(value.requiredCapabilities) || !value.requiredCapabilities.every((item) => typeof item === 'string' && SAFE_ID_PATTERN.test(item))) {
    throw new TypeError('preset requiredCapabilities are invalid')
  }
  if (!Array.isArray(value.requiredSecrets) || !value.requiredSecrets.every((item) => typeof item === 'string' && REQUIRED_SECRET_PATTERN.test(item))) {
    throw new TypeError('preset requiredSecrets must contain names only')
  }
  if (new Set(value.requiredSecrets).size !== value.requiredSecrets.length) throw new TypeError('preset requiredSecrets contain duplicates')
  if (new Set(value.requiredCapabilities).size !== value.requiredCapabilities.length) throw new TypeError('preset requiredCapabilities contain duplicates')
  // v1 intentionally ignores unknown optional fields. This keeps a newer
  // writer's additive metadata from breaking a compatible v1 import while
  // ensuring those fields never enter the trusted import plan.
  const normalized = {
    formatVersion: value.formatVersion,
    name: value.name,
    ...(value.description === undefined ? {} : { description: value.description }),
    createdAt: value.createdAt,
    source: {
      desktopVersion: value.source.desktopVersion,
      runtimeVersion: value.source.runtimeVersion,
    },
    requiredCapabilities: [...value.requiredCapabilities],
    requiredSecrets: [...value.requiredSecrets],
  }
  const { requiredSecrets: _requiredSecrets, ...safeManifest } = normalized
  assertNoSecretsOrUnsafeValues(safeManifest, 'preset manifest')
  return Object.freeze(normalized)
}

function validatePackages(value) {
  assertExactKeys(value, new Set(['lockVersion', 'packages']), 'packages.lock.json')
  if (value.lockVersion !== 1 || !Array.isArray(value.packages)) throw new TypeError('packages lock schema is invalid')
  const names = new Set()
  for (const item of value.packages) {
    assertExactKeys(item, new Set(['name', 'version', 'integrity']), 'preset package')
    if (!PACKAGE_NAME_PATTERN.test(item.name) || semver.valid(item.version) === null || !SHA512_PATTERN.test(item.integrity)) {
      throw new TypeError('preset packages require registry names, exact versions, and sha512 integrity')
    }
    if (names.has(item.name)) throw new TypeError(`preset package is duplicated: ${item.name}`)
    names.add(item.name)
  }
  return value
}

function validateSettings(value) {
  if (!isPlainObject(value)) throw new TypeError('settings.json must be an object')
  for (const key of Object.keys(value)) {
    if (!ALLOWED_SETTINGS.has(key)) throw new TypeError(`settings.json field is not allowlisted: ${key}`)
  }
  assertNoSecretsOrUnsafeValues(value, 'preset settings')
  return value
}

/** Select only portable settings and report every field intentionally omitted from export. */
export function selectPortableSettings(value) {
  if (!isPlainObject(value)) throw new TypeError('desktop settings must be an object')
  const settings = {}
  const skipped = []
  for (const [key, item] of Object.entries(value)) {
    if (!ALLOWED_SETTINGS.has(key)) {
      skipped.push(Object.freeze({ kind: 'setting', key, reason: 'not-allowlisted' }))
      continue
    }
    try {
      assertNoSecretsOrUnsafeValues(item, `desktop settings.${key}`)
      settings[key] = structuredClone(item)
    } catch {
      skipped.push(Object.freeze({ kind: 'setting', key, reason: 'non-portable-or-sensitive' }))
    }
  }
  return Object.freeze({ settings: Object.freeze(settings), skipped: Object.freeze(skipped) })
}

function validateTaskTemplates(value) {
  if (!Array.isArray(value) || value.length > 200) throw new TypeError('task-templates.json must be a bounded array')
  assertNoSecretsOrUnsafeValues(value, 'preset task templates')
  return value
}

function validateSkillEntry(path, bytes) {
  const match = /^skills\/([a-z0-9][a-z0-9._-]{0,63})\/(.+)$/u.exec(path)
  if (match === null) throw new TypeError(`preset skill path is invalid: ${path}`)
  const relative = match[2]
  const relativeSegments = relative.split('/')
  if (relativeSegments.some((segment) => segment.startsWith('.') || SENSITIVE_PATH_PATTERN.test(segment))) {
    throw new TypeError(`preset skills cannot contain hidden credential files: ${path}`)
  }
  if (bytes.byteLength > PRESET_LIMITS.entryBytes) throw new TypeError(`preset skill file exceeds the size limit: ${path}`)
  const dot = relative.lastIndexOf('.')
  const extension = dot < 0 ? '' : relative.slice(dot).toLowerCase()
  if (!ALLOWED_SKILL_EXTENSIONS.has(extension) || FORBIDDEN_ARCHIVE_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))) {
    throw new TypeError(`preset skills cannot contain executable scripts: ${path}`)
  }
  const text = strFromU8(bytes)
  assertSafeText(text, path)
  if (extension === '.json') assertNoSecretsOrUnsafeValues(parseJson(bytes, path), path)
  if (extension === '.yaml' || extension === '.yml') {
    let value
    try {
      value = YAML.parse(text)
    } catch (error) {
      throw new Error(`${path} is not valid YAML`, { cause: error })
    }
    assertNoSecretsOrUnsafeValues(value, path)
  }
  return match[1]
}

function validateFileSet(files) {
  for (const required of REQUIRED_FILES) {
    if (!(required in files)) throw new TypeError(`preset archive is missing ${required}`)
  }
  for (const path of Object.keys(files)) {
    if (!REQUIRED_FILES.includes(path) && !path.startsWith('skills/')) {
      throw new TypeError(`preset archive contains unsupported file ${path}`)
    }
  }
}

/** Parse, validate, and integrity-check an untrusted .dshpreset before planning any mutation. */
export function readPresetBuffer(raw) {
  const metadata = inspectPresetZip(raw)
  let unzipped
  try {
    unzipped = unzipSync(new Uint8Array(raw))
  } catch (error) {
    throw new TypeError('preset archive decompression failed', { cause: error })
  }
  const files = Object.fromEntries(Object.entries(unzipped).map(([path, bytes]) => [normalizeArchivePath(path), bytes]))
  validateFileSet(files)
  if (Object.keys(files).length !== metadata.length) throw new TypeError('preset archive entry count changed during decompression')

  const integrity = parseJson(files['integrity.json'], 'integrity.json')
  assertExactKeys(integrity, new Set(['algorithm', 'files']), 'integrity.json')
  if (integrity.algorithm !== 'sha256' || !isPlainObject(integrity.files)) throw new TypeError('preset integrity schema is invalid')
  const payloadPaths = Object.keys(files).filter((path) => path !== 'integrity.json').toSorted()
  if (JSON.stringify(Object.keys(integrity.files).toSorted()) !== JSON.stringify(payloadPaths)) {
    throw new TypeError('preset integrity file list does not match archive contents')
  }
  for (const path of payloadPaths) {
    const expected = integrity.files[path]
    if (typeof expected !== 'string' || !SHA256_PATTERN.test(expected) || sha256(files[path]) !== expected) {
      throw new TypeError(`preset integrity verification failed for ${path}`)
    }
  }

  const manifest = validateManifest(parseJson(files['dsh-preset.json'], 'dsh-preset.json'))
  const packages = validatePackages(parseJson(files['packages.lock.json'], 'packages.lock.json'))
  const settings = validateSettings(parseJson(files['settings.json'], 'settings.json'))
  const taskTemplates = validateTaskTemplates(parseJson(files['task-templates.json'], 'task-templates.json'))
  const skills = new Map()
  for (const path of payloadPaths.filter((path) => path.startsWith('skills/'))) {
    const name = validateSkillEntry(path, files[path])
    const entries = skills.get(name) ?? new Map()
    entries.set(path.slice(`skills/${name}/`.length), Buffer.from(files[path]))
    skills.set(name, entries)
  }
  for (const [name, entries] of skills) {
    if (!entries.has('SKILL.md')) throw new TypeError(`preset skill ${name} is missing SKILL.md`)
  }
  const readme = strFromU8(files['README.md'])
  assertSafeText(readme, 'README.md')

  return Object.freeze({
    manifest: Object.freeze(manifest),
    packages: Object.freeze(packages.packages.map((item) => Object.freeze({ ...item }))),
    settings: Object.freeze(settings),
    taskTemplates: Object.freeze(taskTemplates),
    skills,
    readme,
    trust: Object.freeze({
      level: 'untrusted',
      integrityVerified: true,
      executableContent: false,
      secretValues: false,
    }),
  })
}

export async function readPresetFile(path) {
  return readPresetBuffer(await readFile(path))
}

function normalizeSkillFiles(skills = {}) {
  const entries = skills instanceof Map ? [...skills.entries()] : Object.entries(skills)
  const files = {}
  let count = 0
  let totalBytes = 0
  for (const [name, rawEntries] of entries) {
    if (!SAFE_ID_PATTERN.test(name)) throw new TypeError(`preset skill name is invalid: ${name}`)
    const skillEntries = rawEntries instanceof Map ? [...rawEntries.entries()] : Object.entries(rawEntries)
    for (const [relative, value] of skillEntries) {
      const path = normalizeArchivePath(`skills/${name}/${relative}`)
      const bytes = typeof value === 'string' ? strToU8(value) : new Uint8Array(value)
      validateSkillEntry(path, bytes)
      count += 1
      totalBytes += bytes.byteLength
      if (count > PRESET_LIMITS.entries || totalBytes > PRESET_LIMITS.totalBytes) {
        throw new TypeError('preset skills exceed the file count or total size limit')
      }
      files[path] = bytes
    }
  }
  return files
}

/** Build a deterministic, registry-only .dshpreset v1 archive. */
export function createPresetBuffer({ manifest, packages = [], settings = {}, skills = {}, taskTemplates = [], readme = '' }) {
  const normalizedManifest = validateManifest({
    ...manifest,
    formatVersion: PRESET_FORMAT_VERSION,
    requiredCapabilities: [...(manifest.requiredCapabilities ?? [])],
    requiredSecrets: [...(manifest.requiredSecrets ?? [])],
  })
  const normalizedPackages = validatePackages({ lockVersion: 1, packages: packages.map((item) => ({ ...item })) })
  validateSettings(settings)
  validateTaskTemplates(taskTemplates)
  assertSafeText(readme, 'README.md')
  const files = {
    'dsh-preset.json': strToU8(stableJson(normalizedManifest)),
    'packages.lock.json': strToU8(stableJson(normalizedPackages)),
    'settings.json': strToU8(stableJson(settings)),
    'task-templates.json': strToU8(stableJson(taskTemplates)),
    'README.md': strToU8(String(readme)),
    ...normalizeSkillFiles(skills),
  }
  const hashes = Object.fromEntries(Object.keys(files).toSorted().map((path) => [path, sha256(files[path])]))
  files['integrity.json'] = strToU8(stableJson({ algorithm: 'sha256', files: hashes }))
  return Buffer.from(zipSync(files, { level: 9, mtime: new Date('2020-01-01T00:00:00.000Z') }))
}

export async function writePresetFile(path, preset) {
  const buffer = createPresetBuffer(preset)
  await writeFile(path, buffer, { flag: 'wx' })
  return Object.freeze({ path, bytes: buffer.length, sha256: sha256(buffer) })
}
