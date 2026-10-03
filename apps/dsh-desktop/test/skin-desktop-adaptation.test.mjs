import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

import { BUILTIN_SKIN_IDS, resolveRuntimePackages } from '../src/profile.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localRequire = createRequire(resolve(appDir, '../../packages/dsh-pet/package.json'))
const { JSDOM, VirtualConsole } = localRequire('jsdom')
const packageDir = resolveRuntimePackages().get('@linxin666/dsh-client-ui-skin-center')
const client = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
const marker = '\t\treturn module.exports;'
assert.equal(client.split(marker).length, 2, 'Expected one client factory export boundary')
// Expose the installed boot closure in memory without substituting any runtime
// implementation. Tests execute its real controller, ledger and DOM adapters.
const instrumentedClient = client.replace(marker, '\t\treturn { ...module.exports, bootSkinRuntime, watchPersistedSelection };')
const flush = async () => { for (let index = 0; index < 40; index += 1) await Promise.resolve() }
const response = (payload, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => payload })
const deferred = () => {
  let resolvePromise, rejectPromise
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}
const catalog = ['alpha', 'beta', 'blue-fantasy'].map(id => ({ manifest: { id, contributes: {} } }))

function setup(t, options = {}) {
  const dom = new JSDOM('<html><head></head><body></body></html>', {
    url: 'http://127.0.0.1/', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  })
  const { window } = dom
  if (options.preloadedSkin) {
    window.document.documentElement.setAttribute('data-dsh-skin', options.preloadedSkin)
    const preloaded = window.document.createElement('link')
    preloaded.rel = 'stylesheet'
    preloaded.href = `/api/skin-center/v2/skins/${options.preloadedSkin}/stylesheet`
    preloaded.setAttribute('data-dsh-skin-link', 'stylesheet')
    window.document.head.appendChild(preloaded)
  }
  const writes = [], broadcasts = [], channels = [], errors = [], reads = []
  class SelectionChannel {
    constructor(name) { this.name = name; this.closed = false; channels.push(this) }
    postMessage(message) {
      assert.equal(this.closed, false, 'A closed window must not broadcast')
      broadcasts.push(JSON.parse(JSON.stringify(message)))
    }
    close() { this.closed = true }
  }
  window.BroadcastChannel = SelectionChannel
  const append = window.document.head.appendChild.bind(window.document.head)
  window.document.head.appendChild = element => {
    const result = append(element)
    if (element.tagName === 'LINK') queueMicrotask(() => {
      const event = options.stylesheetFails ? 'error' : 'load'
      element.dispatchEvent(new window.Event(event))
    })
    return result
  }
  let catalogReads = 0
  let activeReads = 0
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'POST') {
      writes.push({ url, body: JSON.parse(init.body) })
      return options.post ? options.post(writes.at(-1)) : response({ ok: true })
    }
    reads.push(url)
    if (url.endsWith('/catalog')) {
      catalogReads += 1
      return options.catalog ? options.catalog(catalogReads) : response({ skins: catalog })
    }
    if (url.endsWith('/active')) {
      activeReads += 1
      return options.getActive ? options.getActive(activeReads) : response({ ok: true, active: options.active ?? 'alpha' })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  let exported
  window.__ModuleLoader__ = { load: ({ factory }) => { exported = factory(id => {
    assert.ok(['react', 'react/jsx-runtime'].includes(id), `Unexpected client dependency: ${id}`)
    return localRequire(id)
  }) } }
  runInNewContext(instrumentedClient, {
    window, document: window.document, fetch: fetchImpl,
    console: { error: (...args) => errors.push(args.map(String).join(' ')), warn() {}, log() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    MutationObserver: window.MutationObserver, URL,
  }, { filename: 'installed-skin-center-client.js' })
  const store = exported.bootSkinRuntime({ doc: window.document, fetchImpl })
  let stopped = false
  const shutdown = () => { if (!stopped) { stopped = true; store.shutdown() } }
  t.after(() => { shutdown(); window.close() })
  return { store, window, writes, broadcasts, errors, reads, channels, shutdown,
    watchSelection: () => {
      const ticks = []
      window.setInterval = tick => { ticks.push(tick); return ticks.length }
      window.clearInterval = id => { ticks[id - 1] = null }
      const stop = exported.watchPersistedSelection(store)
      t.after(stop)
      return async () => { ticks.at(-1)?.(); await flush() }
    },
    receive: data => channels[0].onmessage?.({ data }),
    applyEvent: id => window.dispatchEvent(new window.CustomEvent('dsh-skin-applied', { detail: { id } })),
  }
}

test('the exercised Desktop package is Skin Center 0.4.4 with its complete asset catalog', async () => {
  assert.equal(JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')).version, '0.4.4')
  const skinRoot = join(packageDir, 'skins')
  const desktopAssets = resolve(appDir, 'build/skin-center-v2-assets')
  const packageIds = (await readdir(skinRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)
  const desktopIds = (await readdir(desktopAssets, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)
  const ids = [...new Set([...packageIds, ...desktopIds])].toSorted()
  assert.deepEqual(ids, [...BUILTIN_SKIN_IDS].toSorted())
  for (const id of ids) {
    const assetRoot = packageIds.includes(id) ? skinRoot : desktopAssets
    assert.equal(JSON.parse(await readFile(join(assetRoot, id, 'skin.json'), 'utf8')).id, id)
    assert.ok((await readFile(join(assetRoot, id, 'skin.css'), 'utf8')).trim().length > 0, `${id} must ship its stylesheet`)
  }
})

test('boot and cross-window adoption commit the preview baseline without writing or rebroadcasting', async t => {
  const f = setup(t)
  await flush()
  assert.equal(f.store.controller.active, 'alpha')
  assert.equal(f.writes.length, 0)
  await f.receive({ active: 'beta' })
  assert.equal(f.store.controller.active, 'beta')
  await f.store.controller.tryOn('alpha', f.store.find('alpha'))
  await f.store.controller.exitTryOn()
  assert.equal(f.store.controller.active, 'beta', 'Exiting preview must restore the adopted selection')
  await f.receive({ active: null })
  assert.equal(f.store.controller.active, null)
  assert.equal(f.writes.length, 0)
  assert.equal(f.broadcasts.length, 0)
})

test('repeated activation owns the newly loaded stylesheet and removes it on stock restore', async context => {
  const fixture = setup(context)
  await flush()
  const stylesheets = () => [...fixture.window.document.querySelectorAll('link[rel="stylesheet"]')]
  assert.equal(stylesheets().length, 1)
  for (let iteration = 0; iteration < 3; iteration += 1) {
    await fixture.store.controller.tryOn('alpha', fixture.store.find('alpha'))
    assert.equal(stylesheets().length, 1, 'same-skin activation must not leave an unowned stylesheet')
    await fixture.store.controller.exitTryOn()
    assert.equal(stylesheets().length, 1, 'preview exit must retain only the committed activation stylesheet')
  }
  await fixture.store.controller.switchTo(null, null)
  assert.equal(stylesheets().length, 0, 'stock restore must release every owned skin stylesheet')
})

test('failed stylesheet loads remove their uncommitted link without persisting a selection', async context => {
  const fixture = setup(context, { stylesheetFails: true })
  await flush()
  assert.equal(fixture.store.controller.active, null)
  assert.equal(fixture.window.document.querySelectorAll('link[rel="stylesheet"]').length, 0)
  assert.equal(fixture.writes.length, 0)
  assert.equal(fixture.broadcasts.length, 0)
})

test('boot adopts first-paint skin stylesheet ownership without removing unrelated styles', async context => {
  const fixture = setup(context, { preloadedSkin: 'alpha' })
  const unrelated = fixture.window.document.createElement('link')
  unrelated.rel = 'stylesheet'
  unrelated.href = '/user-custom.css'
  fixture.window.document.head.appendChild(unrelated)
  await flush()
  const skinLinks = () => [...fixture.window.document.querySelectorAll('link[rel="stylesheet"]')]
    .filter(link => link.href.includes('/api/skin-center/v2/skins/'))
  assert.equal(fixture.store.controller.active, 'alpha')
  assert.equal(skinLinks().length, 1, 'the initial server-stamped skin link must not be orphaned')
  await fixture.store.controller.switchTo(null, null)
  assert.equal(skinLinks().length, 0)
  assert.equal(unrelated.isConnected, true)
})

test('failed boot keeps a first-paint skin until an explicit stock restore releases it', async context => {
  const fixture = setup(context, { preloadedSkin: 'alpha', stylesheetFails: true })
  await flush()
  assert.equal(fixture.store.controller.active, 'alpha')
  assert.equal(fixture.window.document.documentElement.getAttribute('data-dsh-skin'), 'alpha')
  assert.equal(fixture.window.document.querySelectorAll('link[rel="stylesheet"]').length, 1)
  assert.equal(fixture.writes.length, 0)
  assert.equal(fixture.broadcasts.length, 0)
  await fixture.store.controller.switchTo(null, null)
  assert.equal(fixture.window.document.querySelectorAll('link[rel="stylesheet"]').length, 0)
})

test('a successful switch broadcasts only after its persistence response succeeds', async t => {
  const commit = deferred()
  const f = setup(t, { post: () => commit.promise })
  await flush()
  const switchPromise = f.store.controller.switchTo('beta', f.store.find('beta'))
  await flush()
  assert.equal(f.store.controller.active, 'beta')
  assert.deepEqual(f.writes.map(write => write.body), [{ active: 'beta' }])
  assert.equal(f.broadcasts.length, 0)
  commit.resolve(response({ ok: true }))
  await switchPromise
  assert.deepEqual(f.broadcasts, [{ active: 'beta' }])
})

test('a stale boot selection cannot overwrite a newer committed user choice', async t => {
  const bootSelection = deferred()
  const fixture = setup(t, { getActive: () => bootSelection.promise })
  await flush()
  assert.equal(await fixture.store.controller.switchTo('beta', fixture.store.find('beta')), 'beta')
  bootSelection.resolve(response({ ok: true, active: 'alpha' }))
  await flush()
  assert.equal(fixture.store.controller.active, 'beta')
  assert.deepEqual(fixture.writes.map(write => write.body), [{ active: 'beta' }])
})

test('background adoption cannot supersede a user selection awaiting persistence', async t => {
  const commit = deferred()
  const fixture = setup(t, { post: () => commit.promise })
  await flush()
  const selection = fixture.store.controller.switchTo('beta', fixture.store.find('beta'))
  await flush()
  assert.equal(fixture.store.controller.busy, true)
  await fixture.store.controller.adopt('alpha', fixture.store.find('alpha'))
  commit.resolve(response({ ok: true }))
  assert.equal(await selection, 'beta')
  assert.equal(fixture.store.controller.busy, false)
  assert.equal(fixture.store.controller.active, 'beta')
  assert.deepEqual(fixture.broadcasts, [{ active: 'beta' }])
})

test('persisted-selection polling rejects stale reads and still adopts later external changes', async t => {
  const staleRead = deferred()
  let remote = 'alpha'
  const fixture = setup(t, { getActive: count => count === 3 ? staleRead.promise : response({ ok: true, active: remote }) })
  await flush()
  const tick = fixture.watchSelection()
  await flush()
  const pending = tick()
  await flush()
  assert.equal(await fixture.store.controller.switchTo('beta', fixture.store.find('beta')), 'beta')
  staleRead.resolve(response({ ok: true, active: 'alpha' }))
  await pending
  await flush()
  assert.equal(fixture.store.controller.active, 'beta')
  remote = 'beta'
  await tick()
  remote = 'alpha'
  await tick()
  assert.equal(fixture.store.controller.active, 'alpha')
  assert.deepEqual(fixture.writes.map(write => write.body), [{ active: 'beta' }])
})

test('background polling preserves an isolated preview and resumes after the preview ends', async t => {
  let remote = 'alpha'
  const fixture = setup(t, { getActive: () => response({ ok: true, active: remote }) })
  await flush()
  const tick = fixture.watchSelection()
  await flush()
  await fixture.store.controller.tryOn('beta', fixture.store.find('beta'))
  const readsBefore = fixture.reads.length
  remote = 'blue-fantasy'
  await tick()
  assert.equal(fixture.reads.length, readsBefore)
  assert.equal(fixture.store.controller.active, 'beta')
  await fixture.store.controller.exitTryOn()
  await tick()
  assert.equal(fixture.store.controller.active, 'blue-fantasy')
  assert.equal(fixture.writes.length, 0)
})

test('HTTP, application, JSON, and network persistence failures never broadcast', async t => {
  for (const [name, post] of [
    ['HTTP', async () => response({ ok: true }, false)],
    ['application', async () => response({ ok: false })],
    ['JSON', async () => ({ ok: true, json: async () => { throw new Error('bad JSON') } })],
    ['network', async () => { throw new Error('offline') }],
  ]) await t.test(name, async child => {
    const f = setup(child, { post })
    await flush()
    await f.store.controller.switchTo('beta', f.store.find('beta'))
    assert.equal(f.writes.length, 1)
    assert.equal(f.broadcasts.length, 0)
    assert.ok(f.errors.some(error => error.includes('failed to persist the skin selection')))
  })
})

test('a stylesheet activation failure neither persists nor broadcasts the failed selection', async t => {
  const f = setup(t, { stylesheetFails: true })
  await flush()
  await f.store.controller.switchTo('beta', f.store.find('beta'))
  assert.equal(f.writes.length, 0)
  assert.equal(f.broadcasts.length, 0)
  assert.ok(f.errors.some(error => error.includes('stylesheet load failed')))
})

test('shutdown clears active effects and prevents an in-flight commit from broadcasting', async t => {
  const commit = deferred()
  const f = setup(t, { post: () => commit.promise })
  await flush()
  const switchPromise = f.store.controller.switchTo('beta', f.store.find('beta'))
  await flush()
  f.shutdown()
  assert.equal(f.channels[0].closed, true)
  assert.equal(f.store.controller.active, null)
  assert.equal(f.window.document.documentElement.hasAttribute('data-dsh-skin'), false)
  assert.equal(f.window.document.querySelectorAll('link[rel="stylesheet"]').length, 0)
  commit.resolve(response({ ok: true }))
  await switchPromise
  await f.receive({ active: 'alpha' })
  await f.store.controller.switchTo('alpha', f.store.find('alpha'))
  assert.equal(f.store.controller.active, null)
  assert.equal(f.writes.length, 1, 'Stale controller callers cannot persist after shutdown')
  assert.equal(f.broadcasts.length, 0)
})

test('a boot request failing after shutdown cannot persist a fallback selection', async t => {
  const loadCatalog = deferred()
  const f = setup(t, { catalog: () => loadCatalog.promise })
  f.shutdown()
  loadCatalog.reject(new Error('catalog unavailable'))
  await flush()
  assert.equal(f.writes.length, 0, 'A closed runtime must not overwrite the selected skin')
  assert.equal(f.broadcasts.length, 0)
  assert.equal(f.store.controller.active, null)
})

test('skin-applied events remain live after boot and are removed on shutdown', async t => {
  const f = setup(t)
  await flush()
  f.applyEvent('beta')
  await flush()
  assert.equal(f.store.controller.active, 'beta')
  assert.deepEqual(f.writes.map(write => write.body), [], 'A persisted external selection must not be written again')
  f.shutdown()
  f.applyEvent('alpha')
  await flush()
  assert.equal(f.writes.length, 0)
  assert.equal(f.store.controller.active, null)
})

test('an unknown persisted skin resolving after shutdown cannot activate or save a default skin', async t => {
  const active = deferred()
  const f = setup(t, { getActive: () => active.promise })
  await flush()
  assert.ok(f.reads.some(url => url.endsWith('/active')))
  f.shutdown()
  active.resolve(response({ ok: true, active: 'missing-skin' }))
  await flush()
  assert.equal(f.writes.length, 0)
  assert.equal(f.broadcasts.length, 0)
  assert.equal(f.store.controller.active, null)
})

test('a skin-applied catalog request settling after shutdown cannot reactivate the runtime', async t => {
  const refresh = deferred()
  const f = setup(t, { catalog: count => count === 1 ? response({ skins: catalog }) : refresh.promise })
  await flush()
  f.applyEvent('new-skin')
  assert.equal(f.reads.filter(url => url.endsWith('/catalog')).length, 2)
  f.shutdown()
  refresh.resolve(response({ skins: catalog }))
  await flush()
  assert.equal(f.store.controller.active, null)
  assert.equal(f.writes.length, 0)
  assert.equal(f.broadcasts.length, 0)
})

test('a skin-applied catalog failure is handled without changing or persisting the current skin', async t => {
  const f = setup(t, { catalog: count => count === 1 ? response({ skins: catalog }) : Promise.reject(new Error('offline')) })
  await flush()
  f.applyEvent('new-skin')
  await flush()
  assert.equal(f.store.controller.active, 'alpha')
  assert.equal(f.writes.length, 0)
  assert.equal(f.store.controller.active, 'alpha')
})
