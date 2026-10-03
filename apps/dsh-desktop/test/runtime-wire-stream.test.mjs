import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import { openDesktopWireStream } from '../src/runtime-wire-stream.mjs'

test('Desktop maps the official five-argument wire stream contract and preserves uplink', async () => {
  const controller = new AbortController()
  const operator = {}
  let observed
  const ctx = {
    connection: { operator },
    typertGateway: { wireStream: { open: (...args) => { observed = args; return 'stream' } } },
  }
  async function *uplink() { yield { input: 'value' } }
  const input = uplink()
  assert.equal(openDesktopWireStream(ctx, 'test/stream', { args: {} }, controller.signal, input), 'stream')
  assert.deepEqual(observed, ['test/stream', { args: {} }, input, operator, controller.signal])
  openDesktopWireStream(ctx, '$events', { args: {} }, controller.signal)
  assert.deepEqual(await Array.fromAsync(observed[2]), [])
  assert.throws(() => openDesktopWireStream(ctx, '$events', { args: {} }), /cancellation signal/u)
})

test('official rc.2 event source yields ready over the Desktop adapter and observes cancellation', async () => {
  const require = createRequire(import.meta.url)
  const { TypertGatewayService } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-api-gateway')).href)
  const lifetime = new AbortController()
  const controller = new AbortController()
  const gateway = Object.create(TypertGatewayService.prototype)
  gateway.remoteEvents = { host: { home: '/isolated-home' }, lifetime }
  gateway.remoteEventClients = new Map()
  gateway.pendingRemoteEvents = new Map()
  const ctx = {
    connection: { operator: {} },
    typertGateway: {
      wireStream: {
        open: (endpoint, payload, uplink, peer, signal) => gateway.openWireStream(endpoint, payload, uplink, peer, signal, new AbortController()),
      },
    },
  }
  const stream = await openDesktopWireStream(ctx, '$events', { args: {} }, controller.signal)
  const ready = await stream.next()
  assert.equal(ready.done, false)
  assert.equal(ready.value.type, 'ready')
  assert.equal(typeof ready.value.clientId, 'string')
  assert.deepEqual(ready.value.host, { home: '/isolated-home' })
  assert.equal(gateway.remoteEventClients.size, 1)
  const pending = stream.next()
  controller.abort(new Error('test cancellation'))
  assert.deepEqual(await pending, { value: undefined, done: true })
  assert.equal(gateway.remoteEventClients.size, 0)
})
