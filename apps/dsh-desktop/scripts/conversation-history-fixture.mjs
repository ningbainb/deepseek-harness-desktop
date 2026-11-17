import assert from 'node:assert/strict'
import { join } from 'node:path'
import { createMessage, createUserMessage, expandAssistantStream } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { appendSessionLogText, findSessionLogs, readSessionLogText } from './session-log-fixture.mjs'

// Shared unchanged event-generation path from the native G02.5 scroll fixture.
// Call only after closing the owning Runtime; never fabricate Context UI data.
export async function seedConversationHistory({ sessionId, dshHome, workspacePath, messageCount = 20, nativeTurns = false, markerPrefix = 'G02.5 turn' }) {
  const logs = await findSessionLogs(join(dshHome, 'sessions'))
  const histories = await Promise.all(logs.map(async path => ({ path, text: await readSessionLogText(path) })))
  const matchingLogs = histories.filter(history => JSON.parse(history.text.split('\n', 1)[0]).id === sessionId)
  assert.equal(matchingLogs.length, 1, `expected exactly one fixture session ${sessionId}, found ${JSON.stringify(logs)}`)
  const logPath = matchingLogs[0].path
  const original = matchingLogs[0].text
  const lines = original.trimEnd().split(/\r?\n/u)
  assert.ok(lines.length >= 1, 'session log is missing its header')
  const header = JSON.parse(lines[0])
  assert.equal(header.id, sessionId)
  assert.equal(header.cwd, workspacePath)
  const existingEvents = lines.slice(1).filter(Boolean).map(line => JSON.parse(line))
  assert.ok(existingEvents.every((event, index) => event.seq === index), 'new session events are not contiguous')

  // Desktop session creation records its permission baseline immediately.
  // Replaying that valid prefix lets the official Session implementation mint
  // the end-seed marker and all following event sequence numbers correctly.
  const session = Session.create(SessionId(sessionId), existingEvents)
  // A user-message-only log is still a provisional blank session in the
  // official sessionListMetadata projection. Keep one real enclosing turn
  // for the compatibility fixture: it has no per-message native turn rail,
  // but New Session must not legitimately reuse it as an untouched draft.
  if (!nativeTurns) session.append('turn/start', { turn: 1 })
  for (let index = 1; index <= messageCount; index += 1) {
    if (nativeTurns) session.append('turn/start', { turn: index })
    session.append('user/message', createUserMessage({
      content: [{
        type: 'text',
        text: `${markerPrefix} ${String(index).padStart(2, '0')}\n${'Long conversation viewport evidence. '.repeat(14)}`,
      }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    if (nativeTurns && index === messageCount) {
      // A real durable settlement drives both official and desktop projections.
      // No provider request, injected DOM metric, or real user log is involved.
      session.append('step/start', { turn: index, step: 1 })
      const time0 = Date.now()
      await new Promise(resolve => setTimeout(resolve, 30))
      const stream = [{ type: 'text-chunks', time0, index: 0, dt: [20], texts: ['Statistics fixture. ', 'Completed.'] }]
      assert.equal(expandAssistantStream(stream).length, 2, 'validate compact stream before persisting the fixture')
      session.append('assistant/message', {
        turn: index, step: 1,
        message: createMessage({
          role: 'assistant',
          content: [{ type: 'text', text: 'Statistics fixture. Completed.' }],
          source: { kind: 'model', provider: 'mock', model: 'mock' },
        }),
        stream,
        usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 200 },
      }, { surfaceOp: 'append' })
      session.append('step/end', { turn: index, step: 1 })
    }
    if (nativeTurns) session.append('turn/end', { turn: index, reason: { kind: 'completed' } })
  }
  if (!nativeTurns) session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const appended = session.snapshotEvents().slice(existingEvents.length)
  assert.equal(appended.length, nativeTurns ? messageCount * 3 + 4 : messageCount + 3)
  await appendSessionLogText(logPath, `${appended.map(event => JSON.stringify(event)).join('\n')}\n`)
  for (const history of histories.filter(history => history.path !== logPath)) {
    assert.equal(await readSessionLogText(history.path), history.text, 'seeding the fixture must not alter another session')
  }
  return { logPath, asOfSeq: session.snapshotEvents().at(-1).seq }
}
