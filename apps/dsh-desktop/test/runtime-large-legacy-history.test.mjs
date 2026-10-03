import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { zstdCompressSync } from 'node:zlib'

import { createRuntimePipeIdentity, createRuntimePipeServer, RuntimePipeClient } from '../src/runtime-pipe.mjs'
import { MAX_FRAME_BYTES } from '../src/runtime-pipe-framing.mjs'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
const backendPath = baseRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')
const backendRequire = createRequire(backendPath)
const catalogPath = backendRequire.resolve('@deepseek-ai/dsh-session-format-catalog')
const catalogRequire = createRequire(catalogPath)
const { default: JsonlSessionPersistence } = await import(pathToFileURL(backendPath))
const { Context } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/cordis')))
const { createMessage, createUserMessage } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-llm')))
const { Session, SessionId, SessionLogOffset, SESSION_FORMAT_VERSION } = await import(
  pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-session')),
)
const { releasedV3SessionFormatCodec: releasedV3Codec } = await import(
  pathToFileURL(catalogRequire.resolve('@deepseek-ai/dsh-session-format-v2-to-v3')),
)
const { createSessionFormatCatalogWithChildren } = await import(pathToFileURL(catalogPath))
const { currentSessionMessageProjections } = await import(
  pathToFileURL(backendRequire.resolve('@deepseek-ai/dsh-session-format-catalog/message-projections')),
)

const HISTORY_BYTES = 5 * 1024 * 1024
const ASSISTANT_COUNT = 20
const MESSAGE_BYTES = HISTORY_BYTES / ASSISTANT_COUNT
const fixturePrefix = 'fixture-616-large-v3-'
const digest = value => createHash('sha256').update(value).digest('hex')
const stableJson = value => JSON.stringify(value, (_key, item) => {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item
  return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
})

function historyText(turn) {
  const begin = `BEGIN-${turn}-正文\\n"\n`
  const end = `\nEND-${turn}`
  const bodyBytes = MESSAGE_BYTES - Buffer.byteLength(begin, 'utf8') - Buffer.byteLength(end, 'utf8')
  const lines = []
  for (let index = 0; lines.length * 65 < bodyBytes; index += 1) {
    lines.push(`${digest(`fixture-616:${turn}:${index}`)}\n`)
  }
  const text = begin + lines.join('').slice(0, bodyBytes) + end
  assert.equal(Buffer.byteLength(text, 'utf8'), MESSAGE_BYTES)
  return text
}

function buildV3History() {
  const events = []
  const messages = []
  const append = (type, data, surface = false) => {
    events.push({
      type, seq: events.length, time: events.length + 1, data,
      ...surface ? { surfaceOp: 'append' } : {},
    })
  }
  append('session/end-seed', {})
  for (let turn = 1; turn <= ASSISTANT_COUNT; turn += 1) {
    const text = historyText(turn)
    const user = createUserMessage({
      content: [{ type: 'text', text: `Synthetic V3 turn ${turn}` }],
      source: { kind: 'user' },
    })
    const assistant = createMessage({
      role: 'assistant', content: [{ type: 'text', text }],
      source: { kind: 'model', provider: 'fixture-616', model: 'fixture-616-v3-model' },
    })
    append('turn/start', { turn })
    append('user/message', user, true)
    append('step/start', { turn, step: 1 })
    append('assistant/message', {
      turn, step: 1, message: assistant,
      stream: [{ type: 'text-chunks', time0: events.length + 1, index: 0, dt: [], texts: [text] }],
    }, true)
    append('step/end', { turn, step: 1 })
    append('turn/end', { turn, reason: { kind: 'completed' } })
    messages.push(user, assistant)
  }
  assert.equal(events.length, 1 + ASSISTANT_COUNT * 6)
  assert.equal(messages.length, 40)
  return { events, messages }
}

function assertDense(events) {
  events.forEach((event, index) => assert.equal(event.seq, index, `gap or duplicate at event ${index}`))
}

