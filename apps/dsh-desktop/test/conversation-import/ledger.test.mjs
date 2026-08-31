import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ImportLedgerStore } from '../../src/conversation-import/ledger.mjs'
import { LEDGER_STATUS } from '../../src/conversation-import/schema.mjs'

test('ImportLedgerStore records import and detects fingerprint updates', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'ledger-test-'))
  try {
    const ledgerPath = join(tempDir, 'state', 'external-conversation-imports-v1.json')
    const store = new ImportLedgerStore({ ledgerPath })

    // 1. Initial check on non-imported session
    const status1 = await store.checkSessionStatus('claude-code', 'sess-1', 'fp-111')
    assert.equal(status1.status, 'not-imported')

    // 2. Record import
    await store.recordImport({
      sourceKind: 'claude-code',
      sourceSessionId: 'sess-1',
      sourceFingerprint: 'fp-111',
      targetSessionId: 'dsh-session-999',
      projectPath: 'C:\\Projects\\app',
    })

    // 3. Check again with same fingerprint -> imported
    const status2 = await store.checkSessionStatus('claude-code', 'sess-1', 'fp-111')
    assert.equal(status2.status, LEDGER_STATUS.IMPORTED)
    assert.equal(status2.targetSessionId, 'dsh-session-999')

    // 4. Check again with changed fingerprint -> source-updated
    const status3 = await store.checkSessionStatus('claude-code', 'sess-1', 'fp-222-changed')
    assert.equal(status3.status, LEDGER_STATUS.SOURCE_UPDATED)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
