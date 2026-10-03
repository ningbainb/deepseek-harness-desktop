import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export { installSessionPersistenceRecovery } from '../../../../packages/dsh-desktop-compat/lib/session-recovery.js'
export { readSessionLogText } from '../../scripts/session-log-fixture.mjs'
export { createRuntimePipeIdentity, createRuntimePipeServer, RuntimePipeClient } from '../../src/runtime-pipe.mjs'
export { MAX_FRAME_BYTES, MAX_MESSAGE_BYTES } from '../../src/runtime-pipe-framing.mjs'

const appRequire = createRequire(new URL('../../package.json', import.meta.url))
const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
const backendPath = baseRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')
const backendRequire = createRequire(backendPath)
const catalogPath = backendRequire.resolve('@deepseek-ai/dsh-session-format-catalog')
const catalogRequire = createRequire(catalogPath)

export const { default: JsonlSessionPersistence } = await import(pathToFileURL(backendPath))
export const { Context } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/cordis')))
export const {
  createMessage, createUserMessage, freezeMessage, AssistantStreamAccumulator,
  expandAssistantStream, BlockAssembler,
} = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-llm')))
export const { Session, SessionId, SessionLogOffset, SESSION_FORMAT_VERSION } = await import(
  pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-session')),
)
const { createSessionFormatCatalogWithChildren } = await import(pathToFileURL(catalogPath))
const { releasedV0SessionFormatCodec } = await import(
  pathToFileURL(catalogRequire.resolve('@deepseek-ai/dsh-session-format-v0-to-v1')),
)
export const { currentSessionMessageProjections } = await import(
  pathToFileURL(backendRequire.resolve('@deepseek-ai/dsh-session-format-catalog/message-projections')),
)
export const HISTORY_BYTES = 5 * 1024 * 1024
export const TURN_COUNT = 10
export const BODY_BYTES = HISTORY_BYTES / (TURN_COUNT * 2)
export const BACKUP_SUFFIX = '.desktop-v0-permission-preset-backup-v3.4.0'
export const digest = value => createHash('sha256').update(value).digest('hex')
export const stableJson = value => JSON.stringify(value, (_key, item) => {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item
  return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
})

function bodyText(kind, turn) {
  const begin = `BEGIN-${kind}-${turn}-正文\\n"\r\n`
  const end = `\nEND-${kind}-${turn}`
  const bytes = BODY_BYTES - Buffer.byteLength(begin, 'utf8') - Buffer.byteLength(end, 'utf8')
  const lines = []
  for (let index = 0; lines.length * 65 < bytes; index += 1) {
    lines.push(`${digest(`fixture-634:${kind}:${turn}:${index}`)}\n`)
  }
  const text = begin + lines.join('').slice(0, bytes) + end
  assert.equal(Buffer.byteLength(text, 'utf8'), BODY_BYTES)
  return text
}

export function buildCorpus() {
  const corpus = Array.from({ length: TURN_COUNT }, (_unused, index) => ({
    assistant: bodyText('assistant', index + 1), tool: bodyText('tool', index + 1),
  }))
  assert.equal(corpus.reduce((bytes, pair) => bytes
    + Buffer.byteLength(pair.assistant, 'utf8') + Buffer.byteLength(pair.tool, 'utf8'), 0), HISTORY_BYTES)
  return corpus
}

export function buildV0Seed(id, cwd, corpus, mode) {
  assert.ok(mode === 'native' || mode === 'permission-recovery')
  const header = { type: 'session', version: 0, id, createdAt: 1, cwd, delegationDepth: 0 }
  const rows = []
  const messages = []
  const append = (type, data, options = {}) => {
    const seq = rows.length
    rows.push({ type, seq, time: seq + 1, data, ...options })
    return seq
  }
  append('permission/preset', mode === 'native'
    ? { preset: 'standard' } : { preset: 'standard', origin: 'default' })
  append('session/end-seed', {})
  for (let turn = 1; turn <= TURN_COUNT; turn += 1) {
    const pair = corpus[turn - 1]
    const callId = `fixture-634-call-${turn}`
    const argumentsText = JSON.stringify({ fixture: 634, turn })
    const toolCall = { type: 'tool-call', id: callId, name: 'fixture_echo', arguments: argumentsText }
    const user = createUserMessage({
      content: [{ type: 'text', text: `Synthetic V0 turn ${turn}` }], source: { kind: 'user' },
    })
    const assistant = createMessage({
      role: 'assistant', content: [{ type: 'text', text: pair.assistant }, toolCall],
      source: { kind: 'model', provider: 'fixture-634', model: 'fixture-634-v0-model' },
    })
    const legacyResult = createMessage({
      role: 'user', source: { kind: 'tool', callId },
      content: [{
        type: 'tool-result', toolCallId: callId,
        content: [{ type: 'text', text: pair.tool }], isError: false,
      }],
    })
    const currentResult = freezeMessage({
      id: legacyResult.id, role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId,
      content: [{ type: 'text', text: pair.tool }], isError: false,
    })
    append('turn/start', { turn })
    append('step/start', { turn, step: 1 })
    append('user/message', user, { surfaceOp: 'append' })
    const chunks = [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: pair.assistant },
      { type: 'block-end', index: 0, block: { type: 'text', text: pair.assistant } },
      { type: 'block-start', index: 1, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 1, id: callId, name: 'fixture_echo', argumentsDelta: argumentsText },
      { type: 'block-end', index: 1, block: toolCall },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
    const sources = chunks.map(chunk => append('assistant/chunk', { turn, step: 1, chunk }))
    append('assistant/message', { turn, step: 1, message: assistant }, {
      surfaceOp: 'append', sourceEventSeqs: sources,
    })
    append('tool/call', { turn, step: 1, callId, name: 'fixture_echo', arguments: argumentsText })
    append('tool/result', { turn, step: 1, message: legacyResult }, { surfaceOp: 'append' })
    append('step/end', { turn, step: 1 })
    append('turn/end', { turn, reason: { kind: 'completed' } })
    messages.push(user, assistant, currentResult)
  }
  const normalizedRows = rows.map((row, index) => index === 0
    ? { ...row, data: { preset: 'standard' } } : row)
  assert.equal(rows.length, 2 + TURN_COUNT * 15)
  assert.equal(messages.length, TURN_COUNT * 3)
  assert.equal(releasedV0SessionFormatCodec.decodeHeader(header).isSeeded, false)
  return { header, rows, normalizedRows, messages }
}

