import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ImportLedgerStore } from '../../src/conversation-import/ledger.mjs'
import { LEDGER_STATUS } from '../../src/conversation-import/schema.mjs'

test('ImportLedgerStore V2 supports compound keys, status tracking, and resumption', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'ledger-test-'))
  try {
    const ledgerPath = join(tempDir, 'state', 'external-conversation-imports-v2.json')
    const ledger = new ImportLedgerStore({ ledgerPath })

    // 1. Begin import
    const beginRec = await ledger.beginImport({
      importId: 'imp-001',
      sourceKind: 'codex',
      sourceSessionId: 'sess-001',
      sourceFingerprint: 'fp-hash-1',
      workspaceId: 'ws-1',
      sessionId: 'sess-target-1',
      eventCount: 10,
    })

    assert.equal(beginRec.status, LEDGER_STATUS.IN_PROGRESS)
    assert.equal(beginRec.importId, 'imp-001')

    // 2. Fail import
    const failedRec = await ledger.failImport({
      sourceKind: 'codex',
      sourceSessionId: 'sess-001',
      sourceFingerprint: 'fp-hash-1',
      error: 'Network timeout during event replay',
      lastSequence: 5,
    })
    assert.equal(failedRec.status, LEDGER_STATUS.FAILED)
    assert.equal(failedRec.lastImportedSequence, 5)

    // 3. Re-import and commit
    const committedRec = await ledger.commitImport({
      importId: 'imp-001-retry',
      sourceKind: 'codex',
      sourceSessionId: 'sess-001',
      sourceFingerprint: 'fp-hash-1',
      workspaceId: 'ws-1',
      sessionId: 'sess-target-1',
      eventCount: 10,
      transcriptHash: 'hash-abc-123',
    })
    assert.equal(committedRec.status, LEDGER_STATUS.SUCCEEDED)

    // 4. Find reusable import
    const reusable = await ledger.findReusableImport('codex', 'sess-001', 'fp-hash-1')
    assert.ok(reusable)
    assert.equal(reusable.sessionId, 'sess-target-1')

    // 5. Detect source update when fingerprint changes
    const statusUpdated = await ledger.checkSessionStatus('codex', 'sess-001', 'fp-hash-2-new')
    assert.equal(statusUpdated.status, LEDGER_STATUS.SOURCE_UPDATED)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
