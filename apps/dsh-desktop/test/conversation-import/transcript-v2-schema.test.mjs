import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EVENT_ROLES,
  EVENT_TYPES,
  IMPORT_SCHEMA_VERSION_V2,
  SOURCE_KINDS,
  TIMESTAMP_QUALITY,
  TOOL_STATUS,
  computeTranscriptHash,
  createTranscriptEvent,
  generateStableEventId,
  validateExternalConversationV2,
} from '../../src/conversation-import/schema.mjs'

test('ExternalConversationV2 schema validation and stable event ID generation', () => {
  const eventId1 = generateStableEventId('session-01', 1, 'src-msg-1')
  const eventId2 = generateStableEventId('session-01', 1, 'src-msg-1')
  assert.equal(eventId1, eventId2)
  assert.match(eventId1, /^[0-9a-f]{32}$/u)

  const ev1 = createTranscriptEvent({
    sequence: 1,
    type: EVENT_TYPES.MESSAGE,
    role: EVENT_ROLES.USER,
    content: 'Hello assistant',
    sourceEventId: 'src-1',
    sourceTimestamp: 1700000000000,
    timestampQuality: TIMESTAMP_QUALITY.EXACT,
    sourceSessionId: 'sess-abc',
  })

  assert.equal(ev1.sequence, 1)
  assert.equal(ev1.historical, true)
  assert.equal(ev1.executable, false)
  assert.equal(ev1.type, 'message')
  assert.equal(ev1.role, 'user')

  const validConv = {
    schemaVersion: IMPORT_SCHEMA_VERSION_V2,
    source: {
      kind: SOURCE_KINDS.CODEX,
      sessionId: 'sess-abc',
      importedAt: Date.now(),
    },
    project: {
      displayName: 'My Project',
      originalCwd: 'C:\\Projects\\App',
    },
    conversation: {
      title: 'Valid Session',
      startedAt: 1700000000000,
      endedAt: 1700000010000,
      eventCount: 1,
    },
    events: [ev1],
  }

  assert.equal(validateExternalConversationV2(validConv), true)

  const hash = computeTranscriptHash(validConv.events)
  assert.match(hash, /^[0-9a-f]{64}$/u)

  // Non-monotonic sequence should fail validation
  const invalidConv = {
    ...validConv,
    events: [
      ev1,
      { ...ev1, sequence: 1, eventId: 'dup-seq' },
    ],
  }
  assert.throws(() => validateExternalConversationV2(invalidConv), /strictly sequential/)
})
