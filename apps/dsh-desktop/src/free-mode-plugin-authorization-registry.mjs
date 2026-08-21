import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'

import { assertExternalPluginDescriptor } from './external-plugin-source.mjs'
import { packagePathSegments } from './profile.mjs'

export const FREE_MODE_PLUGIN_AUTHORIZATION_REGISTRY_SCHEMA_VERSION = 1

const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertPath(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('free-mode plugin authorization registry path must be absolute')
  }
  return value
}

function assertPackageName(value) {
  try {
    packagePathSegments(value)
  } catch {
    throw new TypeError('free-mode plugin authorization package name is invalid')
  }
  return value
}

function normalizeTimestamp(value, label = 'free-mode plugin authorization time') {
  if (typeof value !== 'string' || value.length === 0 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} is invalid`)
  }
  return new Date(value).toISOString()
}

function assertFingerprint(value, label) {
  if (typeof value !== 'string' || !FINGERPRINT_PATTERN.test(value)) {
    throw new TypeError(`free-mode plugin authorization ${label} is invalid`)
  }
  return value
}

function privateRecordFromDescriptor(descriptor, authorizedAt, packageNameOverride) {
  const value = assertExternalPluginDescriptor(descriptor)
  const packageName = assertPackageName(packageNameOverride ?? value.package.name)
  if (packageNameOverride === undefined && value.loader?.packageName !== packageName) {
    throw new TypeError('free-mode plugin authorization descriptor package identity is invalid')
  }
  return Object.freeze({
    packageName,
    sourceId: assertFingerprint(value.sourceId, 'source ID'),
    candidateId: assertFingerprint(value.candidateId, 'candidate ID'),
    contentFingerprint: assertFingerprint(value.contentFingerprint, 'content fingerprint'),
    authorizedAt: normalizeTimestamp(authorizedAt),
  })
}

function privateRecordFromSnapshot(value) {
  if (!isRecord(value)) throw new TypeError('free-mode plugin authorization record is invalid')
  return Object.freeze({
    packageName: assertPackageName(value.packageName),
    sourceId: assertFingerprint(value.sourceId, 'source ID'),
    candidateId: assertFingerprint(value.candidateId, 'candidate ID'),
    contentFingerprint: assertFingerprint(value.contentFingerprint, 'content fingerprint'),
    authorizedAt: normalizeTimestamp(value.authorizedAt),
  })
}

function publicRecord(record) {
  // The registry deliberately retains only opaque source identities. Paths and
  // install specifications must never be carried across a Desktop restart.
  return Object.freeze({
    packageName: record.packageName,
    sourceId: record.sourceId,
    candidateId: record.candidateId,
    contentFingerprint: record.contentFingerprint,
    authorizedAt: record.authorizedAt,
  })
}

function snapshotFromRecords(records) {
  return Object.freeze({
    schemaVersion: FREE_MODE_PLUGIN_AUTHORIZATION_REGISTRY_SCHEMA_VERSION,
    plugins: Object.freeze([...records.values()]
      .toSorted((left, right) => left.packageName.localeCompare(right.packageName))
      .map(publicRecord)),
  })
}

function recordsFromSnapshot(value) {
  if (
    !isRecord(value)
    || value.schemaVersion !== FREE_MODE_PLUGIN_AUTHORIZATION_REGISTRY_SCHEMA_VERSION
    || !Array.isArray(value.plugins)
  ) {
    throw new TypeError('free-mode plugin authorization registry is invalid')
  }
  const records = new Map()
  for (const rawRecord of value.plugins) {
    const record = privateRecordFromSnapshot(rawRecord)
    if (records.has(record.packageName)) {
      throw new TypeError('free-mode plugin authorization registry has duplicate package names')
    }
    records.set(record.packageName, record)
  }
  return records
}

async function writeAtomically(path, content, { fs }) {
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
      throw new Error('free-mode plugin authorization registry did not verify after write')
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

/**
 * Durable, main-process-only record of external plugins for which a user has
 * already approved full access. It is not an authorization decision engine:
 * Electron main must call `recordAuthorized()` only after native consent and
 * must explicitly pass `await approvedPackageNames()` into
 * `PluginManager.reconcileCompatibility()` on every startup.
 */
export class FreeModePluginAuthorizationRegistry {
  constructor({
    path,
    fs = { mkdir, readFile, rename, rm, writeFile },
    now = () => new Date().toISOString(),
  } = {}) {
    if (
      !fs
      || typeof fs.mkdir !== 'function'
      || typeof fs.readFile !== 'function'
      || typeof fs.rename !== 'function'
      || typeof fs.rm !== 'function'
      || typeof fs.writeFile !== 'function'
    ) {
      throw new TypeError('free-mode plugin authorization registry requires file operations')
    }
    if (typeof now !== 'function') throw new TypeError('free-mode plugin authorization registry clock must be a function')
    this.path = assertPath(path)
    this.fs = fs
    this.now = now
    this.records = new Map()
    this.loaded = false
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  async #loadNow() {
    if (this.loaded) return
    let text
    try {
      text = await this.fs.readFile(this.path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.loaded = true
        return
      }
      throw error
    }
    let snapshot
    try {
      snapshot = JSON.parse(text)
    } catch (error) {
      throw new Error('free-mode plugin authorization registry is not valid JSON', { cause: error })
    }
    this.records = recordsFromSnapshot(snapshot)
    this.loaded = true
  }

  #publicRecords() {
    return Object.freeze([...this.records.values()]
      .toSorted((left, right) => left.packageName.localeCompare(right.packageName))
      .map(publicRecord))
  }

  async #persistNow() {
    const content = `${JSON.stringify(snapshotFromRecords(this.records), null, 2)}\n`
    await writeAtomically(this.path, content, { fs: this.fs })
  }

  load() {
    return this.#enqueue(async () => {
      await this.#loadNow()
      return this.#publicRecords()
    })
  }

  list() {
    return this.#enqueue(async () => {
      await this.#loadNow()
      return this.#publicRecords()
    })
  }

  /**
   * Return a fresh package-name Set for the caller to provide to startup
   * reconciliation. The registry deliberately never changes PluginManager
   * policy by itself.
   */
  approvedPackageNames() {
    return this.#enqueue(async () => {
      await this.#loadNow()
      return new Set(this.records.keys())
    })
  }

  /**
   * Main-process-only mutation. Call this after both native full-access
   * confirmation and a successful external-plugin installation have occurred.
   */
  recordAuthorized(descriptor, { authorizedAt = this.now(), packageName } = {}) {
    let record
    try {
      record = privateRecordFromDescriptor(descriptor, authorizedAt, packageName)
    } catch (error) {
      return Promise.reject(error)
    }
    return this.#enqueue(async () => {
      await this.#loadNow()
      this.records.set(record.packageName, record)
      await this.#persistNow()
      return publicRecord(record)
    })
  }

  forget(packageName) {
    let name
    try {
      name = assertPackageName(packageName)
    } catch (error) {
      return Promise.reject(error)
    }
    return this.#enqueue(async () => {
      await this.#loadNow()
      if (!this.records.delete(name)) return false
      await this.#persistNow()
      return true
    })
  }
}
