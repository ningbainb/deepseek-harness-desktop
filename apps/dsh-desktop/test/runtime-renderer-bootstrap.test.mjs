import assert from 'node:assert/strict'
import test from 'node:test'

import { installDesktopTransportBridge, transportBootstrapScript } from '../src/runtime-renderer-bootstrap.mjs'

function serverFrame(opcode, payload) {
  const body = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload
  assert.ok(body.length < 126)
  return Uint8Array.of(0x80 | opcode, body.length, ...body)
}

function decodeClientFrame(encoded) {
  const bytes = Buffer.from(encoded, 'base64')
  assert.equal((bytes[1] & 0x80) !== 0, true)
  const length = bytes[1] & 0x7f
  assert.ok(length < 126)
  const mask = bytes.subarray(2, 6)
  const payload = bytes.subarray(6, 6 + length)
  for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
  return { opcode: bytes[0] & 0x0f, payload }
}

function testTarget() {
  const frames = []
  const writes = []
  const cancelled = []
  const ended = []
  class NativeWebSocket {
    constructor(url) { this.nativeUrl = url }
  }
  const target = {
    AbortController,
    ArrayBuffer,
    Blob,
    DOMException,
    Event,
    EventTarget,
    NativeWebSocket,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    URL,
    WebSocket: NativeWebSocket,
    atob,
    btoa,
    crypto,
    fetch,
    location: new URL('dsh-runtime://app/'),
    dshDesktop: {
      openRuntimeStream: async () => 'stream-1',
      writeRuntimeStream: async (_id, value) => { writes.push(value); return true },
      endRuntimeStream: async id => { ended.push(id); return true },
      cancelRuntimeStream: id => { cancelled.push(id); return true },
      onRuntimeStream: callback => { frames.push(callback); return () => {} },
    },
  }
  return { target, emit: frame => frames[0](frame), writes, cancelled, ended, NativeWebSocket }
}

test('account callback origin is available to official login without moving RPC off the pipe', async () => {
  const fixture = testTarget()
  const fetched = []
  fixture.target.fetch = async input => { fetched.push(String(input)); return new Response('ok') }
  installDesktopTransportBridge(fixture.target, { accountCallbackOrigin: 'http://127.0.0.1:43123' })
  assert.equal(fixture.target.__DSH_TRANSPORT__.streamBaseUrl, 'http://127.0.0.1:43123')
  await fixture.target.__DSH_TRANSPORT__.fetch('http://127.0.0.1:43123/api/account/getState')
  await fixture.target.__DSH_TRANSPORT__.fetch('http://127.0.0.1:43124/api/other')
  assert.deepEqual(fetched, ['dsh-runtime://app/api/account/getState', 'http://127.0.0.1:43124/api/other'])
  assert.equal(typeof fixture.target.__DSH_TRANSPORT__.openStream, 'function')
  assert.match(transportBootstrapScript({ accountCallbackOrigin: 'http://127.0.0.1:43123' }), /43123/u)
})

test('account callback origin rejects foreign hosts, credentials, paths and invalid ports', () => {
  for (const origin of ['http://evil.test:43123', 'https://127.0.0.1:43123', 'http://user@127.0.0.1:43123',
    'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://127.0.0.1:43123/api']) {
    assert.throws(() => installDesktopTransportBridge(testTarget().target, { accountCallbackOrigin: origin }), undefined, origin)
  }
})

test('bootstrap source is self-contained and installs the owned transport', () => {
  const source = transportBootstrapScript()
  assert.match(source, /^\(function installDesktopTransportBridge/u)
  assert.match(source, /openRuntimeStream/u)
})

function pluginRequest(method, args, overrides = {}) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'fixture-rpc', method, payload: { args } }),
    ...overrides,
  }
}

test('official plugin mutations go through main IPC and retain the SDK response envelope', async () => {
  const { target } = testTarget()
  const calls = []
  const value = { changed: true, application: 'applied', stage: 'enable', target: 'fixture' }
  target.dshDesktop.mutateNativePlugin = async (request) => { calls.push(request); return { ok: true, value } }
  target.fetch = async () => assert.fail('a plugin mutation must not reach the worker')
  installDesktopTransportBridge(target)

  const commands = [
    ['pluginManager/installBundle', { spec: 'dsh-context@0.85.1', options: { expected: { name: 'dsh-context', version: '0.85.1' } } }],
    ['pluginManager/updateBundle', { name: 'dsh-context', version: '0.86.0' }],
    ['pluginManager/removeBundle', { name: 'dsh-context' }],
    ['pluginManager/setBundleEnabled', { name: 'dsh-context', enabled: false }],
  ]
  for (const [method, args] of commands) {
    const request = new Request(`dsh-runtime://app/api/${method}`, pluginRequest(method, args))
    const response = await target.__DSH_TRANSPORT__.fetch(request)
    assert.deepEqual(await response.json(), { type: 'server-response', rpcId: 'fixture-rpc', method, result: { ok: true, value } })
  }
  assert.deepEqual(calls, commands.map(([method, args]) => ({ method, args })))
})