function assertHistory(header, inheritedEventCount, result, expectedEvents, expectedMessages) {
  assert.equal(header.version, 4)
  assert.equal(inheritedEventCount, 0)
  assertDense(result.events)
  assert.deepEqual(result.events, expectedEvents, 'all events, coordinates, streams and identities must survive')
  assert.equal(digest(stableJson(result.events)), digest(stableJson(expectedEvents)), 'full event hash mismatch')
  const session = Session.fromRestore(
    SessionId(header.id), result.events, header, inheritedEventCount, result.eventState,
    currentSessionMessageProjections,
  )
  const messages = session.deriveMessages()
  assert.deepEqual(messages, expectedMessages, 'derived user and assistant messages must be complete and ordered')
  assert.equal(digest(stableJson(messages)), digest(stableJson(expectedMessages)), 'full message hash mismatch')
  const assistantMessages = messages.filter(message => message.role === 'assistant')
  const bodies = assistantMessages.map(message => message.content.map(block => {
    assert.equal(block.type, 'text')
    return block.text
  }).join(''))
  assert.equal(assistantMessages.length, expectedMessages.filter(message => message.role === 'assistant').length)
  assert.equal(bodies.slice(0, ASSISTANT_COUNT).reduce((bytes, text) => bytes + Buffer.byteLength(text, 'utf8'), 0), HISTORY_BYTES)
  bodies.slice(0, ASSISTANT_COUNT).forEach((text, index) => {
    assert.equal(digest(text), digest(historyText(index + 1)), `assistant ${index + 1} was truncated or changed`)
  })
  return session
}