export function restoreStrict(header, rows) {
  const restore = createSessionFormatCatalogWithChildren([]).createRestore(header, {
    recovery: 'strict', validation: 'current',
  })
  for (const row of rows) restore.decodeRow(row)
  return restore.finish()
}

export function assertStreams(events) {
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    assert.ok(event.data.stream.length > 0, 'a settled assistant must keep its complete source attempt')
    const assembler = new BlockAssembler()
    for (const member of expandAssistantStream(event.data.stream)) assembler.push(member.chunk)
    assert.deepEqual(assembler.blocks(), event.data.message.content)
    assert.deepEqual(assembler.usage, event.data.usage)
    assert.deepEqual(assembler.replayState, event.data.message.source.replayState)
  }
}

export function assertMigration(seed, expected) {
  assert.equal(expected.header.version, 4)
  assert.equal(expected.header.id, seed.header.id)
  assert.equal(expected.inheritedEventCount, 0)
  assert.equal(expected.events.length, 3 + TURN_COUNT * 8)
  assert.equal(expected.events.some(event => event.type === 'assistant/chunk'), false)
  const systemHeads = expected.events.filter(event => event.type === 'system/message')
  assert.equal(systemHeads.length, 1, 'the official V2-to-V3 edge must insert exactly one protected empty system head')
  assert.deepEqual(systemHeads[0].data.message.content, [])
  assertStreams(expected.events)
  const assistants = expected.events.filter(event => event.type === 'assistant/message')
  for (const event of assistants) {
    const original = seed.rows.filter(row => row.type === 'assistant/chunk' && row.data.turn === event.data.turn)
      .map(row => ({ time: row.time, chunk: row.data.chunk }))
    assert.equal(original.length, 7)
    assert.deepEqual(expandAssistantStream(event.data.stream), original, 'every original timed chunk must survive compaction')
  }
}

export function assertHistory(header, inheritedEventCount, result, expectedEvents, expectedMessages, corpus) {
  assert.equal(header.version, 4)
  assert.equal(inheritedEventCount, 0)
  result.events.forEach((event, index) => assert.equal(event.seq, index))
  assert.deepEqual(result.events, expectedEvents, 'complete migrated event prefix, coordinates and streams must survive')
  assert.equal(digest(stableJson(result.events)), digest(stableJson(expectedEvents)))
  assertStreams(result.events)
  const session = Session.fromRestore(SessionId(header.id), result.events, header,
    inheritedEventCount, result.eventState, currentSessionMessageProjections)
  const messages = session.deriveMessages()
  assert.deepEqual(messages, expectedMessages, 'all message identities, sources and content must survive')
  assert.equal(digest(stableJson(messages)), digest(stableJson(expectedMessages)))
  const calls = result.events.filter(event => event.type === 'tool/call')
  const results = result.events.filter(event => event.type === 'tool/result')
  assert.equal(calls.length, TURN_COUNT)
  assert.equal(results.length, TURN_COUNT)
  let bodyBytes = 0
  corpus.forEach((pair, index) => {
    const turn = index + 1
    const assistant = messages[index * 3 + 1]
    const result = messages[index * 3 + 2]
    const call = calls[index]
    assert.equal(call.data.turn, turn)
    assert.equal(call.data.step, 1)
    assert.equal(results[index].data.turn, turn)
    assert.equal(results[index].data.step, 1)
    assert.equal(result.role, 'tool')
    assert.equal(result.toolCallId, call.data.callId)
    assert.equal(result.source.callId, call.data.callId)
    assert.equal(result.isError, false)
    assert.deepEqual(assistant.content[1], {
      type: 'tool-call', id: call.data.callId, name: call.data.name, arguments: call.data.arguments,
    })
    assert.equal(digest(assistant.content[0].text), digest(pair.assistant))
    assert.equal(digest(result.content[0].text), digest(pair.tool))
    bodyBytes += Buffer.byteLength(assistant.content[0].text, 'utf8') + Buffer.byteLength(result.content[0].text, 'utf8')
  })
  assert.equal(bodyBytes, HISTORY_BYTES)
  return session
}