test('malformed and unsupported local plugin calls fail closed, while reads and remote requests stay on fetch', async () => {
  const { target } = testTarget()
  const forwarded = []
  let ipcCalls = 0
  target.fetch = async (input) => { forwarded.push(String(input)); return new Response('ok') }
  target.dshDesktop.mutateNativePlugin = () => { ipcCalls += 1 }
  installDesktopTransportBridge(target)

  const transport = target.__DSH_TRANSPORT__
  const method = 'pluginManager/installBundle'
  const path = `api/${method}`
  assert.equal((await transport.fetch(path, pluginRequest(method, {}, { body: '{' }))).status, 400)
  assert.equal((await transport.fetch(path, pluginRequest('pluginManager/removeBundle', { name: 'fixture' }))).status, 400)
  assert.equal((await transport.fetch(`${path}?bypass=1`, pluginRequest(method, { spec: 'fixture' }))).status, 400)
  assert.equal((await transport.fetch(path, pluginRequest(method, []))).status, 400)
  const unsupported = 'pluginManager/unsupportedPackageMutation'
  const response = await transport.fetch(`api/${unsupported}`, pluginRequest(unsupported, {}))
  assert.equal((await response.json()).result.ok, false)
  assert.equal(ipcCalls, 0)

  const read = 'pluginManager/listBundles'
  await transport.fetch(`api/${read}`, pluginRequest(read, {}))
  const row = 'pluginManager/setPluginEnabled'
  await transport.fetch(`api/${row}`, pluginRequest(row, { id: 'fixture-row', enabled: false }))
  await transport.fetch(`https://outside.test/api/${method}`, pluginRequest(method, { spec: 'fixture' }))
  assert.deepEqual(forwarded, [`dsh-runtime://app/api/${read}`, `dsh-runtime://app/api/${row}`, `https://outside.test/api/${method}`])
})

test('aborting a plugin request prevents dispatch when possible and stops waiting after dispatch', async () => {
  const { target } = testTarget()
  let called = 0
  let dispatch
  const started = new Promise(resolve => { dispatch = resolve })
  let settle
  target.dshDesktop.mutateNativePlugin = () => {
    called += 1
    dispatch()
    return new Promise(resolve => { settle = resolve })
  }
  target.fetch = async () => assert.fail('aborted mutations must not fall back to the worker')
  installDesktopTransportBridge(target)
  const method = 'pluginManager/removeBundle'
  const path = `api/${method}`
  const early = new AbortController()
  early.abort(new Error('aborted before send'))
  await assert.rejects(target.__DSH_TRANSPORT__.fetch(path, pluginRequest(method, { name: 'fixture' }, { signal: early.signal })), /aborted before send/u)
  assert.equal(called, 0)

  const late = new AbortController()
  const reply = target.__DSH_TRANSPORT__.fetch(path, pluginRequest(method, { name: 'fixture' }, { signal: late.signal }))
  await started
  late.abort(new Error('aborted after send'))
  await assert.rejects(reply, /aborted after send/u)
  assert.equal(called, 1)
  settle({ ok: true, value: {} })
})

test('owned WebSocket crosses the duplex bridge with RFC 6455 framing', async () => {
  const fixture = testTarget()
  installDesktopTransportBridge(fixture.target)
  const socket = new fixture.target.WebSocket('ws://app/ssh/terminal?alias=local')
  const events = []
  socket.onopen = () => events.push('open')
  socket.onmessage = event => events.push(`message:${event.data}`)
  socket.onclose = event => events.push(`close:${event.code}:${event.reason}`)
  await new Promise(resolve => setImmediate(resolve))

  const handshake = Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
  const greeting = serverFrame(1, 'ready')
  fixture.emit({ id: 'stream-1', type: 'item', value: Buffer.concat([handshake, greeting]).toString('base64') })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(socket.readyState, fixture.target.WebSocket.OPEN)
  assert.deepEqual(events, ['open', 'message:ready'])

  socket.send('input')
  await new Promise(resolve => setImmediate(resolve))
  const sent = decodeClientFrame(fixture.writes[0])
  assert.equal(sent.opcode, 1)
  assert.equal(sent.payload.toString(), 'input')

  const closePayload = Buffer.alloc(5)
  closePayload.writeUInt16BE(1000)
  closePayload.write('bye', 2)
  fixture.emit({ id: 'stream-1', type: 'item', value: Buffer.from(serverFrame(8, closePayload)).toString('base64') })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(socket.readyState, fixture.target.WebSocket.CLOSED)
  assert.deepEqual(events, ['open', 'message:ready', 'close:1000:bye'])
})