test('strict official V3 migration preserves 5MiB history through write, fresh reopen and real duplex snapshots', {
  timeout: 60_000,
}, async context => {
  assert.equal(SESSION_FORMAT_VERSION, 4, 'this regression fixture targets the installed rc.2 v4 reader')
  assert.equal(MAX_FRAME_BYTES, 512 * 1024)
  const temporaryRoot = resolve(tmpdir())
  const root = await mkdtemp(join(temporaryRoot, fixturePrefix))
  let initialContext = new Context()
  let freshContext
  let server
  try {
    await initialContext.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
    const backend = initialContext.sessionPersistence
    const header = {
      version: 3, id: 'fixture-616-large-v3', createdAt: 1,
      cwd: join(root, 'synthetic-workspace'), isSeeded: false, delegationDepth: 0,
    }
    const { events: sourceEvents, messages: sourceMessages } = buildV3History()
    const physicalHeader = releasedV3Codec.encodeHeader(header, SessionLogOffset(0))
    const physicalRows = sourceEvents.map(event => releasedV3Codec.encodeEvent(event))
    const restore = createSessionFormatCatalogWithChildren([]).createRestore(physicalHeader, {
      recovery: 'strict', validation: 'current',
    })
    for (const row of physicalRows) restore.decodeRow(row)
    const expected = restore.finish()
    assert.equal(expected.header.version, 4)
    assert.equal(expected.inheritedEventCount, 0)
    assert.deepEqual(expected.events, sourceEvents, 'this ordinary-text V3 seed must migrate without event loss or rewriting')
    assertDense(expected.events)
    const source = Buffer.concat([
      zstdCompressSync(Buffer.from(`${JSON.stringify(physicalHeader)}\n`, 'utf8')),
      zstdCompressSync(Buffer.from(`${physicalRows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8')),
    ])
    const currentPath = backend.locate(expected.header).path
    const sourcePath = join(dirname(currentPath), 'session.v3.jsonl.zstd')
    assert.equal(basename(currentPath), 'session.v4.jsonl.zstd')
    await mkdir(dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, source, { flag: 'wx' })
    const sourceHash = digest(source)
    const assertUnchangedSource = async () => {
      const stored = await readFile(sourcePath)
      assert.equal(digest(stored), sourceHash, 'the original V3 compressed source must remain byte-identical')
      assert.deepEqual(stored, source)
    }

    const reader = await backend.open(header.id, 'read')
    try {
      assertHistory(reader.header, reader.inheritedEventCount, await reader.read(), expected.events, sourceMessages)
    } finally { await reader.close() }
    await assertUnchangedSource()

    let expectedReopenedEvents
    let expectedReopenedMessages
    const writer = await backend.open(header.id, 'write')
    try {
      const initial = await writer.read()
      const session = assertHistory(writer.header, writer.inheritedEventCount, initial, expected.events, sourceMessages)
      const turn = ASSISTANT_COUNT + 1
      const tailText = 'fixture-616 durable write after V3 migration'
      const user = createUserMessage({
        content: [{ type: 'text', text: 'Synthetic write-resume turn' }], source: { kind: 'user' },
      })
      const assistant = createMessage({
        role: 'assistant', content: [{ type: 'text', text: tailText }],
        source: { kind: 'model', provider: 'fixture-616', model: 'fixture-616-v3-model' },
      })
      session.append('turn/start', { turn })
      session.append('user/message', user, { surfaceOp: 'append' })
      session.append('step/start', { turn, step: 1 })
      session.append('assistant/message', {
        turn, step: 1, message: assistant,
        stream: [{ type: 'text-chunks', time0: Date.now(), index: 0, dt: [], texts: [tailText] }],
      }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step: 1 })
      session.append('turn/end', { turn, reason: { kind: 'completed' } })
      expectedReopenedEvents = session.snapshotEvents()
      expectedReopenedMessages = [...sourceMessages, user, assistant]
      const appended = expectedReopenedEvents.slice(initial.events.length)
      assert.equal(appended.length, 7, 'only the official resume marker and one complete new turn may be appended')
      assert.equal(appended[0].type, 'session/end-seed')
      await writer.append(appended)
      await writer.flush()
      assertHistory(writer.header, writer.inheritedEventCount, await writer.read(), expectedReopenedEvents, expectedReopenedMessages)
    } finally { await writer.close() }
    await assertUnchangedSource()
    assert.ok((await readFile(currentPath)).length > 0, 'write and flush must materialize the current generation')
    await initialContext.fiber.dispose()
    initialContext = undefined

    freshContext = new Context()
    await freshContext.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
    const reopened = await freshContext.sessionPersistence.open(header.id, 'read')
    let snapshot
    try {
      const result = await reopened.read()
      assertHistory(reopened.header, reopened.inheritedEventCount, result, expectedReopenedEvents, expectedReopenedMessages)
      snapshot = {
        type: 'snapshot', header: reopened.header, cursor: result.events.at(-1).seq,
        records: result.events.map(event => ({ type: 'event', event })), hasMore: false,
        projections: { asOfSeq: result.events.at(-1).seq, values: {} },
      }
    } finally { await reopened.close() }
    await assertUnchangedSource()
    const snapshotJson = JSON.stringify(snapshot)
    const snapshotBytes = Buffer.byteLength(snapshotJson, 'utf8')
    const snapshotHash = digest(snapshotJson)
    assert.ok(snapshotBytes > 512 * 1024, `opening snapshot is only ${snapshotBytes} UTF-8 bytes`)
    assert.ok(snapshotBytes > HISTORY_BYTES, 'snapshot must carry the complete persisted 5MiB bodies')
    const identity = createRuntimePipeIdentity({ temporaryDirectory: root })
    const failures = []
    let opens = 0
    server = await createRuntimePipeServer({
      identity, runtimeVersion: '0.2.0-rc.2', profile: 'fixture-616',
      fetch: async () => new Response('not found', { status: 404 }),
      openStream: async function * () { assert.fail('this fixture requires the production duplex path') },
      openDuplex: async function * (endpoint, payload) {
        assert.equal(endpoint, 'session/follow')
        assert.deepEqual(payload, { sessionId: header.id })
        opens += 1
        yield snapshot
      },
      onFailure: failure => failures.push(failure),
    })
    const client = new RuntimePipeClient(identity)
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const duplex = client.openDuplex('session/follow', { sessionId: header.id })
      try {
        const received = []
        for await (const value of duplex) received.push(value)
        assert.equal(received.length, 1, `duplex cycle ${cycle} must deliver exactly one complete snapshot`)
        const receivedSnapshot = received[0]
        const receivedJson = JSON.stringify(receivedSnapshot)
        assert.equal(Buffer.byteLength(receivedJson, 'utf8'), snapshotBytes)
        assert.equal(digest(receivedJson), snapshotHash, `full snapshot UTF-8 hash mismatch in cycle ${cycle}`)
        assert.deepEqual(receivedSnapshot, snapshot)
        assertHistory(receivedSnapshot.header, SessionLogOffset(0), {
          events: receivedSnapshot.records.map(record => {
            assert.equal(record.type, 'event')
            return record.event
          }), eventState: 'detached',
        }, expectedReopenedEvents, expectedReopenedMessages)
      } finally { duplex.cancel() }
    }
    assert.equal(opens, 3)
    assert.deepEqual(failures, [], 'no host or framing failure may be hidden')
    await assertUnchangedSource()
    context.diagnostic(JSON.stringify({
      sourceVersion: 3, targetVersion: 4, assistantHistoryBytes: HISTORY_BYTES,
      openingSnapshotUtf8Bytes: snapshotBytes, snapshotSha256: snapshotHash,
      sourceSha256: sourceHash, originalV3Unchanged: true,
      originalAssistantMessages: ASSISTANT_COUNT, reopenedEvents: expectedReopenedEvents.length,
      duplexOpenCount: opens, modelRequests: 0,
    }))
  } finally {
    try { await server?.close() }
    finally {
      try { await freshContext?.fiber.dispose() }
      finally {
        try { await initialContext?.fiber.dispose() }
        finally {
          assert.equal(dirname(resolve(root)), temporaryRoot)
          assert.ok(basename(root).startsWith(fixturePrefix))
          await rm(root, { recursive: true, force: true })
        }
      }
    }
  }
})
