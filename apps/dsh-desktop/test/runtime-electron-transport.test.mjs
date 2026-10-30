import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  DESKTOP_RUNTIME_SCHEME,
  installDesktopRuntimeProtocol,
  registerDesktopRuntimeScheme,
  registerDesktopRuntimeStreamIpc,
  RUNTIME_STREAM_FRAME_CHANNEL,
  RUNTIME_STREAM_WRITE_CHANNEL,
} from '../src/runtime-electron-transport.mjs'

test('runtime scheme is registered as a secure standard Fetch carrier', () => {
  let registrations
  registerDesktopRuntimeScheme({ registerSchemesAsPrivileged: (value) => { registrations = value } })
  assert.deepEqual(registrations, [{
    scheme: DESKTOP_RUNTIME_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      allowServiceWorkers: false,
    },
  }])
})

test('runtime protocol forwards only the owned authority to the active provider', async () => {
  let handler
  const calls = []
  const provider = {
    status: { state: 'ready' },
    fetch: async (request) => {
      calls.push({ url: request.url, method: request.method, body: await request.text() })
      return Response.json({ ok: true })
    },
  }
  await installDesktopRuntimeProtocol({
    protocol: { handle: async (_scheme, value) => { handler = value } },
    getProvider: () => provider,
    beforeFetch: async request => calls.push({ gated: request.url }),
  })
  const accepted = await handler(new Request('dsh-runtime://app/api/test?value=1', { method: 'POST', body: 'body' }))
  const rejected = await handler(new Request('dsh-runtime://other/api/test'))
  provider.status = { state: 'stopped' }
  const stopped = await handler(new Request('dsh-runtime://app/api/test'))

  assert.deepEqual(await accepted.json(), { ok: true })
  assert.equal(rejected.status, 404)
  assert.equal(stopped.status, 503)
  assert.deepEqual(calls, [
    { gated: 'http://dsh.internal/api/test?value=1' },
    { url: 'http://dsh.internal/api/test?value=1', method: 'POST', body: 'body' },
  ])
})

test('runtime protocol permits a test gate to return a deterministic response', async () => {
  let handler
  let providerCalls = 0
  await installDesktopRuntimeProtocol({
    protocol: { handle: async (_scheme, value) => { handler = value } },
    getProvider: () => ({ status: { state: 'ready' }, fetch: async () => { providerCalls += 1; return new Response('unexpected') } }),
    beforeFetch: async request => new Response(new URL(request.url).pathname, { status: 409 }),
  })
  const response = await handler(new Request('dsh-runtime://app/api/test'))
  assert.equal(response.status, 409)
  assert.equal(await response.text(), '/api/test')
  assert.equal(providerCalls, 0)
})

test('runtime protocol ends an active response cleanly while quiescing', async () => {
  let handler
  let fail
  const body = new ReadableStream({ start(controller) { fail = error => controller.error(error) } })
  const lifecycle = await installDesktopRuntimeProtocol({
    protocol: { handle: async (_scheme, value) => { handler = value } },
    getProvider: () => ({ status: { state: 'ready' }, fetch: async () => new Response(body) }),
  })
  const response = await handler(new Request('dsh-runtime://app/events'))
  const read = response.body.getReader().read()
  lifecycle.quiesce()
  fail(new Error('expected Runtime stop'))
  assert.deepEqual(await read, { done: true, value: undefined })
  lifecycle.resume()
})

test('intentional Runtime stop does not report an unavailable carrier to late HTTP requests', async () => {
  let handler
  let calls = 0
  const provider = { status: { state: 'stopped' }, fetch: async () => { calls++; return new Response('ready') } }
  const lifecycle = await installDesktopRuntimeProtocol({
    protocol: { handle: async (_scheme, value) => { handler = value } },
    getProvider: () => provider,
  })
  lifecycle.quiesce()
  assert.equal((await handler(new Request('dsh-runtime://app/api/state'))).status, 204)
  assert.equal((await handler(new Request('dsh-runtime://foreign/api/state'))).status, 404)
  assert.equal(calls, 0)
  lifecycle.resume()
  assert.equal((await handler(new Request('dsh-runtime://app/api/state'))).status, 503)
  provider.status.state = 'ready'
  assert.equal(await (await handler(new Request('dsh-runtime://app/api/state'))).text(), 'ready')
  assert.equal(calls, 1)
})