test('worker stream preserves frames delivered before the open acknowledgement', async () => {
  const fixture = testTarget()
  installDesktopTransportBridge(fixture.target)
  const stream = fixture.target.__DSH_TRANSPORT__.openStream('events.mux', {})
  fixture.emit({ id: 'stream-1', type: 'item', value: 'first-frame' })
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), { done: false, value: 'first-frame' })
  fixture.emit({ id: 'stream-1', type: 'end' })
  assert.deepEqual(await iterator.next(), { done: true, value: undefined })
})

test('external WebSocket URLs retain the native implementation', () => {
  const fixture = testTarget()
  installDesktopTransportBridge(fixture.target)
  const socket = new fixture.target.WebSocket('wss://example.com/socket')
  assert.equal(socket instanceof fixture.NativeWebSocket, true)
  assert.equal(socket.nativeUrl, 'wss://example.com/socket')
})

test('intentional carrier quiesce delays terminal delivery until recovery without dropping preceding data', async () => {
  const fixture = testTarget()
  installDesktopTransportBridge(fixture.target)
  const controller = new AbortController()
  const stream = fixture.target.__DSH_TRANSPORT__.openStream('events.mux', {}, controller.signal)
  const iterator = stream[Symbol.asyncIterator]()
  try {
    fixture.emit({ type: 'lifecycle', phase: 'quiescing' })
    fixture.emit({ id: 'stream-1', type: 'item', value: 'last-persisted-update' })
    fixture.emit({ id: 'stream-1', type: 'end' })
    assert.deepEqual(await iterator.next(), { done: false, value: 'last-persisted-update' })
    let settled = false
    const terminal = iterator.next().then(value => { settled = true; return value })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false, 'an expected shutdown EOF must not trigger an automatic reconnect')
    fixture.emit({ type: 'lifecycle', phase: 'resumed' })
    assert.deepEqual(await terminal, { done: true, value: undefined })
    assert.deepEqual(fixture.cancelled, ['stream-1'])
  } finally {
    controller.abort(new Error('fixture completed'))
  }
})

test('caller cancellation still interrupts a quiesced stream and unexpected errors remain errors', async () => {
  const fixture = testTarget()
  installDesktopTransportBridge(fixture.target)
  const controller = new AbortController()
  const stream = fixture.target.__DSH_TRANSPORT__.openStream('events.mux', {}, controller.signal)
  const reading = Array.fromAsync(stream)
  fixture.emit({ type: 'lifecycle', phase: 'quiescing' })
  controller.abort(new Error('caller cancelled'))
  await assert.rejects(reading, /caller cancelled/u)
  fixture.emit({ type: 'lifecycle', phase: 'resumed' })
  const next = fixture.target.__DSH_TRANSPORT__.openStream('events.mux', {})
  fixture.emit({ id: 'stream-1', type: 'error', message: 'unexpected transport failure' })
  await assert.rejects(Array.fromAsync(next), /unexpected transport failure/u)
})

test('typed stream uplink sends every item followed by EOF without closing the downlink', async () => {
  const fixture = testTarget()
  installDesktopTransportBridge(fixture.target)
  async function *uplink() { yield { index: 1 }; yield { index: 2 } }
  const stream = fixture.target.__DSH_TRANSPORT__.openStream('test/stream', { args: {} }, undefined, uplink())
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(fixture.writes, [{ index: 1 }, { index: 2 }])
  assert.deepEqual(fixture.ended, ['stream-1'])
  assert.deepEqual(fixture.cancelled, [])
  fixture.emit({ id: 'stream-1', type: 'item', value: 'reply' })
  fixture.emit({ id: 'stream-1', type: 'end' })
  assert.deepEqual(await Array.fromAsync(stream), ['reply'])
})

test('typed stream input failure reaches the reader and cancels the carrier', async () => {
  const fixture = testTarget()
  installDesktopTransportBridge(fixture.target)
  async function *uplink() { throw new Error('uplink failure') }
  const stream = fixture.target.__DSH_TRANSPORT__.openStream('test/stream', { args: {} }, undefined, uplink())
  await assert.rejects(Array.fromAsync(stream), /uplink failure/u)
  assert.deepEqual(fixture.cancelled, ['stream-1'])
})
