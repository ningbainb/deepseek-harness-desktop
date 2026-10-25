import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createDesktopFrontendFetch } from '../src/runtime-frontend-assets.mjs'

async function fixture(context, options = {}) {
  const dist = await mkdtemp(join(tmpdir(), 'desktop-frontend-assets-'))
  context.after(() => rm(dist, { recursive: true, force: true }))
  await mkdir(join(dist, 'assets'))
  await writeFile(join(dist, 'index.html'), '<html><head></head><body>app</body></html>')
  await writeFile(join(dist, 'assets', 'app.js'), 'export const ready = true')
  const fetch = createDesktopFrontendFetch({
    dist,
    authorizeIndex: async () => undefined,
    renderIndex: html => html.replace('app</body>', 'rendered</body>'),
    bootstrap: '<script>transport()</script>',
    ...options,
  })
  return { dist, fetch, request: (path, init) => fetch(new Request(`http://desktop.local${path}`, init)) }
}

test('frontend assets preserve body, content type, immutable headers and HEAD semantics', async context => {
  const { request } = await fixture(context)
  const response = await request('/assets/app.js')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'export const ready = true')
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  const head = await request('/assets/app.js', { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-type'), response.headers.get('content-type'))
  assert.equal(await head.text(), '')
})

test('frontend root and extensionless session routes retain per-request rendering and bootstrap', async context => {
  const { request } = await fixture(context)
  for (const path of ['/', '/session/new-session']) {
    const response = await request(path)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(await response.text(), '<html><head><script>transport()</script></head><body>rendered</body></html>')
  }
})

test('frontend index authorization is enforced separately for coalesced requests', async context => {
  let authorizations = 0
  let renders = 0
  const { request } = await fixture(context, {
    authorizeIndex: async () => ++authorizations === 1 ? new Response('login', { status: 401 }) : undefined,
    renderIndex: html => { renders += 1; return html },
  })
  const responses = await Promise.all([request('/'), request('/')])
  assert.deepEqual(responses.map(response => response.status), [401, 200])
  assert.equal(authorizations, 2)
  assert.equal(renders, 1)
})

test('case variants of the index file cannot bypass index authorization', async context => {
  let authorizations = 0
  const { request, dist } = await fixture(context, {
    authorizeIndex: async () => { authorizations += 1; return new Response('login', { status: 401 }) },
  })
  await writeFile(join(dist, 'INDEX.HTML'), '<html><head></head><body>app</body></html>')
  assert.equal((await request('/INDEX.HTML')).status, 401)
  assert.equal(authorizations, 1)
})

test('slow frontend I/O yields and does not serialize independent assets', async context => {
  let finishRead
  const pending = new Promise(resolve => { finishRead = resolve })
  let slowStarted = false
  const { request } = await fixture(context, {
    readAsset: async path => {
      if (path.endsWith('app.js')) { slowStarted = true; await pending }
      return readFile(path)
    },
  })
  let slowFinished = false
  const slow = request('/assets/app.js').then(response => { slowFinished = true; return response })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(slowStarted, true)
  const independent = await request('/')
  assert.equal(independent.status, 200)
  assert.equal(slowFinished, false)
  finishRead()
  assert.equal((await slow).status, 200)
})

test('concurrent windows share in-flight reads but subsequent requests see updated files', async context => {
  let reads = 0
  let finishRead
  const pending = new Promise(resolve => { finishRead = resolve })
  const { request, dist } = await fixture(context, {
    readAsset: async path => { reads += 1; await pending; return readFile(path) },
  })
  const first = request('/assets/app.js')
  const second = request('/assets/app.js')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 1)
  finishRead()
  assert.deepEqual(await Promise.all([first, second].map(async response => (await response).text())), [
    'export const ready = true', 'export const ready = true',
  ])
  await writeFile(join(dist, 'assets', 'app.js'), 'updated')
  assert.equal(await (await request('/assets/app.js')).text(), 'updated')
  assert.equal(reads, 2)
})

test('failed reads are evicted and missing file extensions never return the SPA', async context => {
  const { request, dist } = await fixture(context)
  assert.equal((await request('/assets/missing.js')).status, 404)
  await writeFile(join(dist, 'assets', 'missing.js'), 'recovered')
  assert.equal(await (await request('/assets/missing.js')).text(), 'recovered')
  assert.equal((await request('/assets/app.js', { method: 'POST' })).status, 405)
})

test('malformed encoding, NUL and traversal requests do not read outside frontend dist', async context => {
  let reads = 0
  const { request } = await fixture(context, {
    readAsset: async () => { reads += 1; throw new Error('must not read invalid paths') },
  })
  for (const path of ['/%ZZ', '/%00.js', '/..%5coutside.js', '/%2e%2e%2foutside.js',
    '/index.html.', '/index.html%20', '/index.html::$DATA']) {
    assert.equal((await request(path)).status, 404, path)
  }
  assert.equal(reads, 0)
})
