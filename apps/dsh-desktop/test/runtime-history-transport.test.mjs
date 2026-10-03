import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRuntimePipeIdentity, createRuntimePipeServer, RuntimePipeClient } from '../src/runtime-pipe.mjs'
import { registerDesktopRuntimeStreamIpc } from '../src/runtime-electron-transport.mjs'
import { installDesktopTransportBridge } from '../src/runtime-renderer-bootstrap.mjs'

test('5 MiB snapshot survives the production pipe, IPC handler and renderer stream bridge without truncation', async context => {
  const identity = createRuntimePipeIdentity()
  const snapshot = { type: 'snapshot', records: [{ content: 'x'.repeat(5 * 1024 * 1024) }], hasMore: false }
  const server = await createRuntimePipeServer({
    identity, runtimeVersion: '0.2.0-rc.2', profile: 'desktop',
    fetch: async () => new Response('ok'), openStream: async function * () {},
    openDuplex: async function * () { yield snapshot; yield { type: 'append', sequence: 2 } },
  })
  context.after(() => server.close())
  const client = new RuntimePipeClient(identity)
  const handlers = new Map()
  let onFrame
  const sender = {
    isDestroyed: () => false,
    send: (_channel, frame) => onFrame(structuredClone(frame)),
  }
  const dispose = registerDesktopRuntimeStreamIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) },
    getProvider: () => ({ status: { state: 'ready' }, openDuplex: (...args) => client.openDuplex(...args) }),
  })
  context.after(dispose)
  const target = {
    AbortController, Request, fetch, location: new URL('dsh-runtime://app/'),
    dshDesktopTransport: {
      onRuntimeStream: callback => { onFrame = callback },
      openRuntimeStream: async (endpoint, payload) => handlers.get('desktop:runtime-stream-open')({ sender }, { endpoint, payload }),
      writeRuntimeStream: async (id, value) => handlers.get('desktop:runtime-stream-write')({ sender }, id, value),
      endRuntimeStream: async id => handlers.get('desktop:runtime-stream-end')({ sender }, id),
      cancelRuntimeStream: id => handlers.get('desktop:runtime-stream-cancel')({ sender }, id),
    },
  }
  installDesktopTransportBridge(target)
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const values = []
    for await (const value of target.__DSH_TRANSPORT__.openStream('session/follow', { sessionId: 'isolated-history' })) values.push(value)
    assert.deepEqual(values, [snapshot, { type: 'append', sequence: 2 }])
  }
})
