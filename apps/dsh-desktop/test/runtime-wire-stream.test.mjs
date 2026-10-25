import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import * as desktopConnection from '../src/runtime-wire-stream.mjs'

import { openDesktopWireStream } from '../src/runtime-wire-stream.mjs'

test('private API dispatch passes the same SDK-owned browser Peer and refuses a missing identity', async () => {
  assert.equal(typeof desktopConnection.fetchDesktopConnectionApi, 'function')
  const peer = { official: true }
  const request = new Request('http://dsh.internal/api/settings/describe')
  let observed
  const api = { fetch: async (...args) => { observed = args; return new Response('accepted') } }
  const response = await desktopConnection.fetchDesktopConnectionApi({ connection: { browserPeer: peer } }, api, request)
  assert.equal(await response.text(), 'accepted')
  assert.deepEqual(observed, [request, peer])
  assert.throws(() => desktopConnection.fetchDesktopConnectionApi({ connection: {} }, api, request), /Connection peer/u)
})

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

test('Desktop uses the official browser Peer rather than a stale legacy operator', () => {
  const peer = { official: true }
  const signal = new AbortController().signal
  let observed
  const ctx = {
    connection: { browserPeer: peer, operator: { legacy: true } },
    typertGateway: { wireStream: { open: (...args) => { observed = args; return 'stream' } } },
  }
  assert.equal(openDesktopWireStream(ctx, '$events', { args: {} }, signal), 'stream')
  assert.equal(observed[3], peer)
  assert.equal(observed[4], signal)
})

test('official SDK event source yields ready over the Desktop adapter and observes cancellation', async () => {
  const require = createRequire(import.meta.url)
  const { TypertGatewayService } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-api-gateway')).href)
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const { Peer } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-client-connection')).href)
  const owner = new Context()
  const peer = new Peer(owner, { principal: { kind: 'owner' } })
  const lifetime = new AbortController()
  const controller = new AbortController()
  const gateway = Object.create(TypertGatewayService.prototype)
  gateway.remoteEvents = { host: { home: '/isolated-home' }, lifetime }
  gateway.remoteEventClients = new Map()
  gateway.pendingRemoteEvents = new Map()
  const ctx = {
    connection: { browserPeer: peer },
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
  await peer.dispose()
  await owner.fiber.dispose()
})
