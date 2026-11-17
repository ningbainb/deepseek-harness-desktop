import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { apply as mountPipeWebServer } from '@linxin666/dsh-desktop-pipe-webserver'

import { createDesktopFrontendFetch } from '../src/runtime-frontend-assets.mjs'
import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from '../src/profile.mjs'
import { BoundedLogStore } from '../src/log-store.mjs'
import { DEFAULT_STARTUP_TIMEOUT_MS, DshRuntimeController } from '../src/runtime-controller.mjs'

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

test('frontend index carries the admitted browser Peer into actual SDK access injections', async context => {
  const ctx = new Context()
  context.after(() => ctx.fiber.dispose())
  mountPipeWebServer(ctx)
  const root = resolveRuntimePackages().get('@deepseek-ai/dsh-api-remote-access')
  const { default: RemoteAccess } = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)
  await ctx.plugin(RemoteAccess)
  const browserPeer = Object.freeze({ principal: Object.freeze({ kind: 'owner' }) })
  const restrictedPeer = Object.freeze({ principal: Object.freeze({ kind: 'fixture-restricted' }) })
  const { request } = await fixture(context, {
    renderIndex: html => ctx.webServer.renderIndex(html, browserPeer),
  })
  const response = await request('/')
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /"owner":true/u)
  assert.match(html, /transport\(\)/u)
  const restrictedHtml = ctx.webServer.renderIndex('<html><head></head></html>', restrictedPeer)
  assert.doesNotMatch(restrictedHtml, /"owner":true/u)
  assert.throws(() => ctx.webServer.renderIndex('<html><head></head></html>'), /principal/u)
})

test('actual pipe runtime serves its authenticated index, plugin bundle and browser API', { timeout: DEFAULT_STARTUP_TIMEOUT_MS + 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'desktop-frontend-pipe-'))
  const logs = new BoundedLogStore({ directory: join(home, 'logs') })
  let controller
  try {
    await ensureDesktopProfile({ dshHome: home })
    controller = new DshRuntimeController({ cliPath: resolveDshCliPath(), cwd: process.cwd(),
      dshHome: home, transport: 'pipe', logStore: logs,
      patchFiles: [fileURLToPath(new URL('../runtime-support/desktop-pipe.patch.yml', import.meta.url))] })
    await controller.start()
    const response = await controller.fetch('http://dsh.internal/')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/html/u)
    const html = await response.text()
    assert.match(html, /"owner":true/u)
    const plugin = html.match(/(?:src|href)="(\/?plugins\/[^"]+)"/u)?.[1]
    assert.ok(plugin, 'authenticated index must advertise a plugin resource')
    const bundle = await controller.fetch(new URL(plugin.replaceAll('&amp;', '&'), 'http://dsh.internal/'))
    assert.equal(bundle.status, 200)
    assert.ok((await bundle.text()).length > 0)
    const api = await controller.fetch('http://dsh.internal/api/agentPresets/list', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'frontend-pipe-presets',
        method: 'agentPresets/list', payload: { args: {} } }),
    })
    assert.equal(api.status, 200)
    const body = await api.json()
    assert.equal(body.result?.ok, true)
    assert.ok(body.result.value.presets.some(preset => !preset.broken))
    const rpc = async (method, args) => {
      const response = await controller.fetch(`http://dsh.internal/api/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: method, method, payload: { args } }),
      })
      const result = await response.json()
      assert.equal(result.result?.ok, true, JSON.stringify(result))
      return result.result.value
    }
    const workspacePath = join(home, 'workspace')
    await mkdir(workspacePath)
    const { workspace } = await rpc('workspace/create', { request: { path: workspacePath } })
    const preset = body.result.value.presets.find(preset => !preset.broken)
    const created = await rpc('session/create', { request: { workspaceId: workspace.workspaceId, agentPreset: preset.id } })
    const follow = controller.openDuplex('session/follow', { args: { request: {
      address: { kind: 'session', sessionId: created.sessionId }, assistantStream: true,
    } } }, AbortSignal.timeout(10_000))
    const following = follow[Symbol.asyncIterator]()
    try {
      const first = await following.next()
      assert.equal(first.done, false)
      assert.equal(first.value.type, 'snapshot')
      assert.equal(first.value.header.id, created.sessionId)
    } finally {
      follow.cancel()
      await following.return()
    }
    for (const [endpoint, expectedType] of [['$events', 'ready'], ['remoteAccess/follow', 'baseline']]) {
      const duplex = controller.openDuplex(endpoint, { args: {} }, AbortSignal.timeout(10_000))
      const iterator = duplex[Symbol.asyncIterator]()
      try {
        const first = await iterator.next()
        assert.equal(first.done, false)
        assert.equal(first.value.type, expectedType)
      } finally {
        duplex.cancel()
        await iterator.return()
      }
    }
  } catch (error) {
    throw new Error(`${error.message}\nRecent runtime log:\n${await logs.tail(35)}`, { cause: error })
  } finally {
    await controller?.stop()
    await logs.queue
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
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
