import assert from 'node:assert/strict'
import test from 'node:test'
import { createDesktopPipeSessionCookie, openDesktopPipeWebSocket } from '../src/runtime-cookie.mjs'

test('private HTTP and WebSocket routes share one official browser-session exchange', async () => {
  let exchanges = 0
  const cookie = createDesktopPipeSessionCookie({
    connection: { authenticatedUrl: url => `${url}?token=synthetic-exchange` },
    webServer: { host: '127.0.0.1', authorizeIndex: async request => {
      exchanges++
      assert.equal(request.url, 'http://127.0.0.1/?token=synthetic-exchange')
      return new Response(null, { status: 303, headers: { 'set-cookie': 'official=synthetic-session; HttpOnly; SameSite=Strict' } })
    } },
  })
  const first = cookie()
  const second = cookie()
  assert.equal(await first, 'official=synthetic-session')
  assert.equal(await second, 'official=synthetic-session')
  const payload = Object.freeze({ url: '/sidebar/ws/agent-opens', cookie: 'untrusted=renderer' })
  const input = (async function *() {})()
  const signal = new AbortController().signal
  const seen = []
  const server = { openDuplex: async function *(...args) { seen.push(args); yield 'frame' } }
  assert.deepEqual(await Array.fromAsync(openDesktopPipeWebSocket(server, 'websocket', payload, input, signal, cookie)), ['frame'])
  assert.deepEqual(seen, [['websocket', payload, input, signal, 'official=synthetic-session']])
  assert.equal(exchanges, 1)
})

test('failed official authorization cannot open a private WebSocket or fabricate a cookie', async () => {
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 303 }),
    new Response(null, { status: 200, headers: { 'set-cookie': 'untrusted=value' } })]) {
    const cookie = createDesktopPipeSessionCookie({ connection: { authenticatedUrl: url => url },
      webServer: { host: '127.0.0.1', authorizeIndex: async () => response } })
    let opened = false
    await assert.rejects(Array.fromAsync(openDesktopPipeWebSocket({ openDuplex: () => { opened = true } },
      'websocket', {}, (async function *() {})(), new AbortController().signal, cookie)), /official browser session/u)
    assert.equal(opened, false)
  }
})

test('cancelled private WebSocket does not acquire a session or attach a route', async () => {
  const controller = new AbortController()
  const failure = new Error('fixture cancelled')
  controller.abort(failure)
  await assert.rejects(Array.fromAsync(openDesktopPipeWebSocket({ openDuplex: () => assert.fail('route opened') },
    'websocket', {}, (async function *() {})(), controller.signal, () => assert.fail('cookie acquired'))), error => error === failure)
})
