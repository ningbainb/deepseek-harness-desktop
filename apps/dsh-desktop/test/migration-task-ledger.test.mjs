import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LEGACY_TASK_LEDGER_MAX_BYTES,
  assertLegacyTaskOrigin,
  convertLegacyTasksToV3,
  inspectHostTaskLedger,
  legacyTaskFingerprint,
  migrateLegacyTaskLedger,
  parseLegacyTaskLedger,
  shouldReadLegacyTaskStorage,
} from '../src/migration-task-ledger.mjs'

const task = {
  id: 'legacy-task-1',
  title: 'Migrate this task',
  description: 'private description',
  prompt: 'private prompt',
  status: 'todo',
  createdAt: 1,
  updatedAt: 2,
  executions: [],
}

function response(value, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => JSON.stringify(value) }
}

test('v1 Task data is copied to an empty v3 ledger and verified without returning content', async () => {
  let document = { schemaVersion: 3, revision: 0, updatedAt: 1, projects: [], tasks: [], evidences: [] }
  const result = await migrateLegacyTaskLedger({
    endpoint: 'http://127.0.0.1:4010/api/dsh-task-board/v3',
    getLegacyValue: async () => JSON.stringify([task]),
    fetchImpl: async (_url, options = {}) => {
      if (options.method === 'PUT') {
        document = JSON.parse(options.body)
        document = { ...document, revision: 1 }
      }
      return response(document)
    },
  })
  assert.deepEqual(result, { status: 'migrated-v1', taskCount: 1, fingerprint: legacyTaskFingerprint(convertLegacyTasksToV3([task])) })
  assert.equal(document.tasks[0].prompt, 'private prompt')
  assert.equal(document.tasks[0].isolationMode, 'shared-workspace')
  assert.equal(JSON.stringify(result).includes('private prompt'), false)
})

test('v1 executions become bounded v3 run references and unknown fields do not cross the boundary', () => {
  const converted = convertLegacyTasksToV3([{
    ...task,
    unexpectedPromptTranscript: 'must not persist',
    executions: [{
      id: 'legacy-run-1',
      sessionId: 'session-1',
      startedAt: 10,
      endedAt: 20,
      result: 'succeeded',
      error: undefined,
      toolResult: 'must not persist',
    }],
  }])
  assert.deepEqual(converted[0].runs, [{
    runId: 'legacy-run-1',
    sessionId: 'session-1',
    workspaceId: 'legacy',
    startedAt: 10,
    finishedAt: 20,
    resultStatus: 'accepted',
    runtimeProviderEvidence: {},
  }])
  assert.doesNotMatch(JSON.stringify(converted), /must not persist/u)
})

test('a populated v3 ledger wins and the legacy browser value is never read', async () => {
  let read = false
  const result = await migrateLegacyTaskLedger({
    endpoint: 'http://127.0.0.1:4010/api/dsh-task-board/v3',
    getLegacyValue: async () => { read = true; return JSON.stringify([task]) },
    fetchImpl: async () => response({ schemaVersion: 3, revision: 4, updatedAt: 2, projects: [], tasks: [task], evidences: [] }),
  })
  assert.equal(read, false)
  assert.equal(result.status, 'host-ledger-present')
})

test('a populated Host v3 ledger never requires an old browser origin or localStorage probe', async () => {
  const existing = { schemaVersion: 3, revision: 4, updatedAt: 2, projects: [], tasks: [task], evidences: [] }
  const summary = await inspectHostTaskLedger({
    endpoint: 'http://127.0.0.1:4010/api/dsh-task-board/v3',
    fetchImpl: async () => response(existing),
  })
  assert.equal(summary.taskCount, 1)
  assert.equal(shouldReadLegacyTaskStorage(summary), false)
  assert.equal(shouldReadLegacyTaskStorage({ taskCount: 0 }), true)
})

test('oversized or malformed v1 data is rejected before Host writes', async () => {
  assert.throws(() => parseLegacyTaskLedger('x'.repeat(LEGACY_TASK_LEDGER_MAX_BYTES + 1)), /size limit/u)
  await assert.rejects(
    migrateLegacyTaskLedger({
      endpoint: 'http://127.0.0.1:4010/api/dsh-task-board/v3',
      getLegacyValue: async () => '[{"bad":true}]',
      fetchImpl: async () => response({ schemaVersion: 3, revision: 0, updatedAt: 1, projects: [], tasks: [], evidences: [] }),
    }),
    /unsupported required shape/u,
  )
})

test('v1-only legacy data never treats an unknown or changed loopback origin as empty', () => {
  assert.throws(
    () => assertLegacyTaskOrigin({ sourceVersion: '2.3.0', hasV2Source: false, runtimeUrl: 'http://127.0.0.1:4100/' }),
    /cannot be proven/u,
  )
  assert.throws(
    () => assertLegacyTaskOrigin({ sourceVersion: '2.4.0', hasV2Source: false, recordedPort: 4100, runtimeUrl: 'http://127.0.0.1:4200/' }),
    /origin is unavailable/u,
  )
  assert.doesNotThrow(() => assertLegacyTaskOrigin({
    sourceVersion: '2.7.0',
    hasV2Source: false,
    recordedPort: 4100,
    runtimeUrl: 'http://127.0.0.1:4100/',
  }))
  assert.throws(
    () => assertLegacyTaskOrigin({
      sourceVersion: '2.4.0',
      hasV2Source: true,
      hostLedgerEmpty: true,
      runtimeUrl: 'http://127.0.0.1:4100/',
    }),
    /cannot be proven/u,
  )
  assert.doesNotThrow(() => assertLegacyTaskOrigin({
    sourceVersion: '2.4.0',
    hasV2Source: true,
    hostLedgerEmpty: false,
    runtimeUrl: 'http://127.0.0.1:4100/',
  }))
})
