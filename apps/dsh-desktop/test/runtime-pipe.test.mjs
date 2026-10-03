import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createRuntimePipeIdentity,
  createRuntimePipeServer,
  MAX_POSIX_PIPE_ADDRESS_BYTES,
  RuntimePipeClient,
  RUNTIME_PIPE_PROTOCOL_VERSION,
} from '../src/runtime-pipe.mjs'

test('macOS runtime pipe falls back to a bounded socket path when TMPDIR is long', () => {
  const identity = createRuntimePipeIdentity({
    platform: 'darwin',
    temporaryDirectory: `/var/folders/${'long-segment/'.repeat(12)}T`,
  })

  assert.match(identity.address, /^\/tmp\/dsh-desktop-[0-9a-f]{48}\.sock$/u)
  assert.ok(Buffer.byteLength(identity.address, 'utf8') <= MAX_POSIX_PIPE_ADDRESS_BYTES)

  const short = createRuntimePipeIdentity({ platform: 'darwin', temporaryDirectory: '/private/tmp' })
  assert.match(short.address, /^\/private\/tmp\/dsh-desktop-[0-9a-f]{48}\.sock$/u)
})

test('runtime pipe authenticates, chunks bodies, and preserves response metadata', async (t) => {
  const identity = createRuntimePipeIdentity()
  const server = await createRuntimePipeServer({
    identity,
    runtimeVersion: '0.1.5-rc.2',
    profile: 'desktop',
    fetch: async (request) => new Response(await request.arrayBuffer(), {
      status: 201,
      headers: { 'content-type': 'application/octet-stream', 'x-runtime-test': 'ok' },
    }),
    openStream: async function * () {},
  })
  t.after(() => server.close())

  const client = new RuntimePipeClient(identity)
  const body = new Uint8Array(700_000).map((_, index) => index % 251)
  const response = await client.fetch('http://dsh.internal/api/echo', { method: 'POST', body })

  assert.equal(response.status, 201)
  assert.equal(response.headers.get('x-runtime-test'), 'ok')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), body)
  assert.deepEqual(await client.probe(), {
    type: 'hello',
    protocolVersion: RUNTIME_PIPE_PROTOCOL_VERSION,
    runtimeVersion: '0.1.5-rc.2',
    profile: 'desktop',
    generation: identity.generation,
  })
})

test('runtime pipe transports cancellation-aware logical streams', async (t) => {
  const identity = createRuntimePipeIdentity()
  let hostCancelled = false
  const server = await createRuntimePipeServer({
    identity,
    runtimeVersion: '0.1.5-rc.2',
    profile: 'desktop',
    fetch: async () => new Response('not found', { status: 404 }),
    openStream: async (endpoint, payload, signal) => (async function * () {
      assert.equal(endpoint, 'session/observe')
      assert.deepEqual(payload, { sessionId: 'session-1' })
      try {
        yield { sequence: 1 }
        await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      } finally {
        hostCancelled = signal.aborted
      }
    })(),
  })
  t.after(() => server.close())

  const controller = new AbortController()
  const client = new RuntimePipeClient(identity)
  const stream = client.openStream('session/observe', { sessionId: 'session-1' }, controller.signal)
  assert.deepEqual((await stream.next()).value, { sequence: 1 })
  controller.abort(new Error('test cancellation'))
  await assert.rejects(stream.next(), /test cancellation|cancelled|disconnected/u)
  const deadline = Date.now() + 1_000
  while (!hostCancelled && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(hostCancelled, true)
})

test('runtime pipe rejects the wrong generation before dispatch', async (t) => {
  const identity = createRuntimePipeIdentity()
  let dispatched = false
  const server = await createRuntimePipeServer({
    identity,
    runtimeVersion: '0.1.5-rc.2',
    profile: 'desktop',
    fetch: async () => {
      dispatched = true
      return new Response('unexpected')
    },
    openStream: async function * () {},
  })
  t.after(() => server.close())
  const stale = new RuntimePipeClient({ ...identity, generation: createRuntimePipeIdentity().generation })

  await assert.rejects(stale.fetch('http://dsh.internal/api/test'), /handshake|authentication|closed/u)
  assert.equal(dispatched, false)
})

test('runtime pipe resolves response metadata before a streamed body ends', async (t) => {
  const identity = createRuntimePipeIdentity()
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  const server = await createRuntimePipeServer({
    identity,
    runtimeVersion: '0.1.5-rc.2',
    profile: 'desktop',
    fetch: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from('first'))
        void gate.then(() => {
          controller.enqueue(Buffer.from('second'))
          controller.close()
        })
      },
    })),
    openStream: async function * () {},
  })
  t.after(() => server.close())
  const client = new RuntimePipeClient(identity)
  const response = await client.fetch('http://dsh.internal/stream')
  const reader = response.body.getReader()
  const first = await reader.read()
  assert.equal(Buffer.from(first.value).toString('utf8'), 'first')
  finish()
  const second = await reader.read()
  assert.equal(Buffer.from(second.value).toString('utf8'), 'second')
  assert.equal((await reader.read()).done, true)
})

