/**
 * Import Ledger Store (V2).
 * Atomically persists imported session records with idempotency keys,
 * resumption tracking, transcript hashes, and backward compatibility.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { IMPORT_SCHEMA_VERSION_V2, LEDGER_STATUS } from './schema.mjs'

export class ImportLedgerStore {
  constructor(options = {}) {
    const dshHome = options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh')
    this.ledgerPath = options.ledgerPath || join(dshHome, 'state', 'external-conversation-imports-v2.json')
    this.v1LedgerPath = join(dshHome, 'state', 'external-conversation-imports-v1.json')
    this._cache = null
  }

  static makeKey(sourceKind, sourceSessionId, sourceFingerprint = '', mappingVersion = IMPORT_SCHEMA_VERSION_V2) {
    return `${sourceKind}:${sourceSessionId}:${sourceFingerprint || 'any'}:${mappingVersion}`
  }

  async load() {
    if (this._cache) return this._cache
    try {
      const content = await readFile(this.ledgerPath, 'utf8')
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && parsed.records) {
        this._cache = parsed
        return parsed
      }
    } catch {
      // V2 file not found, try reading and migrating V1
    }

    try {
      const v1Content = await readFile(this.v1LedgerPath, 'utf8')
      const v1Parsed = JSON.parse(v1Content)
      if (v1Parsed && typeof v1Parsed === 'object' && v1Parsed.records) {
        const migratedRecords = {}
        for (const [key, v1Rec] of Object.entries(v1Parsed.records)) {
          const kind = v1Rec.source || key.split(':')[0] || 'unknown'
          const sId = v1Rec.sourceSessionId || key.split(':')[1] || ''
          const fp = v1Rec.sourceFingerprint || ''
          const newKey = ImportLedgerStore.makeKey(kind, sId, fp, 'v1-migrated')
          migratedRecords[newKey] = {
            importId: `imp-migrated-${Date.now()}`,
            sourceKind: kind,
            sourceSessionId: sId,
            sourceFingerprint: fp,
            mappingVersion: 'v1-migrated',
            workspaceId: '',
            sessionId: v1Rec.targetSessionId || '',
            targetSessionId: v1Rec.targetSessionId || '',
            eventCount: 0,
            transcriptHash: '',
            status: LEDGER_STATUS.SUCCEEDED,
            lastImportedSequence: 0,
            lastError: undefined,
            createdAt: v1Rec.importedAt || Date.now(),
            completedAt: v1Rec.importedAt || Date.now(),
          }
        }
        this._cache = {
          version: 2,
          records: migratedRecords,
        }
        return this._cache
      }
    } catch {
      // No V1 file either
    }

    this._cache = {
      version: 2,
      records: {},
    }
    return this._cache
  }

  async getRecord(sourceKind, sourceSessionId, sourceFingerprint = '', mappingVersion = IMPORT_SCHEMA_VERSION_V2) {
    const data = await this.load()
    const exactKey = ImportLedgerStore.makeKey(sourceKind, sourceSessionId, sourceFingerprint, mappingVersion)
    if (data.records[exactKey]) return data.records[exactKey]

    // Fallback search across any fingerprint for this session and kind
    for (const [k, rec] of Object.entries(data.records)) {
      if (rec.sourceKind === sourceKind && rec.sourceSessionId === sourceSessionId) {
        return rec
      }
    }
    return null
  }

  async findReusableImport(sourceKind, sourceSessionId, currentFingerprint, mappingVersion = IMPORT_SCHEMA_VERSION_V2) {
    const data = await this.load()
    const exactKey = ImportLedgerStore.makeKey(sourceKind, sourceSessionId, currentFingerprint, mappingVersion)
    const exactRec = data.records[exactKey]
    if (exactRec && exactRec.status === LEDGER_STATUS.SUCCEEDED && exactRec.sessionId) {
      return exactRec
    }
    return null
  }

  async checkSessionStatus(sourceKind, sourceSessionId, currentFingerprint) {
    const rec = await this.getRecord(sourceKind, sourceSessionId, currentFingerprint)
    if (!rec) return { status: 'not-imported' }
    if (rec.sourceFingerprint && currentFingerprint && rec.sourceFingerprint !== currentFingerprint) {
      return {
        status: LEDGER_STATUS.SOURCE_UPDATED,
        targetSessionId: rec.sessionId || rec.targetSessionId,
        importedAt: rec.completedAt || rec.createdAt,
      }
    }
    return {
      status: rec.status === LEDGER_STATUS.SUCCEEDED ? LEDGER_STATUS.IMPORTED : rec.status,
      targetSessionId: rec.sessionId || rec.targetSessionId,
      importedAt: rec.completedAt || rec.createdAt,
    }
  }

  async beginImport({ importId, sourceKind, sourceSessionId, sourceFingerprint, mappingVersion = IMPORT_SCHEMA_VERSION_V2, workspaceId, sessionId, eventCount }) {
    const data = await this.load()
    const key = ImportLedgerStore.makeKey(sourceKind, sourceSessionId, sourceFingerprint, mappingVersion)
    const existing = data.records[key]
    if (existing?.status === LEDGER_STATUS.SUCCEEDED && existing.sessionId) {
      return existing
    }
    if (existing?.status === LEDGER_STATUS.IN_PROGRESS) {
      const resumed = {
        ...existing,
        // Keep the first transaction's identity and target. A retry after a
        // response timeout must address the same Host session instead of
        // creating a second copy of the transcript.
        importId: existing.importId || importId,
        workspaceId: existing.workspaceId || workspaceId || '',
        sessionId: existing.sessionId || sessionId || '',
        targetSessionId: existing.targetSessionId || existing.sessionId || sessionId || '',
        eventCount: existing.eventCount || eventCount || 0,
        lastAttemptAt: Date.now(),
      }
      data.records[key] = resumed
      await this._saveAtomic(data)
      return resumed
    }
    const rec = {
      importId,
      sourceKind,
      sourceSessionId,
      sourceFingerprint: sourceFingerprint || '',
      mappingVersion,
      workspaceId: workspaceId || '',
      sessionId: sessionId || '',
      targetSessionId: sessionId || '',
      eventCount: eventCount || 0,
      transcriptHash: '',
      status: LEDGER_STATUS.IN_PROGRESS,
      lastImportedSequence: 0,
      lastError: undefined,
      createdAt: Date.now(),
      completedAt: undefined,
      lastAttemptAt: Date.now(),
    }
    data.records[key] = rec
    await this._saveAtomic(data)
    return rec
  }

  async commitImport({ importId, sourceKind, sourceSessionId, sourceFingerprint, mappingVersion = IMPORT_SCHEMA_VERSION_V2, workspaceId, sessionId, eventCount, transcriptHash }) {
    const data = await this.load()
    const key = ImportLedgerStore.makeKey(sourceKind, sourceSessionId, sourceFingerprint, mappingVersion)
    const existing = data.records[key] || {}
    const rec = {
      ...existing,
      importId,
      sourceKind,
      sourceSessionId,
      sourceFingerprint: sourceFingerprint || '',
      mappingVersion,
      workspaceId: workspaceId || existing.workspaceId || '',
      sessionId: sessionId || existing.sessionId || '',
      targetSessionId: sessionId || existing.sessionId || '',
      eventCount: eventCount !== undefined ? eventCount : existing.eventCount || 0,
      transcriptHash: transcriptHash || existing.transcriptHash || '',
      status: LEDGER_STATUS.SUCCEEDED,
      lastImportedSequence: eventCount || existing.eventCount || 0,
      lastError: undefined,
      completedAt: Date.now(),
    }
    data.records[key] = rec
    await this._saveAtomic(data)
    return rec
  }

  async failImport({ sourceKind, sourceSessionId, sourceFingerprint, mappingVersion = IMPORT_SCHEMA_VERSION_V2, error, lastSequence }) {
    const data = await this.load()
    const key = ImportLedgerStore.makeKey(sourceKind, sourceSessionId, sourceFingerprint, mappingVersion)
    const existing = data.records[key] || {}
    const rec = {
      ...existing,
      status: LEDGER_STATUS.FAILED,
      lastError: error instanceof Error ? error.message : String(error),
      lastImportedSequence: lastSequence !== undefined ? lastSequence : existing.lastImportedSequence || 0,
    }
    data.records[key] = rec
    await this._saveAtomic(data)
    return rec
  }

  async recordImport({ sourceKind, sourceSessionId, sourceFingerprint, targetSessionId, projectPath }) {
    return this.commitImport({
      importId: `imp-${Date.now()}`,
      sourceKind,
      sourceSessionId,
      sourceFingerprint,
      sessionId: targetSessionId,
      workspaceId: projectPath,
    })
  }

  async _saveAtomic(data) {
    const dir = dirname(this.ledgerPath)
    await mkdir(dir, { recursive: true })
    const tempPath = `${this.ledgerPath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    const content = JSON.stringify(data, null, 2)
    await writeFile(tempPath, content, 'utf8')
    await rename(tempPath, this.ledgerPath)
    this._cache = data
  }
}
