import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'

import {
  FREE_MODE_PERMISSION_SCHEMA_VERSION,
  authorizeFreeModeFullPermission,
  issueFreeModeFullPermissionGrant,
  restoreFreeModeFullPermissionGrant,
  revokeFreeModeFullPermissionGrant,
  serializeFreeModeFullPermissionGrant,
} from './free-mode-permission-contract.mjs'

export const FREE_MODE_PERMISSION_STORE_SCHEMA_VERSION = 1

const PERSISTED_TRUST_SCOPES = new Set(['content', 'source'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertPath(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('free-mode permission store path must be absolute')
  }
  return value
}

function normalizeSnapshot(value) {
  if (!isRecord(value) || value.schemaVersion !== FREE_MODE_PERMISSION_STORE_SCHEMA_VERSION || !Array.isArray(value.grants)) {
    throw new TypeError('free-mode permission store is invalid')
  }
  const grants = value.grants.map((serialized) => {
    const grant = restoreFreeModeFullPermissionGrant(serialized)
    if (!PERSISTED_TRUST_SCOPES.has(grant.trustScope)) {
      throw new TypeError('free-mode permission store cannot persist once grants')
    }
    return grant
  })
  const ids = new Set()
  for (const grant of grants) {
    if (ids.has(grant.grantId)) throw new TypeError('free-mode permission store has duplicate grants')
    ids.add(grant.grantId)
  }
  return grants
}

function publicGrant(grant) {
  return Object.freeze({
    grantId: grant.grantId,
    trustScope: grant.trustScope,
    source: Object.freeze({
      id: grant.source.id,
      contentSha256: grant.source.contentSha256,
    }),
    approvedAt: grant.approval.approvedAt,
    active: grant.state === 'active',
  })
}

async function writeAtomically(path, content, { fs = { mkdir, readFile, rename, rm, writeFile } } = {}) {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  let movedExisting = false
  try {
    try {
      await fs.rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await fs.rename(temporary, path)
    const verified = await fs.readFile(path, 'utf8')
    if (verified !== content) throw new Error('free-mode permission store did not verify after write')
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
 * Main-process persistence for explicitly approved full-user permissions.
 * Renderer data can request an approval flow, but only the caller that owns a
 * native confirmation can supply the approval object to this store.
 */
export class FreeModePermissionStore {
  constructor({
    path,
    fs = { mkdir, readFile, rename, rm, writeFile },
    idFactory = randomUUID,
  } = {}) {
    if (!fs || typeof fs.readFile !== 'function' || typeof fs.writeFile !== 'function') {
      throw new TypeError('free-mode permission store requires file operations')
    }
    if (typeof idFactory !== 'function') throw new TypeError('free-mode permission store idFactory must be a function')
    this.path = assertPath(path)
    this.fs = fs
    this.idFactory = idFactory
    this.grants = new Map()
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
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw new Error('free-mode permission store is not valid JSON', { cause: error })
    }
    const grants = normalizeSnapshot(parsed)
    this.grants = new Map(grants.map((grant) => [grant.grantId, grant]))
    this.loaded = true
  }

  #snapshotNow() {
    const grants = [...this.grants.values()]
      .filter((grant) => PERSISTED_TRUST_SCOPES.has(grant.trustScope))
      .toSorted((left, right) => left.grantId.localeCompare(right.grantId))
      .map((grant) => serializeFreeModeFullPermissionGrant(grant))
    return Object.freeze({
      schemaVersion: FREE_MODE_PERMISSION_STORE_SCHEMA_VERSION,
      grants: Object.freeze(grants),
    })
  }

  async #persistNow() {
    const content = `${JSON.stringify(this.#snapshotNow(), null, 2)}\n`
    await writeAtomically(this.path, content, { fs: this.fs })
  }

  load() {
    return this.#enqueue(async () => {
      await this.#loadNow()
      return this.list()
    })
  }

  list() {
    return Object.freeze([...this.grants.values()]
      .toSorted((left, right) => left.grantId.localeCompare(right.grantId))
      .map(publicGrant))
  }

  approve({ grantId, trustScope, source, sessionId, approval } = {}) {
    return this.#enqueue(async () => {
      await this.#loadNow()
      const generatedGrantId = grantId ?? this.idFactory()
      const grant = issueFreeModeFullPermissionGrant({
        grantId: generatedGrantId,
        trustScope,
        source,
        ...(sessionId === undefined ? {} : { sessionId }),
        approval,
      })
      if (this.grants.has(grant.grantId)) throw new TypeError('free-mode permission grant ID already exists')
      this.grants.set(grant.grantId, grant)
      if (PERSISTED_TRUST_SCOPES.has(grant.trustScope)) await this.#persistNow()
      return publicGrant(grant)
    })
  }

  authorize({ source, sessionId } = {}) {
    return this.#enqueue(async () => {
      await this.#loadNow()
      const grants = [...this.grants.values()]
        .filter((grant) => grant.state === 'active')
        .toSorted((left, right) => left.trustScope.localeCompare(right.trustScope) || left.grantId.localeCompare(right.grantId))
      for (const grant of grants) {
        const decision = authorizeFreeModeFullPermission({ grant, source, sessionId })
        if (decision.allowed) return decision
      }
      return Object.freeze({ allowed: false, reason: 'approval-required', permission: 'none' })
    })
  }

  revoke(grantId, { revokedAt } = {}) {
    return this.#enqueue(async () => {
      await this.#loadNow()
      const grant = this.grants.get(grantId)
      if (grant === undefined || grant.state === 'revoked') return false
      const revoked = revokeFreeModeFullPermissionGrant(grant, { revokedAt })
      this.grants.set(grantId, revoked)
      if (PERSISTED_TRUST_SCOPES.has(revoked.trustScope)) await this.#persistNow()
      return true
    })
  }

  clearSession(sessionId) {
    return this.#enqueue(async () => {
      await this.#loadNow()
      let removed = 0
      for (const [grantId, grant] of this.grants) {
        if (grant.trustScope !== 'once' || grant.sessionId !== sessionId) continue
        this.grants.delete(grantId)
        removed += 1
      }
      return removed
    })
  }
}

/** Convert a private external-source descriptor to the contract's opaque source. */
export function freeModePermissionSourceFromDescriptor(descriptor) {
  if (descriptor === null || typeof descriptor !== 'object') {
    throw new TypeError('external plugin descriptor is required')
  }
  if (typeof descriptor.sourceId !== 'string' || typeof descriptor.contentFingerprint !== 'string') {
    throw new TypeError('external plugin descriptor is invalid')
  }
  const contentSha256 = descriptor.contentFingerprint.startsWith('sha256:')
    ? descriptor.contentFingerprint.slice('sha256:'.length)
    : descriptor.contentFingerprint
  return Object.freeze({ id: descriptor.sourceId, contentSha256 })
}
