import assert from 'node:assert/strict'
import test from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { apply, DesktopPipeWebServer } from '../lib/index.mjs'

function server() {
  return new DesktopPipeWebServer(new Context())
}

test('pipe surface advertises the real Desktop URL to official context consumers without a TCP listener', async context => {
  const ctx = new Context()
  context.after(() => ctx.fiber.dispose())
  apply(ctx)
  assert.ok(ctx.get('webApp'))
  assert.equal(ctx.webApp.getAdvertisedUrl(), 'dsh-runtime://app/')
  assert.equal(ctx.webServer.port, 0)
  assert.equal(ctx.webServer.host, '127.0.0.1')
})

test('adapter dispatches exact and longest-prefix routes without listening', async () => {
  const web = server()
  web.register({ kind: 'prefix', path: '/items', handler: (_req, res) => res.end('short') })
  web.register({ kind: 'prefix', path: '/items/deep', handler: (req, res) => {
    assert.equal(req.socket.remoteAddress, '127.0.0.1')
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(req.url)
  } })
  web.register({ kind: 'exact', path: '/items/deep/one', handler: (_req, res) => res.end('exact') })

  assert.equal(await (await web.fetch(new Request('http://dsh.internal/items/value'))).text(), 'short')
  assert.equal(await (await web.fetch(new Request('http://dsh.internal/items/deep/value?q=1'))).text(), '/items/deep/value?q=1')
  assert.equal(await (await web.fetch(new Request('http://dsh.internal/items/deep/one'))).text(), 'exact')
  assert.equal((await web.fetch(new Request('http://dsh.internal/missing'))).status, 404)
})

test('Cordis service proxy retains route registry method ownership', async () => {
  const ctx = new Context()
  apply(ctx)
  const web = ctx.get('webServer')
  assert.ok(web)
  web.register({ kind: 'exact', path: '/', handler: (_req, res) => res.end('root') })
  assert.equal(await (await web.fetch(new Request('http://dsh.internal/'))).text(), 'root')
  assert.deepEqual(ctx.get('webRuntime').trustedHosts, [])
})

test('adapter preserves streamed responses and request bodies', async () => {
  const web = server()
  web.register({ kind: 'exact', path: '/stream', handler: async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    res.writeHead(201, { 'x-body': Buffer.concat(chunks).toString('utf8') })
    res.write('first')
    queueMicrotask(() => res.end('second'))
  } })

  const response = await web.fetch(new Request('http://dsh.internal/stream', { method: 'POST', body: 'payload' }))
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('x-body'), 'payload')
  assert.equal(await response.text(), 'firstsecond')
})

test('adapter preserves callback-style responses after the handler returns', async () => {
  const web = server()
  web.register({ kind: 'exact', path: '/callback', handler: (_req, res) => {
    setImmediate(() => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('callback body')
    })
  } })

  const response = await web.fetch(new Request('http://dsh.internal/callback'))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'callback body')
})

test('adapter normalizes custom-scheme authority and bridges index authorization', async () => {
  const ctx = new Context()
  let observed
  ctx.provide('connection', {
    authorizeIndex(req, res) {
      observed = req.headers
      res.writeHead(303, { location: '/', 'set-cookie': 'dsh-auth-test=signed; Path=/; HttpOnly; SameSite=Strict' })
      res.end()
      return false
    },
  })
  const web = new DesktopPipeWebServer(ctx)
  const response = await web.authorizeIndex(new Request('http://dsh.internal/?token=private', {
    headers: {
      host: 'attacker.invalid',
      origin: 'dsh-runtime://app',
      'sec-fetch-site': 'cross-site',
      cookie: 'existing=value',
    },
  }))

  assert.equal(observed.host, '127.0.0.1')
  assert.equal(observed.origin, 'http://127.0.0.1')
  assert.equal(observed['sec-fetch-site'], 'same-origin')
  assert.equal(observed.cookie, 'existing=value')
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/')
  assert.match(response.headers.get('set-cookie'), /^dsh-auth-test=signed;/u)
})

test('adapter request cancellation cannot emit an unhandled Readable error', async () => {
  const web = server()
  let observedAbort = false
  web.register({ kind: 'exact', path: '/cancel', handler: req => new Promise(resolve => {
    req.once('aborted', () => { observedAbort = true; resolve() })
  }) })
  const controller = new AbortController()
  const response = web.fetch(new Request('http://dsh.internal/cancel', { signal: controller.signal }))
  await new Promise(resolve => setImmediate(resolve))
  controller.abort(new Error('expected cancellation'))
  assert.equal((await response).status, 500)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(observedAbort, true)
})

test('adapter ignores asynchronous response writes after request cancellation', async () => {
  const web = server()
  let release
  let settleLateWrite
  const lateWrite = new Promise((resolve, reject) => { settleLateWrite = { resolve, reject } })
  web.register({ kind: 'exact', path: '/cancel-late-write', handler: async (_req, res) => {
    await new Promise(resolve => { release = resolve })
    try {
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      res.end('late body')
      settleLateWrite.resolve()
    } catch (error) {
      settleLateWrite.reject(error)
      throw error
    }
  } })
  const controller = new AbortController()
  const response = web.fetch(new Request('http://dsh.internal/cancel-late-write', { signal: controller.signal }))
  await new Promise(resolve => setImmediate(resolve))
  controller.abort(new Error('expected cancellation'))
  assert.equal((await response).status, 500)
  release()
  await lateWrite
})

