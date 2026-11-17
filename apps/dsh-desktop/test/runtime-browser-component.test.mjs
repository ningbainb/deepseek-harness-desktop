import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('runtime adapter waits for preparation and assigns independent executable before vendor open', async () => {
  const { wrapBrowserComponentProvider } = await import('../src/runtime-browser-component.mjs')
  let finish
  const prepared = new Promise(resolve => { finish = resolve })
  const host = { spawnExecutable: undefined }
  const provider = { id: 'electron', host, available: () => false, open(label) { assert.equal(this, provider); assert.equal(host.spawnExecutable, '/activated/electron'); return label }, preserve() { return this === provider } }
  const env = {}
  const wrapped = wrapBrowserComponentProvider(provider, { prepare: () => prepared }, { env })
  assert.equal(wrapped.available(), true)
  let opened = false
  const pending = wrapped.open('task').then(value => { opened = true; return value })
  await Promise.resolve()
  assert.equal(opened, false)
  finish({ executablePath: '/activated/electron' })
  assert.equal(await pending, 'task')
  assert.deepEqual(env, {})
  assert.equal(wrapped.preserve(), true)
})
test('explicit user ELECTRON_PATH retains vendor availability and never downloads', async () => {
  const { wrapBrowserComponentProvider } = await import('../src/runtime-browser-component.mjs')
  const provider = { available: () => false, open: () => 'custom' }
  const wrapped = wrapBrowserComponentProvider(provider, { prepare: () => { throw Error('must not prepare') } }, { env: { ELECTRON_PATH: '/custom/electron' } })
  assert.equal(wrapped, provider)
  assert.equal(wrapped.available(), false)
})

test('validated legacy managed main executable gives way to the prepared independent component', async t => {
  const { wrapBrowserComponentProvider } = await import('../src/runtime-browser-component.mjs')
  const root = await mkdtemp(join(tmpdir(), 'dsh-browser-marker-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const hostMain = join(root, 'host-main.js')
  await writeFile(hostMain, '')
  const env = { ELECTRON_PATH: process.execPath, DSH_DESKTOP_BROWSER_HOST: 'desktop-browser-host-v1', DSH_DESKTOP_BROWSER_HOST_MAIN: hostMain }
  const originalEnvironment = { ...env }
  const host = {}
  const provider = { host, open: () => host.spawnExecutable }
  const wrapped = wrapBrowserComponentProvider(provider, { prepare: async () => ({ executablePath: '/independent/electron' }) }, { env, resolveHostMain: () => hostMain })
  assert.notEqual(wrapped, provider)
  assert.equal(await wrapped.open(), '/independent/electron')
  assert.deepEqual(env, originalEnvironment, 'Legacy managed provenance stays intact for each reloaded adapter to validate')
})

test('forged legacy markers never override the user executable contract', async () => {
  const { wrapBrowserComponentProvider } = await import('../src/runtime-browser-component.mjs')
  const env = { ELECTRON_PATH: process.execPath, DSH_DESKTOP_BROWSER_HOST: 'forged', DSH_DESKTOP_BROWSER_HOST_MAIN: '/untrusted/host-main.js' }
  assert.throws(() => wrapBrowserComponentProvider({}, {}, { env, resolveHostMain: () => process.execPath }), /integrity/)
})

test('runtime preparation controls register on the official authenticated owner Fetch seam', async () => {
  const { registerBrowserComponentRoutes } = await import('../src/runtime-browser-component.mjs')
  const routes = []
  let prepareCalls = 0
  let cancelled = false
  const manager = { status: () => ({ phase: 'downloading', totalBytes: 200, receivedBytes: 100 }), prepare: async () => { prepareCalls++ }, cancel: () => { cancelled = true } }
  const disposers = []
  registerBrowserComponentRoutes({ connection: { fetch: { register(route) { routes.push(route); return async () => {} } } }, effect: fn => disposers.push(fn()) }, manager)
  assert.equal(routes.length, 3)
  assert.ok(routes.every(route => route.requestBody === 'buffered'))
  const status = await routes.find(route => route.path.endsWith('/status')).fetch(new Request('http://dsh.internal/api/desktop/browser-component/status'))
  assert.equal((await status.json()).receivedBytes, 100)
  const prepare = await routes.find(route => route.path.endsWith('/prepare')).fetch(new Request('http://dsh.internal/api/desktop/browser-component/prepare', { method: 'POST' }))
  assert.equal(prepare.status, 202)
  assert.equal(prepareCalls, 1)
  await routes.find(route => route.path.endsWith('/cancel')).fetch(new Request('http://dsh.internal/api/desktop/browser-component/cancel', { method: 'POST' }))
  assert.equal(cancelled, true)
  assert.equal(disposers.length, 3)
})

test('same-environment HMR wraps the new provider and repairs a damaged activated component', async t => {
  const { wrapBrowserComponentProvider } = await import('../src/runtime-browser-component.mjs')
  const { createBrowserComponentManager } = await import('../src/browser-component.mjs')
  const root = await mkdtemp(join(tmpdir(), 'dsh-browser-hmr-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bytes = Buffer.from(zipSync({ 'electron.exe': Buffer.from('verified electron'), version: Buffer.from('44.7.0') }))
  const artifact = { platform: 'win32', arch: 'x64', version: '44.7.0', executable: 'electron.exe', required: ['electron.exe', 'version'],
    url: 'https://github.com/electron/electron/releases/download/v44.7.0/test.zip', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  let downloads = 0
  const options = { componentRoot: join(root, 'components'), cacheRoot: join(root, 'cache'), platform: 'win32', arch: 'x64',
    manifest: { schemaVersion: 1, artifacts: [artifact] }, fetch: async () => { downloads++; return new Response(bytes) } }
  const env = {}
  const provider = () => ({ host: {}, open() { return this.host.spawnExecutable } })
  const first = wrapBrowserComponentProvider(provider(), createBrowserComponentManager(options), { env })
  const executable = await first.open()
  await writeFile(executable, 'corrupted after settings reload')
  const reloadedProvider = provider()
  const newManager = createBrowserComponentManager(options)
  const reloaded = wrapBrowserComponentProvider(reloadedProvider, newManager, { env })
  assert.notEqual(reloaded, reloadedProvider, 'An automatic activation must not become a fabricated user override after HMR')
  assert.equal(await reloaded.open(), executable)
  assert.equal(await readFile(executable, 'utf8'), 'verified electron')
  assert.equal(downloads, 2)
  assert.equal(newManager.status().phase, 'ready', 'The reloaded UI manager must own the actual host preparation')
  assert.deepEqual(env, {}, 'Component selection must remain host-local rather than changing the process environment')
})