test('runtime stream IPC forwards frames and cancels only the opening renderer', async () => {
  const handlers = new Map()
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  }
  const sender = new EventEmitter()
  sender.frames = []
  sender.send = (channel, frame) => sender.frames.push({ channel, frame })
  sender.isDestroyed = () => false
  let observedSignal
  const writes = []
  let inputEnded = false
  const provider = {
    status: { state: 'ready' },
    openDuplex: (_endpoint, _payload, signal) => {
      observedSignal = signal
      return {
        write: async value => { writes.push(value) },
        close: async () => { inputEnded = true },
        async *[Symbol.asyncIterator]() {
          yield { sequence: 1 }
          await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
        },
      }
    },
  }
  const scheduled = []
  const dispose = registerDesktopRuntimeStreamIpc({
    ipcMain,
    getProvider: () => provider,
    schedule: (operation) => scheduled.push(operation),
  })
  const id = handlers.get('desktop:runtime-stream-open')({ sender }, {
    endpoint: 'session/observe',
    payload: { sessionId: 'session-1' },
  })
  scheduled.shift()()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(sender.frames, [{
    channel: RUNTIME_STREAM_FRAME_CHANNEL,
    frame: { id, type: 'item', value: { sequence: 1 } },
  }])
  assert.equal(await handlers.get(RUNTIME_STREAM_WRITE_CHANNEL)({ sender }, id, { input: 'value' }), true)
  assert.deepEqual(writes, [{ input: 'value' }])
  assert.equal(await handlers.get(RUNTIME_STREAM_WRITE_CHANNEL)({ sender: {} }, id, 'ignored'), false)
  assert.equal(await handlers.get('desktop:runtime-stream-end')({ sender: {} }, id), false)
  assert.equal(inputEnded, false)
  assert.equal(await handlers.get('desktop:runtime-stream-end')({ sender }, id), true)
  assert.equal(inputEnded, true)
  assert.equal(observedSignal.aborted, false)
  assert.equal(handlers.get('desktop:runtime-stream-cancel')({ sender: {} }, id), false)
  assert.equal(handlers.get('desktop:runtime-stream-cancel')({ sender }, id), true)
  assert.equal(observedSignal.aborted, true)
  dispose()
  assert.equal(handlers.size, 0)
})

test('runtime stream IPC quiesce sends EOF before cancellation', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) }
  const sender = new EventEmitter()
  sender.frames = []
  sender.send = (channel, frame) => sender.frames.push({ channel, frame })
  sender.isDestroyed = () => false
  const provider = {
    status: { state: 'ready' },
    openDuplex: (_endpoint, _payload, signal) => ({
      async *[Symbol.asyncIterator]() { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) },
    }),
  }
  const scheduled = []
  const dispose = registerDesktopRuntimeStreamIpc({ ipcMain, getProvider: () => provider, schedule: operation => scheduled.push(operation) })
  const id = handlers.get('desktop:runtime-stream-open')({ sender }, { endpoint: 'session/observe', payload: {} })
  scheduled.shift()()
  await new Promise(resolve => setImmediate(resolve))
  await dispose.quiesce()
  assert.deepEqual(sender.frames, [
    { channel: RUNTIME_STREAM_FRAME_CHANNEL, frame: { type: 'lifecycle', phase: 'quiescing' } },
    { channel: RUNTIME_STREAM_FRAME_CHANNEL, frame: { id, type: 'end' } },
  ])
  const lateId = handlers.get('desktop:runtime-stream-open')({ sender }, { endpoint: 'session/observe', payload: {} })
  scheduled.shift()()
  assert.deepEqual(sender.frames.at(-1), { channel: RUNTIME_STREAM_FRAME_CHANNEL, frame: { id: lateId, type: 'end' } })
  dispose.resume()
  assert.deepEqual(sender.frames.at(-1), { channel: RUNTIME_STREAM_FRAME_CHANNEL, frame: { type: 'lifecycle', phase: 'resumed' } })
  assert.equal(sender.frames.filter(({ frame }) => frame.type === 'lifecycle').length, 2)
  dispose()
})

