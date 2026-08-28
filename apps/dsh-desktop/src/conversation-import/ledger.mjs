/**
 * Import Ledger Store.
 * Atomically persists imported session records to prevent duplicate imports
 * and detect source updates.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { LEDGER_STATUS } from './schema.mjs'

export class ImportLedgerStore {
  constructor(options = {}) {
    const dshHome = options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh')
    this.ledgerPath = options.ledgerPath || join(dshHome, 'state', 'external-conversation-imports-v1.json')
    this._cache = null
  }

  async load() {
    if (this._cache) return this._cache
    try {
      const content = await readFile(this.ledgerPath, 'utf8')
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && parsed.version === 1 && parsed.records) {
        this._cache = parsed
        return parsed
      }
    } catch {
      // file not found or corrupted
    }

    this._cache = {
      version: 1,
      records: {},
    }
    return this._cache
  }

  async getRecord(sourceKind, sourceSessionId) {
    const data = await this.load()
    const key = `${sourceKind}:${sourceSessionId}`
    return data.records[key] || null
  }

  /**
   * Check whether a session is already imported or has been updated in the source tool.
   */
  async checkSessionStatus(sourceKind, sourceSessionId, currentFingerprint) {
    const rec = await this.getRecord(sourceKind, sourceSessionId)
    if (!rec) return { status: 'not-imported' }
    if (rec.sourceFingerprint && currentFingerprint && rec.sourceFingerprint !== currentFingerprint) {
      return {
        status: LEDGER_STATUS.SOURCE_UPDATED,
        targetSessionId: rec.targetSessionId,
        importedAt: rec.importedAt,
      }
    }
    return {
      status: LEDGER_STATUS.IMPORTED,
      targetSessionId: rec.targetSessionId,
      importedAt: rec.importedAt,
    }
  }

  /**
   * Commit a newly imported session to the ledger.
   */
  async recordImport({ sourceKind, sourceSessionId, sourceFingerprint, targetSessionId, projectPath }) {
    const data = await this.load()
    const key = `${sourceKind}:${sourceSessionId}`

    data.records[key] = {
      source: sourceKind,
      sourceSessionId,
      sourceFingerprint: sourceFingerprint || '',
      targetSessionId,
      projectPath: projectPath || '',
      importedAt: Date.now(),
      status: LEDGER_STATUS.IMPORTED,
    }

    await this._saveAtomic(data)
  }

  async _saveAtomic(data) {
    const dir = dirname(this.ledgerPath)
    await mkdir(dir, { recursive: true })
    const tempPath = `${this.ledgerPath}.${Date.now()}.tmp`
    const content = JSON.stringify(data, null, 2)
    await writeFile(tempPath, content, 'utf8')
    await rename(tempPath, this.ledgerPath)
    this._cache = data
  }
}