test('adapter renders structured injections and raw index taps', () => {
  const ctx = new Context()
  const web = new DesktopPipeWebServer(ctx)
  ctx.on('webserver/index-inject', table => table.push({ kind: 'global', name: '__TEST__', value: { ok: true } }))
  web.tapIndex(html => html.replace('</body>', '<p>tap</p></body>'))
  const html = web.renderIndex('<html><head></head><body></body></html>')
  assert.match(html, /__TEST__/u)
  assert.match(html, /<p>tap<\/p>/u)
})

test('adapter carries registered upgrade sockets as bounded duplex bytes', async () => {
  const web = server()
  web.registerUpgrade({ path: '/socket', handler: (req, socket) => {
    assert.equal(req.headers.upgrade, 'websocket')
    socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n')
    socket.on('data', chunk => socket.write(chunk))
    socket.on('end', () => socket.end())
  } })
  const input = (async function * () { yield Buffer.from('client-frame').toString('base64') })()
  const controller = new AbortController()
  const chunks = []
  for await (const chunk of web.openDuplex('websocket', { url: '/socket' }, input, controller.signal)) {
    chunks.push(Buffer.from(chunk, 'base64'))
  }
  assert.match(Buffer.concat(chunks).toString('utf8'), /101 Switching Protocols[\s\S]*client-frame/u)
})

test('real pipe response writes apply backpressure and drain only when the consumer reads', async context => {
  const web = server()
  const controller = new AbortController()
  let responseBridge
  let accepted
  let drained = false
  let releaseDrain
  const drain = new Promise(resolve => { releaseDrain = resolve })
  web.register({ kind: 'exact', path: '/slow-events', handler: (_req, res) => {
    responseBridge = res
    res.on('error', () => {})
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.once('drain', () => { drained = true; releaseDrain() })
    accepted = res.write(Buffer.alloc(64 * 1024, 'a'))
  } })
  const response = await web.fetch(new Request('http://dsh.internal/slow-events', { signal: controller.signal }))
  context.after(() => controller.abort())
  assert.equal(accepted, false, 'a full response queue must tell the HMR producer to stop adding frames')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(drained, false)
  const reader = response.body.getReader()
  const first = await reader.read()
  assert.equal(first.value.byteLength, 64 * 1024)
  let timeout
  try {
    await Promise.race([drain, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('consuming the queued response did not emit drain')), 1000)
    })])
  } finally { clearTimeout(timeout) }
  responseBridge.end('tail')
  assert.equal(Buffer.from((await reader.read()).value).toString(), 'tail')
  assert.equal((await reader.read()).done, true)
})

test('HEAD suppresses finite response bytes and cancellation releases a pending ended response', async () => {
  const web = server()
  let bridge
  web.register({ kind: 'exact', path: '/finite', handler: (_req, res) => {
    bridge = res
    res.end('body')
  } })
  const head = await web.fetch(new Request('http://dsh.internal/finite', { method: 'HEAD' }))
  assert.equal(await head.text(), '')
  const response = await web.fetch(new Request('http://dsh.internal/finite'))
  const closed = new Promise(resolve => bridge.once('close', resolve))
  await response.body.cancel()
  let timeout
  try {
    await Promise.race([closed, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('cancelled response retained pending writes')), 1000)
    })])
  } finally { clearTimeout(timeout) }
  assert.equal(bridge.destroyed, true)
})

test('request cancellation closes an unread blocked response without waiting for its consumer', async () => {
  const web = server()
  const controller = new AbortController()
  let bridge
  web.register({ kind: 'exact', path: '/abort-unread', handler: (_req, res) => {
    bridge = res
    res.write(Buffer.alloc(64 * 1024, 'a'))
  } })
  const response = await web.fetch(new Request('http://dsh.internal/abort-unread', { signal: controller.signal }))
  await new Promise(resolve => setImmediate(resolve))
  const closed = new Promise(resolve => bridge.once('close', resolve))
  controller.abort(new Error('fixture request cancelled'))
  let timeout
  try {
    await Promise.race([closed, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('unread response cancellation retained a blocked write')), 200)
    })])
  } finally {
    clearTimeout(timeout)
    await response.body.cancel().catch(() => {})
  }
  assert.equal(bridge.destroyed, true)
})

test('upgrade routes receive only the server-owned browser cookie, not renderer payload credentials', async () => {
  const web = server()
  let headers
  web.registerUpgrade({ path: '/authenticated', handler: (req, socket) => {
    headers = req.headers
    socket.end('HTTP/1.1 101 Switching Protocols\r\n\r\n')
  } })
  const input = (async function *() {})()
  const payload = { url: '/authenticated', cookie: 'renderer=forged', headers: { cookie: 'renderer=forged' } }
  await Array.fromAsync(web.openDuplex('websocket', payload, input, new AbortController().signal, 'official=synthetic-session'))
  assert.equal(headers.cookie, 'official=synthetic-session')
  assert.equal(headers.host, '127.0.0.1')
  assert.equal(headers.origin, 'http://127.0.0.1')
  for (const cookie of ['', 'official=value\r\nInjected: bad', {}]) {
    assert.throws(() => web.openDuplex('websocket', payload, input, new AbortController().signal, cookie), /browser cookie/u)
  }
})
