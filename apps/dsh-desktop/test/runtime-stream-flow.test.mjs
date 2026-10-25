import assert from 'node:assert/strict'
import { EventEmitter, getEventListeners } from 'node:events'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

import { registerDesktopRuntimeStreamIpc } from '../src/runtime-electron-transport.mjs'
import { installDesktopTransportBridge, transportBootstrapScript } from '../src/runtime-renderer-bootstrap.mjs'

const OPEN = 'desktop:runtime-stream-open'
const ACK = 'desktop:runtime-stream-ack'
const CANCEL = 'desktop:runtime-stream-cancel'
const FRAME = 'desktop:runtime-stream-frame'
const tick = () => new Promise(resolve => setImmediate(resolve))

async function fixture(context, { preload = 'preload-main.cjs', count = 5000, value = index => index, schedule, holdOpen = false, stall = false } = {}) {
  const handlers = new Map()
  const ipcRenderer = new EventEmitter()
  const calls = []
  const frames = []
  const sources = []
  const replies = []
  const sender = new EventEmitter()
  sender.isDestroyed = () => false
  sender.send = (channel, frame) => { frames.push(frame); ipcRenderer.emit(channel, {}, frame) }
  const ownerFrame = {}
  const event = { sender, senderFrame: ownerFrame }
  ipcRenderer.invoke = async (channel, ...args) => {
    calls.push({ channel, args })
    const handler = handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    const result = await handler(event, ...args)
    if (channel === OPEN && holdOpen) await new Promise(resolve => replies.push(resolve))
    return result
  }
  const dispose = registerDesktopRuntimeStreamIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) },
    getProvider: () => ({
      status: { state: 'ready' },
      openDuplex: (_endpoint, _payload, signal) => {
        const source = {
          pulls: 0, returned: 0, cancelled: 0, signal,
          [Symbol.asyncIterator]() { return this },
          next() {
            if (stall) return new Promise(() => {})
            const index = this.pulls++
            return Promise.resolve(index < count ? { done: false, value: value(index) } : { done: true })
          },
          return() { this.returned++; return Promise.resolve({ done: true }) },
          cancel() { this.cancelled++ },
          close: async () => {},
          write: async () => {},
        }
        sources.push(source)
        return source
      },
    }),
    ...(schedule ? { schedule } : {}),
  })
  context.after(dispose)
  const exposed = {}
  runInNewContext(await readFile(new URL(`../src/${preload}`, import.meta.url), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return { ipcRenderer, contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api } }, webUtils: {} } },
    process: { platform: process.platform },
  })
  const bridge = exposed.dshDesktop ?? exposed.dshDesktopTransport
  const target = { AbortController, Request, location: new URL('dsh-runtime://app/'), dshDesktopTransport: bridge }
  return { target, bridge, sender, event, handlers, calls, frames, sources, dispose, replies, ipcRenderer }
}

test('negotiated stream stops at 64 unread frames and resumes all 5000 items in order with batched ACKs', async context => {
  const setup = await fixture(context)
  installDesktopTransportBridge(setup.target)
  const stream = setup.target.__DSH_TRANSPORT__.openStream('events.mux', {})
  await tick()
  assert.equal(setup.sources[0].pulls, 64)
  assert.equal(setup.frames.length, 64)
  await tick()
  assert.equal(setup.sources[0].pulls, 64, 'no source.next while the consumer is stopped')
  assert.equal(setup.calls.filter(call => call.channel === ACK).length, 0)
  assert.deepEqual(await Array.fromAsync(stream), Array.from({ length: 5000 }, (_unused, index) => index))
  const acknowledgements = setup.calls.filter(call => call.channel === ACK)
  assert.ok(acknowledgements.length > 0 && acknowledgements.length < 500, `ACK count: ${acknowledgements.length}`)
  assert.deepEqual(setup.frames.filter(frame => frame.type === 'item').map(frame => frame.sequence), Array.from({ length: 5000 }, (_unused, index) => index + 1))
})