for (const operation of ['write', 'end']) {
  test(`runtime stream ${operation} resolves false when quiesce cancels a pending operation`, async () => {
    const handlers = new Map()
    const sender = new EventEmitter()
    sender.send = () => {}
    sender.isDestroyed = () => false
    let entered
    const started = new Promise(resolve => { entered = resolve })
    const provider = {
      status: { state: 'ready' },
      openDuplex: (_endpoint, _payload, signal) => {
        const pending = () => new Promise((_resolve, reject) => {
          entered()
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
        return {
          write: pending, close: pending,
          async *[Symbol.asyncIterator]() { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) },
        }
      },
    }
    const scheduled = []
    const dispose = registerDesktopRuntimeStreamIpc({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) },
      getProvider: () => provider, schedule: action => scheduled.push(action),
    })
    const id = handlers.get('desktop:runtime-stream-open')({ sender }, { endpoint: 'session/observe', payload: {} })
    scheduled.shift()()
    const result = handlers.get(`desktop:runtime-stream-${operation}`)({ sender }, id, {})
    // Attach before cancellation so the test also detects unhandled rejections.
    const completed = result.then(value => ({ value }), error => ({ error }))
    await started
    await dispose.quiesce()
    assert.deepEqual(await completed, { value: false })
    dispose()
  })

  test(`runtime stream ${operation} preserves genuine provider failures`, async () => {
    const handlers = new Map()
    const sender = new EventEmitter()
    sender.send = () => {}
    sender.isDestroyed = () => false
    const failure = new Error('provider failed before cancellation')
    const scheduled = []
    const dispose = registerDesktopRuntimeStreamIpc({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) },
      getProvider: () => ({ status: { state: 'ready' }, openDuplex: (_endpoint, _payload, signal) => ({
        write: async () => { throw failure }, close: async () => { throw failure },
        async *[Symbol.asyncIterator]() { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) },
      }) }), schedule: action => scheduled.push(action),
    })
    const id = handlers.get('desktop:runtime-stream-open')({ sender }, { endpoint: 'session/observe', payload: {} })
    scheduled.shift()()
    await assert.rejects(handlers.get(`desktop:runtime-stream-${operation}`)({ sender }, id, {}), error => error === failure)
    dispose()
  })
}

test('final application shutdown retains inert handlers for already queued ACK and cancel', async () => {
  const handlers = new Map()
  const dispose = registerDesktopRuntimeStreamIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) },
    getProvider: () => { throw new Error('final shutdown must not query Runtime') },
  })
  await dispose.shutdown()
  assert.equal(handlers.get('desktop:runtime-stream-ack')({ sender: {} }, 'late', 1), false)
  assert.equal(handlers.get('desktop:runtime-stream-cancel')({ sender: {} }, 'late'), false)
  assert.equal(await handlers.get('desktop:runtime-stream-write')({ sender: {} }, 'late', {}), false)
  assert.equal(await handlers.get('desktop:runtime-stream-end')({ sender: {} }, 'late'), false)
  dispose()
  assert.equal(handlers.size, 0, 'reusable instances still support explicit unregistration')
})

test('quiesce waits for a registered writer to finish native cleanup before reporting completion', async () => {
  const handlers = new Map()
  const sender = new EventEmitter()
  sender.send = () => {}
  sender.isDestroyed = () => false
  let release
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const cleanup = new Promise(resolve => { release = resolve })
  const scheduled = []
  const dispose = registerDesktopRuntimeStreamIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) },
    getProvider: () => ({ status: { state: 'ready' }, openDuplex: (_endpoint, _payload, signal) => ({
      write: async () => { entered(); await cleanup },
      async *[Symbol.asyncIterator]() { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) },
    }) }), schedule: action => scheduled.push(action),
  })
  const id = handlers.get('desktop:runtime-stream-open')({ sender }, { endpoint: 'session/observe', payload: {} })
  scheduled.shift()()
  const pending = handlers.get('desktop:runtime-stream-write')({ sender }, id, {})
  await started
  let settled = false
  const stopped = dispose.quiesce().then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false, 'one event-loop turn is not a drain barrier')
  release()
  assert.equal(await pending, false)
  await stopped
  assert.equal(settled, true)
  dispose()
})
