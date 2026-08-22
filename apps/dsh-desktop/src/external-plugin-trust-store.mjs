import { randomUUID } from 'node:crypto'

import {
  EXTERNAL_PLUGIN_SOURCE_SCHEMA_VERSION,
  assertExternalPluginDescriptor,
} from './external-plugin-source.mjs'

export const EXTERNAL_PLUGIN_TRUST_STORE_SCHEMA_VERSION = 1
export const EXTERNAL_PLUGIN_TRUST_SCOPES = Object.freeze(['session', 'content', 'source'])
export const EXTERNAL_PLUGIN_TRUST_RESULT_STATUSES = Object.freeze(['loaded', 'failed', 'disabled'])

const TRUST_SCOPES = new Set(EXTERNAL_PLUGIN_TRUST_SCOPES)
const TRUST_RESULT_STATUSES = new Set(EXTERNAL_PLUGIN_TRUST_RESULT_STATUSES)
const TRUST_ID_PATTERN = /^external-plugin-trust-v1:[a-z0-9-]{8,128}$/iu

function assertPlainObject(value, label) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

function assertOpaqueId(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || value !== value.trim() || /[\0\r\n]/u.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function timestamp(value, label = 'timestamp') {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString()
  throw new TypeError(`${label} is invalid`)
}

function frozenRecord(record) {
  return Object.freeze({
    trustId: record.trustId,
    sourceId: record.sourceId,
    candidateId: record.candidateId,
    sourceType: record.sourceType,
    displayName: record.displayName,
    contentFingerprint: record.contentFingerprint,
    scope: record.scope,
    ...(record.sessionId === undefined ? {} : { sessionId: record.sessionId }),
    approvedAt: record.approvedAt,
    ...(record.revokedAt === undefined ? {} : { revokedAt: record.revokedAt }),
    ...(record.lastResult === undefined ? {} : { lastResult: Object.freeze({ ...record.lastResult }) }),
  })
}

function publicRecord(record) {
  return Object.freeze({
    trustId: record.trustId,
    sourceId: record.sourceId,
    candidateId: record.candidateId,
    sourceType: record.sourceType,
    displayName: record.displayName,
    contentFingerprint: record.contentFingerprint,
    scope: record.scope,
    approvedAt: record.approvedAt,
    active: record.revokedAt === undefined,
    ...(record.lastResult === undefined ? {} : { lastResult: Object.freeze({ ...record.lastResult }) }),
  })
}

function validateSnapshotRecord(value) {
  const record = assertPlainObject(value, 'external plugin trust record')
  if (!TRUST_ID_PATTERN.test(record.trustId)) throw new TypeError('external plugin trust ID is invalid')
  if (typeof record.sourceId !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(record.sourceId)) {
    throw new TypeError('external plugin trust source ID is invalid')
  }
  if (typeof record.candidateId !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(record.candidateId)) {
    throw new TypeError('external plugin trust candidate ID is invalid')
  }
  if (!['directory', 'tarball'].includes(record.sourceType)) throw new TypeError('external plugin trust source type is invalid')
  assertOpaqueId(record.displayName, 'external plugin trust display name')
  if (typeof record.contentFingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(record.contentFingerprint)) {
    throw new TypeError('external plugin trust content fingerprint is invalid')
  }
  if (!TRUST_SCOPES.has(record.scope) || record.scope === 'session') {
    throw new TypeError('persisted external plugin trust scope is invalid')
  }
  const approvedAt = timestamp(record.approvedAt, 'external plugin trust approval time')
  const revokedAt = record.revokedAt === undefined ? undefined : timestamp(record.revokedAt, 'external plugin trust revocation time')
  let lastResult
  if (record.lastResult !== undefined) {
    const result = assertPlainObject(record.lastResult, 'external plugin trust result')
    if (!TRUST_RESULT_STATUSES.has(result.status)) throw new TypeError('external plugin trust result status is invalid')
    lastResult = Object.freeze({ status: result.status, at: timestamp(result.at, 'external plugin trust result time') })
  }
  return {
    trustId: record.trustId,
    sourceId: record.sourceId,
    candidateId: record.candidateId,
    sourceType: record.sourceType,
    displayName: record.displayName,
    contentFingerprint: record.contentFingerprint,
    scope: record.scope,
    approvedAt,
    ...(revokedAt === undefined ? {} : { revokedAt }),
    ...(lastResult === undefined ? {} : { lastResult }),
  }
}

function snapshotRecords(snapshot) {
  if (snapshot === undefined) return []
  const value = assertPlainObject(snapshot, 'external plugin trust snapshot')
  if (value.schemaVersion !== EXTERNAL_PLUGIN_TRUST_STORE_SCHEMA_VERSION) {
    throw new TypeError('external plugin trust snapshot schema version is unsupported')
  }
  if (!Array.isArray(value.trusts)) throw new TypeError('external plugin trust snapshot trusts must be an array')
  return value.trusts.map(validateSnapshotRecord)
}

/**
 * Main-process-only authorization state for external plugin sources. The store
 * does not keep filesystem paths: sources are re-resolved by the caller and
 * matched through a canonical source hash and optional content fingerprint.
 */
export class ExternalPluginTrustStore {
  constructor({ snapshot, now = Date.now, idFactory = randomUUID } = {}) {
    if (typeof now !== 'function') throw new TypeError('external plugin trust now function is required')
    if (typeof idFactory !== 'function') throw new TypeError('external plugin trust ID factory is required')
    this.now = now
    this.idFactory = idFactory
    this.records = new Map()
    for (const record of snapshotRecords(snapshot)) {
      if (this.records.has(record.trustId)) throw new TypeError('external plugin trust snapshot contains duplicate IDs')
      this.records.set(record.trustId, record)
    }
  }

  #now() {
    return timestamp(this.now(), 'external plugin trust clock')
  }

  #findDuplicate({ sourceId, contentFingerprint, scope, sessionId }) {
    for (const record of this.records.values()) {
      if (record.revokedAt !== undefined || record.sourceId !== sourceId || record.scope !== scope) continue
      if (scope === 'source') return record
      if (record.contentFingerprint !== contentFingerprint) continue
      if (scope !== 'session' || record.sessionId === sessionId) return record
    }
    return undefined
  }

  approve(descriptor, { scope, sessionId } = {}) {
    const value = assertExternalPluginDescriptor(descriptor)
    if (!TRUST_SCOPES.has(scope)) throw new TypeError('external plugin trust scope is invalid')
    const normalizedSessionId = scope === 'session'
      ? assertOpaqueId(sessionId, 'external plugin trust session ID')
      : undefined
    const duplicate = this.#findDuplicate({
      sourceId: value.sourceId,
      contentFingerprint: value.contentFingerprint,
      scope,
      sessionId: normalizedSessionId,
    })
    if (duplicate !== undefined) return frozenRecord(duplicate)

    const generatedId = assertOpaqueId(this.idFactory(), 'external plugin trust generated ID')
    const trustId = `external-plugin-trust-v1:${generatedId}`
    if (!TRUST_ID_PATTERN.test(trustId) || this.records.has(trustId)) {
      throw new TypeError('external plugin trust generated ID is invalid or duplicated')
    }
    const record = {
      trustId,
      sourceId: value.sourceId,
      candidateId: value.candidateId,
      sourceType: value.sourceType,
      displayName: value.package.name,
      contentFingerprint: value.contentFingerprint,
      scope,
      ...(normalizedSessionId === undefined ? {} : { sessionId: normalizedSessionId }),
      approvedAt: this.#now(),
    }
    this.records.set(trustId, record)
    return frozenRecord(record)
  }

  authorize(descriptor, { sessionId } = {}) {
    const value = assertExternalPluginDescriptor(descriptor)
    const normalizedSessionId = sessionId === undefined ? undefined : assertOpaqueId(sessionId, 'external plugin trust session ID')
    let sourceTrust
    let contentTrust
    let sessionTrust
    for (const record of this.records.values()) {
      if (record.revokedAt !== undefined || record.sourceId !== value.sourceId) continue
      if (record.scope === 'source') sourceTrust ??= record
      if (record.scope === 'content' && record.contentFingerprint === value.contentFingerprint) contentTrust ??= record
      if (
        record.scope === 'session'
        && record.sessionId === normalizedSessionId
        && record.contentFingerprint === value.contentFingerprint
      ) sessionTrust ??= record
    }
    const record = sessionTrust ?? contentTrust ?? sourceTrust
    if (record === undefined) {
      return Object.freeze({ allowed: false, reason: 'approval-required' })
    }
    return Object.freeze({
      allowed: true,
      reason: `approved-${record.scope}`,
      trust: frozenRecord(record),
    })
  }

  revoke(trustId) {
    const id = assertOpaqueId(trustId, 'external plugin trust ID')
    const record = this.records.get(id)
    if (record === undefined || record.revokedAt !== undefined) return false
    record.revokedAt = this.#now()
    return true
  }

  recordResult(trustId, { status } = {}) {
    const id = assertOpaqueId(trustId, 'external plugin trust ID')
    if (!TRUST_RESULT_STATUSES.has(status)) throw new TypeError('external plugin trust result status is invalid')
    const record = this.records.get(id)
    if (record === undefined) return false
    record.lastResult = Object.freeze({ status, at: this.#now() })
    return true
  }

  clearSession(sessionId) {
    const id = assertOpaqueId(sessionId, 'external plugin trust session ID')
    let removed = 0
    for (const [trustId, record] of this.records) {
      if (record.scope !== 'session' || record.sessionId !== id) continue
      this.records.delete(trustId)
      removed += 1
    }
    return removed
  }

  list({ includeRevoked = false } = {}) {
    if (typeof includeRevoked !== 'boolean') throw new TypeError('includeRevoked must be a boolean')
    return Object.freeze([...this.records.values()]
      .filter((record) => includeRevoked || record.revokedAt === undefined)
      .sort((left, right) => left.approvedAt.localeCompare(right.approvedAt) || left.trustId.localeCompare(right.trustId))
      .map(publicRecord))
  }

  snapshot() {
    const trusts = [...this.records.values()]
      // Session grants are deliberately memory-only and cannot survive a
      // Desktop restart.
      .filter((record) => record.scope !== 'session')
      .sort((left, right) => left.approvedAt.localeCompare(right.approvedAt) || left.trustId.localeCompare(right.trustId))
      .map((record) => Object.freeze({
        trustId: record.trustId,
        sourceId: record.sourceId,
        candidateId: record.candidateId,
        sourceType: record.sourceType,
        displayName: record.displayName,
        contentFingerprint: record.contentFingerprint,
        scope: record.scope,
        approvedAt: record.approvedAt,
        ...(record.revokedAt === undefined ? {} : { revokedAt: record.revokedAt }),
        ...(record.lastResult === undefined ? {} : { lastResult: Object.freeze({ ...record.lastResult }) }),
      }))
    return Object.freeze({
      schemaVersion: EXTERNAL_PLUGIN_TRUST_STORE_SCHEMA_VERSION,
      trusts: Object.freeze(trusts),
    })
  }
}

export function createExternalPluginTrustStore(options) {
  return new ExternalPluginTrustStore(options)
}

export { EXTERNAL_PLUGIN_SOURCE_SCHEMA_VERSION }
