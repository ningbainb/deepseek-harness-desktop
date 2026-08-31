import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { basename } from 'node:path'
import { Session, SessionId } from '@deepseek-ai/dsh-session'

import { DSHSessionBridge } from '../../src/conversation-import/session-bridge.mjs'
import { CodexAdapter } from '../../src/conversation-import/adapters/codex.mjs'

test('DSHSessionBridge validates directory and imports legitimate session with seed events', async () => {
  const codexFixture = fileURLToPath(new URL('../fixtures/codex/sanitized-rollout.jsonl', import.meta.url))
  const codex = new CodexAdapter()
  const conv = await codex.readConversation(codexFixture)

  let createdSession = null
  let createdWorkspace = null

  const mockHost = {
    workspaces: {
      list: { getSnapshot: () => ({ items: [] }) },
      create: async ({ path, title }) => {
        createdWorkspace = { workspaceId: 'ws-legit-001', path, title }
        return createdWorkspace
      },
    },
    sessions: {
      create: (id, options) => {
        createdSession = { id: 'sess-legit-001', options }
        return createdSession
      },
      flush: async () => {},
    },
  }

  const bridge = new DSHSessionBridge({ hostContext: mockHost })

  // 1. Invalid path throws
  await assert.rejects(
    () => bridge.importConversationSession({
      projectCwd: 'C:\\Path\\That\\Does\\Not\\Exist\\At\\All\\12345',
      conversation: conv,
    }),
    /does not exist/
  )

  // 2. Legitimate import succeeds
  const res = await bridge.importConversationSession({
    projectCwd: process.cwd(),
    conversation: conv,
    title: 'My Legit Imported Session',
  })

  assert.equal(res.ok, true)
  assert.equal(res.sessionId, 'sess-legit-001')
  assert.equal(res.workspaceId, 'ws-legit-001')
  assert.equal(createdWorkspace.title, basename(process.cwd()))
  assert.equal(res.importedEventCount, 5)
  assert.ok(createdSession.options.seed.length >= 5)
  assert.equal(createdSession.options.seed.every((e, index) => e.seq === index && Number.isSafeInteger(e.time)), true)
  assert.equal(createdSession.options.seed.every((e) => !Object.hasOwn(e, 'historical')), true)
  assert.equal(Session.create(SessionId('bridge-seed-check'), createdSession.options.seed).events.at(-1).type, 'session/end-seed')
})

test('DSHSessionBridge detaches a prepared import session after the durability flush', async () => {
  const codexFixture = fileURLToPath(new URL('../fixtures/codex/sanitized-rollout.jsonl', import.meta.url))
  const conversation = await new CodexAdapter().readConversation(codexFixture)
  const session = {
    id: 'sess-prepared-001',
    header: { cwd: process.cwd() },
    events: [],
  }
  let announced = 0
  let flushed = 0
  let detached = 0
  const attached = []
  const mockHost = {
    workspaces: {
      list: { getSnapshot: () => ({ items: [] }) },
      create: async ({ path, title }) => ({
        workspaceId: 'ws-prepared-001',
        path,
        title,
        attachSession: async (id) => { attached.push(id) },
      }),
    },
    sessions: {
      prepare: (id, options) => {
        session.id = id || session.id
        session.options = options
        return session
      },
      enter: (value) => {
        assert.equal(value, session)
        return () => { detached += 1 }
      },
      announce: (value) => {
        assert.equal(value, session)
        announced += 1
      },
      flush: async (value) => {
        assert.equal(value, session)
        flushed += 1
      },
    },
  }

  const result = await new DSHSessionBridge({ hostContext: mockHost }).importConversationSession({
    projectCwd: process.cwd(),
    conversation,
    importId: 'imp-prepared-001',
    sessionId: 'sess-prepared-001',
    title: 'Prepared import',
  })

  assert.equal(result.ok, true)
  assert.equal(announced, 1)
  assert.equal(flushed, 1)
  assert.equal(detached, 1)
  assert.deepEqual(attached, ['sess-prepared-001'])
})