test('byte window pauses small frame counts and admits a single large history without truncation', async context => {
  const history = { history: '历'.repeat(2 * 1024 * 1024) }
  const setup = await fixture(context, { count: 5, value: index => index === 2 ? history : 'x'.repeat(600 * 1024) })
  const id = await setup.bridge.openRuntimeStream('test/history', {})
  await tick()
  assert.equal(setup.frames.length, 1)
  assert.ok(setup.sources[0].pulls <= 2, 'at most one sized lookahead outside the byte window')
  assert.equal(await setup.bridge.acknowledgeRuntimeStream(id, 1), true)
  await tick()
  assert.equal(setup.frames.length, 2)
  assert.equal(await setup.bridge.acknowledgeRuntimeStream(id, 2), true)
  await tick()
  assert.equal(setup.frames.length, 3)
  assert.deepEqual(setup.frames[2].value, history)
  assert.equal(setup.sources[0].pulls, 3, 'oversized logical frame must occupy the window alone')
  for (let sequence = 3; sequence <= 5; sequence++) {
    assert.equal(await setup.bridge.acknowledgeRuntimeStream(id, sequence), true)
    await tick()
  }
  assert.equal(setup.frames.at(-1).type, 'end')
  assert.equal(setup.frames.filter(frame => frame.type === 'item').length, 5)
})

test('cumulative ACK rejects foreign renderer, foreign frame, invalid ranges and stale sequences', async context => {
  const setup = await fixture(context)
  const id = await setup.bridge.openRuntimeStream('test/stream', {})
  await tick()
  const acknowledge = setup.handlers.get(ACK)
  assert.equal(typeof acknowledge, 'function')
  assert.equal(acknowledge({ sender: {} }, id, 64), false)
  assert.equal(acknowledge({ sender: setup.sender, senderFrame: {} }, id, 64), false)
  for (const sequence of [0, -1, 65, 1.5, NaN, Infinity, '64', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(acknowledge(setup.event, id, sequence), false)
  }
  await tick()
  assert.equal(setup.sources[0].pulls, 64)
  assert.equal(acknowledge(setup.event, id, 32), true)
  assert.equal(acknowledge(setup.event, id, 32), false)
  assert.equal(acknowledge(setup.event, id, 31), false)
  await tick()
  assert.equal(setup.sources[0].pulls, 96)
  assert.equal(acknowledge(setup.event, 'unknown', 1), false)
})

for (const preload of ['preload-main.cjs', 'preload-dock-settings.cjs']) {
  test(`${preload} negotiates flow and preserves more than 256 early frames across streams without ACKing delivery`, async context => {
    const setup = await fixture(context, { preload })
    const ids = await Promise.all(Array.from({ length: 6 }, () => setup.bridge.openRuntimeStream('test/stream', {})))
    await tick()
    assert.ok(setup.calls.filter(call => call.channel === OPEN).every(call => call.args[0].flowControl === true))
    assert.equal(typeof setup.bridge.acknowledgeRuntimeStream, 'function')
    const received = []
    const unsubscribe = setup.bridge.onRuntimeStream(frame => received.push(frame))
    assert.equal(received.length, 6 * 64)
    assert.equal(setup.calls.filter(call => call.channel === ACK).length, 0)
    for (const id of ids) assert.equal(received.filter(frame => frame.id === id).length, 64)
    unsubscribe()
  })
  test(`${preload} discards cancelled early frames without affecting another stream`, async context => {
    const setup = await fixture(context, { preload })
    const cancelledId = await setup.bridge.openRuntimeStream('test/stream', {})
    const retainedId = await setup.bridge.openRuntimeStream('test/stream', {})
    await tick()
    await setup.bridge.cancelRuntimeStream(cancelledId)
    const received = []
    setup.bridge.onRuntimeStream(frame => received.push(frame))
    assert.equal(received.filter(frame => frame.id === cancelledId).length, 0)
    assert.equal(received.filter(frame => frame.id === retainedId).length, 64)
  })
}

test('renderer preserves the full early window before the stream-open reply and ACKs only after consumption', async context => {
  const setup = await fixture(context, { count: 130, holdOpen: true })
  installDesktopTransportBridge(setup.target)
  const stream = setup.target.__DSH_TRANSPORT__.openStream('test/stream', {})
  await tick()
  assert.equal(setup.frames.length, 64)
  assert.equal(setup.calls.filter(call => call.channel === ACK).length, 0)
  setup.replies.shift()()
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), { done: false, value: 0 })
  await tick()
  assert.equal(setup.calls.filter(call => call.channel === ACK).length, 0, 'yielding is not yet confirmation of consumption')
  const remaining = []
  for (;;) {
    const result = await iterator.next()
    if (result.done) break
    remaining.push(result.value)
  }
  assert.deepEqual(remaining, Array.from({ length: 129 }, (_unused, index) => index + 1))
})

