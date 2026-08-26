import { lstat, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import { parseDocument } from 'yaml'

const MAX_CREDENTIAL_FILE_BYTES = 1024 * 1024
const CREDENTIAL_REF_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/u
const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]|\.(?=[A-Za-z0-9_-])){0,58}$/u
const FORBIDDEN_REFS = new Set([
  'DSH_HOME',
  'DSH_PROFILE',
  'DSH_SKIN_PROFILE',
  'DSH_PERMISSION_MODE',
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'PATH',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function absoluteDirectory(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path`)
  }
  return resolve(value)
}

export function isLegacyCredentialRef(value) {
  return typeof value === 'string'
    && CREDENTIAL_REF_PATTERN.test(value)
    && !FORBIDDEN_REFS.has(value)
    && !value.startsWith('DSH_DESKTOP_')
    && !value.startsWith('QQBOT_')
}

export function validateLegacyCredentialEnvironment(value) {
  if (!isRecord(value)) throw new TypeError('legacy credential environment must be an object')
  const normalized = {}
  for (const [name, secret] of Object.entries(value)) {
    if (!isLegacyCredentialRef(name) || typeof secret !== 'string' || secret.length === 0) {
      throw new TypeError('legacy credential environment contains an invalid entry')
    }
    normalized[name] = secret
  }
  return Object.freeze(normalized)
}

function parseCredentialText(text) {
  const document = parseDocument(text, {
    prettyErrors: false,
    uniqueKeys: true,
    maxAliasCount: 0,
  })
  if (document.errors.length > 0) throw new TypeError('credential document is invalid')
  const root = document.toJS({ maxAliasCount: 0 }) ?? {}
  if (!isRecord(root)) throw new TypeError('credential document root is invalid')

  let source
  if (Object.hasOwn(root, 'version')) {
    if (root.version !== 1 || (root.refs !== undefined && root.refs !== null && !isRecord(root.refs))) {
      throw new TypeError('credential document version is invalid')
    }
    source = root.refs ?? {}
  } else {
    source = root
  }

  const refs = {}
  let rejectedRefs = 0
  for (const [name, secret] of Object.entries(source)) {
    if (!isLegacyCredentialRef(name) || typeof secret !== 'string' || secret.length === 0) {
      rejectedRefs += 1
      continue
    }
    refs[name] = secret
  }
  return Object.freeze({ refs: Object.freeze(refs), rejectedRefs })
}

async function readBoundedRegularFile(path) {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_CREDENTIAL_FILE_BYTES) {
    throw new TypeError('credential candidate is not a bounded regular file')
  }
  return Object.freeze({
    text: await readFile(path, 'utf8'),
    modifiedAt: metadata.mtimeMs,
  })
}

async function currentRefNames(dshHomeDir) {
  try {
    const { text } = await readBoundedRegularFile(join(dshHomeDir, '.credentials.yaml'))
    return new Set(Object.keys(parseCredentialText(text).refs))
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set()
    // The current credentials provider owns current-file validation. This
    // compatibility reader never turns that failure into a migration gate.
    return new Set()
  }
}

async function discoverCandidates(userDataDir) {
  const activeRoot = join(userDataDir, 'free-mode-sessions', 'active')
  let entries
  try {
    entries = await readdir(activeRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !SESSION_ID_PATTERN.test(entry.name)) continue
    const sessionDir = join(activeRoot, entry.name)
    const dshDir = join(sessionDir, 'dsh')
    const credentialPath = join(dshDir, '.credentials.yaml')
    try {
      const dshMetadata = await lstat(dshDir)
      if (!dshMetadata.isDirectory() || dshMetadata.isSymbolicLink()) continue
      const candidate = await readBoundedRegularFile(credentialPath)
      candidates.push(Object.freeze({ ...candidate, validPathShape: true }))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        candidates.push(Object.freeze({ invalid: true, modifiedAt: 0 }))
      }
    }
  }
  return candidates
}

/**
 * Recover only missing reference credentials from app-owned legacy Free Mode
 * homes. Values are returned solely for the child environment; the public
 * summary contains bounded counters and no paths or secrets.
 */
export async function readLegacyCredentialCompatibility({
  userDataDir,
  dshHomeDir,
  currentEnvironment = process.env,
} = {}) {
  const normalizedUserDataDir = absoluteDirectory(userDataDir, 'legacy credential user data directory')
  const normalizedDshHomeDir = absoluteDirectory(dshHomeDir, 'legacy credential current DSH home')
  if (!isRecord(currentEnvironment)) {
    throw new TypeError('legacy credential current environment must be an object')
  }

  const [candidates, currentRefs] = await Promise.all([
    discoverCandidates(normalizedUserDataDir),
    currentRefNames(normalizedDshHomeDir),
  ])
  const parsedCandidates = []
  let invalidCandidates = 0
  for (const candidate of candidates) {
    if (candidate.invalid) {
      invalidCandidates += 1
      continue
    }
    try {
      parsedCandidates.push(Object.freeze({
        ...parseCredentialText(candidate.text),
        modifiedAt: candidate.modifiedAt,
      }))
    } catch {
      invalidCandidates += 1
    }
  }
  parsedCandidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
  const selected = parsedCandidates[0]
  const environment = {}
  let skippedCurrentRefs = 0
  if (selected !== undefined) {
    for (const [name, secret] of Object.entries(selected.refs)) {
      const currentValue = currentEnvironment[name]
      if ((typeof currentValue === 'string' && currentValue.length > 0) || currentRefs.has(name)) {
        skippedCurrentRefs += 1
        continue
      }
      environment[name] = secret
    }
  }

  const safeEnvironment = validateLegacyCredentialEnvironment(environment)
  return Object.freeze({
    environment: safeEnvironment,
    summary: Object.freeze({
      candidates: candidates.length,
      validCandidates: parsedCandidates.length,
      recoveredRefs: Object.keys(safeEnvironment).length,
      skippedCurrentRefs,
      rejectedRefs: selected?.rejectedRefs ?? 0,
      invalidCandidates,
    }),
  })
}
