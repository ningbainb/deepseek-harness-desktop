import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { zstdCompressSync } from 'node:zlib'
import {
  AssistantStreamAccumulator, BACKUP_SUFFIX, buildCorpus, buildV0Seed, assertHistory,
  assertMigration, Context, createMessage, createUserMessage, createRuntimePipeIdentity,
  createRuntimePipeServer, digest, HISTORY_BYTES, installSessionPersistenceRecovery,
  JsonlSessionPersistence, MAX_FRAME_BYTES, MAX_MESSAGE_BYTES, readSessionLogText,
  restoreStrict, RuntimePipeClient, SessionLogOffset, SESSION_FORMAT_VERSION, TURN_COUNT,
} from './fixtures/v0-history-fixture.mjs'

const dataPrefix = 'fixture-634-data-'

function tailStream(text) {
  const accumulator = new AssistantStreamAccumulator()
  const time = Date.now()
  accumulator.push({ time, chunk: { type: 'text-delta', index: 0, text } })
  accumulator.push({ time: time + 1, chunk: { type: 'finish', reason: { kind: 'stop' } } })
  return accumulator.snapshot()
}

async function runMode(root, mode, corpus, context) {
  let initialContext = new Context()
  let freshContext
  let recovery
  let server
  try {
    await initialContext.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
    const backend = initialContext.sessionPersistence
    const seed = buildV0Seed(`fixture-634-${mode}`, join(root, 'synthetic-workspace'), corpus, mode)
    const expected = restoreStrict(seed.header, seed.normalizedRows)
    assertMigration(seed, expected)
    if (mode === 'native') assert.deepEqual(seed.rows, seed.normalizedRows)
    else assert.throws(() => restoreStrict(seed.header, seed.rows), /origin/u)

    const headerFrame = zstdCompressSync(Buffer.from(`${JSON.stringify(seed.header)}\n`, 'utf8'))
    const source = Buffer.concat([
      headerFrame,
      zstdCompressSync(Buffer.from(`${seed.rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8')),
    ])
    const currentPath = backend.locate(expected.header).path
    assert.equal(basename(currentPath), 'session.v4.jsonl.zstd')
    const sourcePath = join(dirname(currentPath), 'session.jsonl.zstd')
    const backupPath = sourcePath + BACKUP_SUFFIX
    await mkdir(dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, source, { flag: 'wx' })
    const sourceHash = digest(source)
    if (mode === 'permission-recovery') {
      await assert.rejects(backend.open(seed.header.id, 'read'), /origin/u)
      assert.deepEqual(await readFile(sourcePath), source, 'refused migration must not mutate the original V0 source')
    }
    recovery = installSessionPersistenceRecovery(backend)
    assert.equal(recovery.installed, true)

    const reader = await backend.open(seed.header.id, 'read')
    try {
      assertHistory(reader.header, reader.inheritedEventCount, await reader.read(), expected.events, seed.messages, corpus)
    } finally { await reader.close() }
    assert.equal(recovery.getRecoveredCount(), mode === 'native' ? 0 : 1)
    const activeSource = await readFile(sourcePath)
    const activeHash = digest(activeSource)
    const activeRows = (await readSessionLogText(sourcePath)).trimEnd().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(activeRows, [seed.header, ...seed.normalizedRows], 'normalization may remove only the known permission origin field')
    assert.deepEqual(activeSource.subarray(0, headerFrame.length), headerFrame, 'the original compressed V0 header must remain unchanged')
    const assertSourcePreserved = async () => {
      const active = await readFile(sourcePath)
      assert.equal(digest(active), activeHash, 'the active historical generation may not change after its one normalization')
      assert.deepEqual(active, activeSource)
      if (mode === 'native') {
        assert.equal(activeHash, sourceHash)
        assert.deepEqual(active, source)
        await assert.rejects(readFile(backupPath), error => error.code === 'ENOENT')
      } else {
        const backup = await readFile(backupPath)
        assert.equal(digest(backup), sourceHash)
        assert.deepEqual(backup, source, 'backup must retain every original compressed source byte')
      }
    }
    await assertSourcePreserved()

    let durableEvents
    let durableMessages
    const writer = await backend.open(seed.header.id, 'write')
    try {
      const initial = await writer.read()
      const session = assertHistory(writer.header, writer.inheritedEventCount, initial, expected.events, seed.messages, corpus)
      const turn = TURN_COUNT + 1
      const user = createUserMessage({
        content: [{ type: 'text', text: 'Synthetic V0 write-resume turn' }], source: { kind: 'user' },
      })
      const text = 'fixture-634 durable append after complete V0 migration'
      const assistant = createMessage({
        role: 'assistant', content: [{ type: 'text', text }],
        source: { kind: 'model', provider: 'fixture-634', model: 'fixture-634-v0-model' },
      })
      session.append('turn/start', { turn })
      session.append('user/message', user, { surfaceOp: 'append' })
      session.append('step/start', { turn, step: 1 })
      session.append('assistant/message', { turn, step: 1, message: assistant, stream: tailStream(text) }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step: 1 })
      session.append('turn/end', { turn, reason: { kind: 'completed' } })
      durableEvents = session.snapshotEvents()
      durableMessages = [...seed.messages, user, assistant]
      const appended = durableEvents.slice(initial.events.length)
      assert.equal(appended.length, 7)
      assert.equal(appended[0].type, 'session/end-seed')
      assert.deepEqual(durableEvents.slice(0, expected.events.length), expected.events)
      await writer.append(appended)
      await writer.flush()
      assertHistory(writer.header, writer.inheritedEventCount, await writer.read(), durableEvents, durableMessages, corpus)
    } finally { await writer.close() }
    await assertSourcePreserved()
    assert.ok((await readFile(currentPath)).length > 0)
    recovery.restore()
    recovery = undefined
    await initialContext.fiber.dispose()
    initialContext = undefined

    freshContext = new Context()
    await freshContext.plugin(JsonlSessionPersistence, { root, compression: 'zstd' })
    const reopened = await freshContext.sessionPersistence.open(seed.header.id, 'read')
    let snapshot
    try {
      const result = await reopened.read()
      assertHistory(reopened.header, reopened.inheritedEventCount, result, durableEvents, durableMessages, corpus)
      snapshot = {
        type: 'snapshot', header: reopened.header, cursor: result.events.at(-1).seq,
        records: result.events.map(event => ({ type: 'event', event })), hasMore: false,
        projections: { asOfSeq: result.events.at(-1).seq, values: {} },
      }
    } finally { await reopened.close() }
    await assertSourcePreserved()
    const json = JSON.stringify(snapshot)
    const snapshotBytes = Buffer.byteLength(json, 'utf8')
    const snapshotHash = digest(json)
    assert.ok(snapshotBytes > HISTORY_BYTES)
    assert.ok(snapshotBytes > 512 * 1024)
    assert.ok(snapshotBytes + 1024 < MAX_MESSAGE_BYTES)
    const identity = createRuntimePipeIdentity({ temporaryDirectory: root })
    const failures = []
    let opens = 0
    server = await createRuntimePipeServer({
      identity, runtimeVersion: '0.2.0-rc.2', profile: 'fixture-634',
      fetch: async () => new Response('not found', { status: 404 }),
      openStream: async function * () { assert.fail('the legacy snapshot must use the real duplex path') },
      openDuplex: async function * (endpoint, payload) {
        assert.equal(endpoint, 'session/follow')
        assert.deepEqual(payload, { sessionId: seed.header.id })
        opens += 1
        yield snapshot
      },
      onFailure: failure => failures.push(failure),
    })
    const client = new RuntimePipeClient(identity)
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const duplex = client.openDuplex('session/follow', { sessionId: seed.header.id })
      try {
        const received = []
        for await (const value of duplex) received.push(value)
        assert.equal(received.length, 1)
        const value = received[0]
        assert.equal(Buffer.byteLength(JSON.stringify(value), 'utf8'), snapshotBytes)
        assert.equal(digest(JSON.stringify(value)), snapshotHash)
        assert.deepEqual(value, snapshot)
        assertHistory(value.header, SessionLogOffset(0), {
          eventState: 'detached', events: value.records.map(record => {
            assert.equal(record.type, 'event')
            return record.event
          }),
        }, durableEvents, durableMessages, corpus)
      } finally { duplex.cancel() }
    }
    const cancellation = new AbortController()
    cancellation.abort(new Error('fixture-634-cancelled-before-open'))
    const cancelled = client.openDuplex('session/follow', { sessionId: seed.header.id }, cancellation.signal)
    try {
      await assert.rejects((async () => {
        for await (const _value of cancelled) assert.fail('cancelled open must not expose a late history snapshot')
      })(), /fixture-634-cancelled-before-open/u)
    } finally { cancelled.cancel() }
    assert.equal(opens, 3, 'cancelled open must not dispatch another host operation')
    assert.deepEqual(failures, [])
    await assertSourcePreserved()
    context.diagnostic(JSON.stringify({
      mode, sourceVersion: 0, targetVersion: 4, logicalAssistantAndToolBytes: HISTORY_BYTES,
      pairedToolResults: TURN_COUNT, sourceEvents: seed.rows.length,
      migratedEvents: expected.events.length, reopenedEvents: durableEvents.length,
      openingSnapshotUtf8Bytes: snapshotBytes, snapshotSha256: snapshotHash,
      originalSourceSha256: sourceHash, activeSourceSha256: activeHash,
      originalSourcePreservedAt: mode === 'native' ? 'source' : 'backup',
      duplexOpenCount: opens, cancellationChecked: true, modelOrToolInvocations: 0,
    }))
  } finally {
    recovery?.restore()
    try { await server?.close() }
    finally {
      try { await freshContext?.fiber.dispose() }
      finally { await initialContext?.fiber.dispose() }
    }
  }
}

test('released V0 5MiB assistant and paired tools survive native and backed-up migration, durable reopen and duplex', {
  timeout: 60_000,
}, async context => {
  assert.equal(SESSION_FORMAT_VERSION, 4)
  assert.equal(MAX_FRAME_BYTES, 512 * 1024)
  const corpus = buildCorpus()
  const temporaryRoot = resolve(await realpath(tmpdir()))
  const root = await mkdtemp(join(temporaryRoot, dataPrefix))
  try {
    for (const mode of ['native', 'permission-recovery']) {
      await runMode(join(root, mode), mode, corpus, context)
    }
  } finally {
    const absoluteRoot = resolve(await realpath(root))
    assert.equal(absoluteRoot, resolve(root), 'cleanup must refuse a redirected fixture root')
    assert.equal(dirname(absoluteRoot), temporaryRoot)
    assert.ok(basename(absoluteRoot).startsWith(dataPrefix))
    await rm(absoluteRoot, { recursive: true, force: true })
  }
})