for (const lifecycle of ['cancel', 'destroyed', 'render-process-gone', 'did-start-navigation', 'quiesce', 'dispose']) {
  test(`window wait is released and sender listeners are removed on ${lifecycle}`, async context => {
    const setup = await fixture(context)
    const id = await setup.bridge.openRuntimeStream('test/stream', {})
    await tick()
    assert.equal(setup.sources[0].pulls, 64)
    if (lifecycle === 'cancel') assert.equal(await setup.bridge.cancelRuntimeStream(id), true)
    else if (lifecycle === 'quiesce') await setup.dispose.quiesce()
    else if (lifecycle === 'dispose') setup.dispose()
    else if (lifecycle === 'did-start-navigation') setup.sender.emit(lifecycle, {}, 'dsh-runtime://app/next', false, true)
    else setup.sender.emit(lifecycle)
    await tick()
    assert.equal(setup.sources[0].signal.aborted, true)
    assert.equal(setup.sources[0].cancelled, 1)
    assert.equal(setup.sources[0].returned, 1)
    assert.equal(setup.sources[0].pulls, 64)
    for (const name of ['destroyed', 'render-process-gone', 'did-start-navigation']) assert.equal(setup.sender.listenerCount(name), 0)
    assert.equal(setup.handlers.get(CANCEL)?.(setup.event, id) ?? false, false)
  })
}

test('cancelling before scheduled open settles pending writes and never starts the provider', async context => {
  const scheduled = []
  const setup = await fixture(context, { schedule: callback => scheduled.push(callback) })
  const id = await setup.bridge.openRuntimeStream('test/stream', {})
  const writing = setup.bridge.writeRuntimeStream(id, 'pending')
  assert.equal(await setup.bridge.cancelRuntimeStream(id), true)
  assert.equal(await writing, false)
  scheduled.shift()()
  await tick()
  assert.equal(setup.sources.length, 0)
})

test('cancel interrupts a never-settling source.next and closes the iterator without awaiting it', async context => {
  const setup = await fixture(context, { stall: true })
  const id = await setup.bridge.openRuntimeStream('test/stream', {})
  await tick()
  await setup.bridge.cancelRuntimeStream(id)
  await tick()
  assert.equal(setup.sources[0].returned, 1)
  assert.equal(setup.sources[0].cancelled, 1)
})

test('renderer cancellation without a reader removes abort listeners and ignores late frames', async context => {
  const setup = await fixture(context)
  installDesktopTransportBridge(setup.target)
  const controller = new AbortController()
  const stream = setup.target.__DSH_TRANSPORT__.openStream('test/stream', {}, controller.signal)
  await tick()
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1)
  stream.cancel(new Error('consumer stopped'))
  await tick()
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  assert.equal(setup.sources[0].signal.aborted, true)
  const id = setup.frames[0].id
  setup.ipcRenderer.emit(FRAME, {}, { id, type: 'item', sequence: 65, value: 'late' })
  await assert.rejects(Array.fromAsync(stream), /consumer stopped/)
})

test('normal completion removes abort listeners and shared sender listeners', async context => {
  const setup = await fixture(context, { count: 3 })
  const controller = new AbortController()
  installDesktopTransportBridge(setup.target)
  const stream = setup.target.__DSH_TRANSPORT__.openStream('test/stream', {}, controller.signal)
  assert.deepEqual(await Array.fromAsync(stream), [0, 1, 2])
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  for (const name of ['destroyed', 'render-process-gone', 'did-start-navigation']) assert.equal(setup.sender.listenerCount(name), 0)
})

