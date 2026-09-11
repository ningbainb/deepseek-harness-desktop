import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { createRuntimeEventStreamDrain } from '../src/runtime-stream-drain.mjs'

test('only selected Runtime GET event streams receive a complete HTTP ending', async () => {
  const tracker = createRuntimeEventStreamDrain()
  const responses = new Map()
  const server = createServer((req, res) => {
    responses.set(req.url, res)
    res.writeHead(200, { 'content-type': req.url === '/json' ? 'application/json' : 'text/event-stream; charset=utf-8' })
    res.write(req.url === '/json' ? '{' : 'data: ready\n\n')
  })
  const other = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: other\n\n') })
  const clients = []
  const opened = (server, path, method = 'GET') => new Promise((resolve, reject) => {
    const client = request({ host: '127.0.0.1', port: server.address().port, path, method }, res => {
      const state = { ended: false, aborted: false, complete: false }
      res.resume()
      res.on('end', () => { state.ended = true; state.complete = res.complete })
      res.on('aborted', () => { state.aborted = true })
      res.on('error', () => {})
      resolve(state)
    })
    client.on('error', reject)
    clients.push(client)
    client.end()
  })
  try {
    await Promise.all([server, other].map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))))
    const sse = await opened(server, '/events')
    const json = await opened(server, '/json')
    const post = await opened(server, '/post', 'POST')
    const unrelated = await opened(other, '/events')
    assert.equal(await tracker.drain(server.address().port), 1)
    for (let i = 0; i < 20 && !sse.ended; i += 1) await new Promise(resolve => setTimeout(resolve, 5))
    assert.deepEqual(sse, { ended: true, aborted: false, complete: true })
    assert.equal(responses.get('/json').writableEnded, false)
    assert.equal(responses.get('/post').writableEnded, false)
    assert.equal(json.ended || post.ended || unrelated.ended, false)
    tracker.dispose()
    const later = await opened(server, '/later')
    assert.equal(await tracker.drain(server.address().port), 0)
    assert.equal(later.ended, false)
  } finally {
    tracker.dispose()
    for (const client of clients) client.destroy()
    await Promise.all([server, other].map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections() })))
  }
})

test('shutdown waits for a pending file-tree POST to finish without truncating its JSON', async () => {
  const tracker = createRuntimeEventStreamDrain({ timeoutMs: 200 })
  let received
  const ready = new Promise(resolve => { received = resolve })
  let timer
  const server = createServer((_req, res) => {
    received()
    timer = setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"entries":[]}')
    }, 25)
  })
  let client
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const result = new Promise(resolve => {
      client = request({ host: '127.0.0.1', port: server.address().port, path: '/sidebar/api/fs.tree', method: 'POST' }, res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { text += chunk })
        res.on('end', () => resolve({ text, complete: res.complete }))
        res.on('error', error => resolve({ error: error.code }))
      })
      client.on('error', error => resolve({ error: error.code }))
      client.end('{}')
    })
    await ready
    assert.equal(await tracker.drain(server.address().port), 0)
    server.closeAllConnections()
    assert.deepEqual(await result, { text: '{"entries":[]}', complete: true })
  } finally {
    clearTimeout(timer)
    tracker.dispose()
    client?.destroy()
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
  }
})

test('a never-finishing POST remains untouched and cannot hold shutdown past its budget', async () => {
  const tracker = createRuntimeEventStreamDrain({ timeoutMs: 30 })
  let received
  const ready = new Promise(resolve => { received = resolve })
  let response
  const server = createServer((_req, res) => { response = res; received() })
  let client
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    client = request({ host: '127.0.0.1', port: server.address().port, method: 'POST' })
    client.on('error', () => {})
    client.end()
    await ready
    const started = performance.now()
    assert.equal(await tracker.drain(server.address().port), 0)
    const elapsed = performance.now() - started
    assert.ok(elapsed >= 15 && elapsed < 1000, `drain elapsed ${elapsed}ms`)
    assert.equal(response.writableEnded, false)
  } finally {
    tracker.dispose()
    client?.destroy()
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
  }
})

test('an event stream whose headers arrive during drain is completed within the same budget', async () => {
  const tracker = createRuntimeEventStreamDrain({ timeoutMs: 200 })
  let received
  const ready = new Promise(resolve => { received = resolve })
  let timer
  const server = createServer((_req, res) => {
    received()
    timer = setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: ready\n\n')
    }, 25)
  })
  let client
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const result = new Promise(resolve => {
      client = request({ host: '127.0.0.1', port: server.address().port }, res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { text += chunk })
        res.on('end', () => resolve({ text, complete: res.complete }))
        res.on('error', error => resolve({ error: error.code }))
      })
      client.on('error', error => resolve({ error: error.code }))
      client.end()
    })
    await ready
    assert.equal(await tracker.drain(server.address().port), 1)
    server.closeAllConnections()
    assert.deepEqual(await result, { text: 'data: ready\n\n', complete: true })
  } finally {
    clearTimeout(timer)
    tracker.dispose()
    client?.destroy()
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
  }
})