test('runtime pipe carries bounded bidirectional values and half-close', async (t) => {
  const identity = createRuntimePipeIdentity()
  const server = await createRuntimePipeServer({
    identity,
    runtimeVersion: '0.1.5-rc.2',
    profile: 'desktop',
    fetch: async () => new Response('ok'),
    openStream: async function * () {},
    openDuplex: async function * (endpoint, payload, input) {
      assert.equal(endpoint, 'websocket')
      assert.deepEqual(payload, { path: '/terminal' })
      for await (const value of input) yield `echo:${value}`
    },
  })
  t.after(() => server.close())
  const client = new RuntimePipeClient(identity)
  const duplex = client.openDuplex('websocket', { path: '/terminal' })
  await duplex.write('one')
  await duplex.write('two')
  await duplex.close()
  const values = []
  for await (const value of duplex) values.push(value)
  assert.deepEqual(values, ['echo:one', 'echo:two'])
})

for (const contentBytes of [600 * 1024, 1024 * 1024, 5 * 1024 * 1024]) {
  test(`runtime pipe reopens lossless ${contentBytes}-byte history snapshots`, async (context) => {
    const identity = createRuntimePipeIdentity()
    const snapshot = {
      type: 'snapshot',
      records: [{ type: 'tool/result', content: '中文\\n"'.repeat(Math.ceil(contentBytes / 9)) }],
      hasMore: false,
    }
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) > contentBytes)
    const server = await createRuntimePipeServer({
      identity,
      runtimeVersion: '0.2.0-rc.2',
      profile: 'desktop',
      fetch: async () => new Response('ok'),
      openStream: async function * () { yield snapshot; yield { type: 'append', sequence: 2 } },
      openDuplex: async function * (endpoint, payload, input) {
        if (endpoint === 'echo') {
          for await (const item of input) yield item
        } else {
          assert.equal(endpoint, 'session/follow')
          yield snapshot
          yield { type: 'append', sequence: 2 }
        }
      },
    })
    context.after(() => server.close())
    const client = new RuntimePipeClient(identity)
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const source of [
        client.openStream('session/follow', { sessionId: 'synthetic' }),
        client.openDuplex('session/follow', { sessionId: 'synthetic' }),
      ]) {
        const items = []
        for await (const item of source) items.push(item)
        assert.deepEqual(items, [snapshot, { type: 'append', sequence: 2 }])
      }
    }
    const echo = client.openDuplex('echo', { largePayload: snapshot })
    const reading = (async () => {
      const items = []
      for await (const item of echo) items.push(item)
      return items
    })()
    await Promise.all([echo.write(snapshot), echo.write({ sequence: 3 }), echo.write(snapshot)])
    await echo.close()
    assert.deepEqual(await reading, [snapshot, { sequence: 3 }, snapshot])
  })
}

test('runtime carrier failures retain correlation without exposing host secrets', async context => {
  const identity = createRuntimePipeIdentity()
  const diagnostics = []
  const secret = 'synthetic-key-must-never-appear'
  const server = await createRuntimePipeServer({
    identity, runtimeVersion: '0.2.0-rc.2', profile: 'desktop',
    fetch: async () => new Response('ok'),
    openStream: async function * () {
      const error = new Error(secret)
      error.name = secret
      throw error
    },
    onFailure: diagnostic => diagnostics.push(diagnostic),
  })
  context.after(() => server.close())
  const client = new RuntimePipeClient(identity)
  await assert.rejects(client.openStream('session/follow', { secret }).next(), error => {
    assert.match(error.message, /runtime carrier transport\/host-failure \[[a-f0-9]{24}\]/u)
    assert.equal(error.message.includes(secret), false)
    assert.equal(error.message.includes(diagnostics[0].correlationId), true)
    return true
  })
  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0].endpoint, 'session/follow')
  assert.equal(JSON.stringify(diagnostics).includes(secret), false)
})

test('duplex cancel interrupts an uncompleted large open without waiting for acknowledgement', async context => {
  const identity = createRuntimePipeIdentity()
  const server = await createRuntimePipeServer({
    identity, runtimeVersion: '0.2.0-rc.2', profile: 'desktop',
    fetch: async () => new Response('ok'), openStream: async function * () {},
    openDuplex: async function * () { yield 'unexpected' },
  })
  context.after(() => server.close())
  const source = new RuntimePipeClient(identity).openDuplex('session/follow', { value: 'x'.repeat(5 * 1024 * 1024) })
  source.cancel(new Error('large open cancelled'))
  await assert.rejects(source[Symbol.asyncIterator]().next(), /large open cancelled/u)
})