test('legacy open retains unsequenced frames and does not wait for ACKs', async context => {
  const setup = await fixture(context, { count: 5000 })
  const id = setup.handlers.get(OPEN)(setup.event, { endpoint: 'test/stream', payload: {} })
  await tick()
  assert.equal(setup.frames.length, 5001)
  assert.deepEqual(setup.frames[0], { id, type: 'item', value: 0 })
  assert.deepEqual(setup.frames.at(-1), { id, type: 'end' })
})

test('serialized bootstrap runs negotiated streams without external module bindings', async context => {
  const setup = await fixture(context, { count: 100 })
  const sandbox = { ...setup.target, setTimeout, clearTimeout, URL }
  runInNewContext(transportBootstrapScript(), sandbox)
  assert.deepEqual(await Array.fromAsync(sandbox.__DSH_TRANSPORT__.openStream('test/stream', {})), Array.from({ length: 100 }, (_unused, index) => index))
})

test('EOF drain flushes a partial ACK batch after the final yield without deadlocking', async context => {
  const setup = await fixture(context, { count: 3 })
  installDesktopTransportBridge(setup.target)
  const stream = setup.target.__DSH_TRANSPORT__.openStream('events.mux', {})
  const iterator = stream[Symbol.asyncIterator]()
  for (let index = 0; index < 3; index++) assert.deepEqual(await iterator.next(), { done: false, value: index })
  const result = await iterator.next()
  assert.deepEqual(result, { done: true, value: undefined })
  const acknowledgements = setup.calls.filter(call => call.channel === ACK)
  assert.equal(acknowledgements.at(-1).args[1], 3)
  assert.equal(setup.frames.at(-1).type, 'end')
})

test('return after the final yield cancels an EOF drain without requiring a final ACK', async context => {
  const setup = await fixture(context, { count: 1 })
  installDesktopTransportBridge(setup.target)
  const controller = new AbortController()
  const stream = setup.target.__DSH_TRANSPORT__.openStream('events.mux', {}, controller.signal)
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), { done: false, value: 0 })
  await tick()
  assert.equal(setup.sources[0].pulls, 2)
  assert.equal(setup.calls.filter(call => call.channel === ACK).length, 0)
  assert.deepEqual(await iterator.return(), { done: true, value: undefined })
  await tick()
  assert.equal(setup.sources[0].signal.aborted, true)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('iframe and same-document navigations do not cancel a main-frame stream', async context => {
  const setup = await fixture(context)
  await setup.bridge.openRuntimeStream('events.mux', {})
  await tick()
  setup.sender.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
  setup.sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
  setup.sender.emit('did-start-navigation', {}, 'dsh-runtime://app/frame', false, false)
  setup.sender.emit('did-start-navigation', {}, 'dsh-runtime://app/#tab', true, true)
  assert.equal(setup.sources[0].signal.aborted, false)
  setup.sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
  await tick()
  assert.equal(setup.sources[0].signal.aborted, true)
})

test('negotiated WebSocket consumes and ACKs across multiple downlink windows', async context => {
  const count = 150
  const setup = await fixture(context, {
    count: count + 1,
    value: index => {
      if (index === 0) return Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n').toString('base64')
      const text = Buffer.from(`token:${index}`)
      return Buffer.concat([Buffer.from([0x81, text.length]), text]).toString('base64')
    },
  })
  Object.assign(setup.target, {
    ArrayBuffer, Blob, DOMException, Event, EventTarget, TextDecoder, TextEncoder, atob, btoa, crypto,
    WebSocket: class {},
  })
  installDesktopTransportBridge(setup.target)
  const socket = new setup.target.WebSocket('ws://app/events')
  const messages = []
  socket.onmessage = event => messages.push(event.data)
  await new Promise(resolve => { socket.onclose = resolve })
  assert.deepEqual(messages, Array.from({ length: count }, (_unused, index) => `token:${index + 1}`))
  assert.ok(setup.calls.filter(call => call.channel === ACK).length > 1)
  assert.equal(setup.frames.at(-1).type, 'end')
})
