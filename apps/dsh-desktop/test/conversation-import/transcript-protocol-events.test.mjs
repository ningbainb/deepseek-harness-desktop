import assert from 'node:assert/strict'
import test from 'node:test'
import { Session, SessionId } from '@deepseek-ai/dsh-session'

import {
  convertExternalEventsToDshEvents,
  validateImportChunk,
} from '../../src/conversation-import/transcript-protocol.mjs'
import {
  createTranscriptEvent,
  EVENT_ROLES,
  EVENT_TYPES,
  TOOL_STATUS,
} from '../../src/conversation-import/schema.mjs'

test('Transcript Protocol converts ExternalConversationV2 events to canonical DSH SessionEvents', () => {
  const events = [
    createTranscriptEvent({
      sequence: 1,
      type: EVENT_TYPES.MESSAGE,
      role: EVENT_ROLES.USER,
      content: 'Write unit tests',
      sourceSessionId: 'sess-proto',
    }),
    createTranscriptEvent({
      sequence: 2,
      type: EVENT_TYPES.MESSAGE,
      role: EVENT_ROLES.ASSISTANT,
      content: 'I will inspect test runner',
      sourceSessionId: 'sess-proto',
    }),
    createTranscriptEvent({
      sequence: 3,
      type: EVENT_TYPES.TOOL_CALL,
      role: EVENT_ROLES.ASSISTANT,
      toolName: 'run_command',
      toolCallId: 'call-01',
      toolArgs: { cmd: 'pnpm test' },
      sourceSessionId: 'sess-proto',
    }),
    createTranscriptEvent({
      sequence: 4,
      type: EVENT_TYPES.TOOL_RESULT,
      role: EVENT_ROLES.TOOL,
      toolCallId: 'call-01',
      toolResult: 'PASS',
      toolStatus: TOOL_STATUS.SUCCESS,
      sourceSessionId: 'sess-proto',
    }),
    createTranscriptEvent({
      sequence: 5,
      type: EVENT_TYPES.SYSTEM,
      role: EVENT_ROLES.SYSTEM,
      content: 'System instruction update',
      sourceSessionId: 'sess-proto',
    }),
  ]

  const dshEvents = convertExternalEventsToDshEvents(events, {
    importId: 'imp-proto-1',
    sourceKind: 'codex',
    sourceSessionId: 'sess-proto',
  })

  assert.ok(dshEvents.length >= 6)
  assert.equal(dshEvents.every((e, index) => e.seq === index && Number.isSafeInteger(e.time)), true)
  assert.equal(dshEvents.every((e) => !Object.hasOwn(e, 'historical') && !Object.hasOwn(e, 'importId')), true)
  assert.equal(dshEvents.some((e) => e.type === 'tool/call'), true)
  assert.equal(dshEvents.some((e) => e.type === 'tool/result'), true)
  assert.equal(dshEvents.some((e) => e.type === 'user/message'), true)
  assert.equal(dshEvents.some((e) => e.type === 'assistant/message'), true)
  assert.notEqual(dshEvents[dshEvents.length - 1].type, 'session/end-seed')

  // The real Session constructor validates the complete seed and appends the
  // lifecycle marker itself. This is the same path used by the Host route.
  const session = Session.create(SessionId('import-protocol-test'), dshEvents)
  assert.equal(session.events.at(-1).type, 'session/end-seed')
  assert.ok(session.deriveMessages().some((message) => message.role === 'assistant'))
  assert.ok(session.deriveMessages().some((message) => message.content[0]?.type === 'tool-result'))

  // Chunk validator checks
  assert.equal(validateImportChunk({ events }, 1), true)
  assert.throws(() => validateImportChunk({ events }, 2), /sequence mismatch/)
})

test('Transcript Protocol bounds an oversized seed and leaves a valid Session', () => {
  const events = Array.from({ length: 500 }, (_, index) => createTranscriptEvent({
    sequence: index + 1,
    type: EVENT_TYPES.MESSAGE,
    role: EVENT_ROLES.ASSISTANT,
    content: 'x'.repeat(100_000),
    sourceSessionId: 'sess-large',
  }))

  const dshEvents = convertExternalEventsToDshEvents(events, {
    importId: 'imp-large',
    sourceKind: 'codex',
    sourceSessionId: 'sess-large',
  })

  assert.equal(dshEvents.truncated, true)
  assert.ok(dshEvents.byteLength <= 24 * 1024 * 1024)
  const session = Session.create(SessionId('import-large'), dshEvents, {
    version: 0,
    id: 'import-large',
    createdAt: Date.now(),
    cwd: process.cwd(),
    seedLength: dshEvents.length,
  })
  assert.equal(session.events.at(-1).type, 'session/end-seed')
  assert.ok(session.deriveMessages().some((message) => message.content?.[0]?.text?.includes('safe size limit')))
})
