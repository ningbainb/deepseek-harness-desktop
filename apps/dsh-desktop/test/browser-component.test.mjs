import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, readdir, readlink, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'

// Removing archive integrity, atomic activation or the provider's prepare barrier
// must break these tests; all downloads use real Response bodies and real files.
const modulePath = new URL('../src/browser-component.mjs', import.meta.url)
async function fixture(t, options = {}) {
  const { createBrowserComponentManager } = await import(modulePath)
  const root = await mkdtemp(join(tmpdir(), 'dsh-browser-component-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bytes = Buffer.from(zipSync(options.files ?? { 'electron.exe': Buffer.from('electron fixture'), version: Buffer.from('44.7.0'), 'resources/default_app.asar': Buffer.from('app') }))
  const artifact = { platform: 'win32', arch: 'x64', version: '44.7.0', url: 'https://github.com/electron/electron/releases/download/v44.7.0/test.zip', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), executable: 'electron.exe', required: ['electron.exe', 'version', 'resources/default_app.asar'] }
  let downloads = 0
  const manager = createBrowserComponentManager({ componentRoot: join(root, 'components'), cacheRoot: join(root, 'cache'), manifest: { schemaVersion: 1, artifacts: [artifact] }, platform: 'win32', arch: 'x64', fetch: async (...args) => { downloads++; return options.fetch ? options.fetch(bytes, ...args) : new Response(bytes) } })
  return { root, bytes, artifact, manager, downloads: () => downloads, createBrowserComponentManager }
}

test('component module exposes persistent preparation API', async () => {
  const module = await import(modulePath).catch(() => ({}))
  assert.equal(typeof module.createBrowserComponentManager, 'function')
})
test('concurrent preparation downloads once and activated complete component survives cache cleanup offline', async t => {
  const f = await fixture(t)
  const progress = []
  const [a, b] = await Promise.all([f.manager.prepare({ onProgress: state => progress.push(state) }), f.manager.prepare()])
  assert.equal(a.executablePath, b.executablePath)
  assert.equal(f.downloads(), 1)
  assert.equal(await readFile(a.executablePath, 'utf8'), 'electron fixture')
  assert.equal(f.manager.status().phase, 'ready')
  assert.ok(progress.some(state => state.receivedBytes === f.bytes.length && state.totalBytes === f.bytes.length))
  await rm(join(f.root, 'cache'), { recursive: true, force: true })
  const offline = f.createBrowserComponentManager({ componentRoot: join(f.root, 'components'), cacheRoot: join(f.root, 'cache'), manifest: { schemaVersion: 1, artifacts: [f.artifact] }, platform: 'win32', arch: 'x64', fetch: () => { throw Error('offline') } })
  assert.equal((await offline.prepare()).executablePath, a.executablePath)
})
test('checksum mismatch never activates and explicit retry succeeds', async t => {
  let corrupt = true
  const f = await fixture(t, { fetch: bytes => new Response(corrupt ? Buffer.alloc(bytes.length) : bytes) })
  await assert.rejects(f.manager.prepare(), /SHA256/)
  assert.equal(f.manager.status().phase, 'error')
  corrupt = false
  await f.manager.prepare()
  assert.equal(f.downloads(), 2)
})
test('cancellation aborts pending download, cleans temporary files and allows retry', async t => {
  let block = true
  const f = await fixture(t, { fetch: (bytes, url, { signal }) => block ? new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }) }) : new Response(bytes) })
  const running = f.manager.prepare()
  while (f.downloads() === 0) await new Promise(resolve => setTimeout(resolve, 5))
  f.manager.cancel()
  await assert.rejects(running, /cancel|abort/i)
  assert.equal(f.manager.status().phase, 'cancelled')
  block = false
  await f.manager.prepare()
  assert.equal(f.manager.status().phase, 'ready')
})
test('deleted activated payload is detected and repaired, unsupported architecture rejected before network', async t => {
  const f = await fixture(t)
  const ready = await f.manager.prepare()
  await rm(ready.executablePath)
  await f.manager.prepare()
  assert.equal(f.downloads(), 2)
  assert.throws(() => f.createBrowserComponentManager({ componentRoot: join(f.root, 'other'), cacheRoot: join(f.root, 'cache'), platform: 'win32', arch: 'arm64', manifest: { schemaVersion: 1, artifacts: [f.artifact] } }), /unsupported/)
})
test('separate managers coordinate through filesystem lock and do not download twice', async t => {
  const f = await fixture(t)
  const second = f.createBrowserComponentManager({ componentRoot: join(f.root, 'components'), cacheRoot: join(f.root, 'cache'), manifest: { schemaVersion: 1, artifacts: [f.artifact] }, platform: 'win32', arch: 'x64', fetch: () => { throw Error('duplicate download') } })
  const first = f.manager.prepare()
  while (f.downloads() === 0) await new Promise(resolve => setTimeout(resolve, 1))
  await Promise.all([first, second.prepare()])
  assert.equal(f.downloads(), 1)
})
test('cache nested around persistent components is rejected', async t => {
  const f = await fixture(t)
  assert.throws(() => f.createBrowserComponentManager({ componentRoot: join(f.root, 'cache', 'components'), cacheRoot: join(f.root, 'cache'), manifest: { schemaVersion: 1, artifacts: [f.artifact] }, platform: 'win32', arch: 'x64' }), /separate/)
})

test('preflight can reuse an existing official ZIP with full integrity verification and no network', async t => {
  const f = await fixture(t, { fetch: () => { throw Error('network forbidden') } })
  const archivePath = join(f.root, 'official.zip')
  await writeFile(archivePath, f.bytes)
  await f.manager.prepare({ archivePath })
  assert.equal(f.downloads(), 0)
  assert.equal(await readFile(archivePath, 'utf8'), f.bytes.toString('utf8'))
  assert.deepEqual(await readdir(join(f.root, 'cache')), [])
})

test('ZIP extraction rejects traversal and escaping links without outside writes', async t => {
  const { extractBrowserComponentArchive } = await import(modulePath)
  const f = await fixture(t)
  const archive = join(f.root, 'hostile.zip')
  await writeFile(archive, zipSync({ '../outside.txt': Buffer.from('unsafe') }))
  await assert.rejects(extractBrowserComponentArchive(archive, join(f.root, 'stage')), /unsafe/)
  await assert.rejects(stat(join(f.root, 'outside.txt')), { code: 'ENOENT' })
  await writeFile(archive, zipSync({ 'bad-link': [Buffer.from('../../outside'), { os: 3, attrs: 0xa1ff0000 }] }))
  await assert.rejects(extractBrowserComponentArchive(archive, join(f.root, 'stage')), /unsafe/)
})

test('verified archive still must contain the complete payload and exact version', async t => {
  const incomplete = await fixture(t, { files: { 'electron.exe': Buffer.from('fixture'), version: Buffer.from('44.7.0') } })
  await assert.rejects(incomplete.manager.prepare(), /incomplete/)
  assert.equal(incomplete.manager.status().phase, 'error')
  const wrongVersion = await fixture(t, { files: { 'electron.exe': Buffer.from('fixture'), version: Buffer.from('43.0.0'), 'resources/default_app.asar': Buffer.from('app') } })
  await assert.rejects(wrongVersion.manager.prepare(), /version mismatch/)
})

test('cancelling after archive verification cannot activate a partial extracted component', async t => {
  const f = await fixture(t)
  await assert.rejects(f.manager.prepare({ onProgress: status => { if (status.phase === 'extracting') f.manager.cancel() } }), /cancel/i)
  assert.equal(f.manager.status().phase, 'cancelled')
  assert.deepEqual(await readdir(join(f.root, 'components')), [])
  assert.deepEqual(await readdir(join(f.root, 'cache')), [])
  await f.manager.prepare()
  assert.equal(f.manager.status().phase, 'ready')
})

test('archive extractor preserves ordinary framework link metadata', { skip: process.platform === 'win32' ? 'Unix symlink and executable-mode acceptance requires a native Unix runner' : false }, async t => {
  const { extractBrowserComponentArchive } = await import(modulePath)
  const f = await fixture(t)
  const archive = join(f.root, 'framework.zip')
  const stage = join(f.root, 'framework')
  await mkdir(stage)
  await writeFile(archive, zipSync({ 'Versions/A/binary': [Buffer.from('executable'), { os: 3, attrs: 0x81ed0000 }], 'Versions/Current': [Buffer.from('A'), { os: 3, attrs: 0xa1ff0000 }] }))
  await extractBrowserComponentArchive(archive, stage)
  assert.equal(await readlink(join(stage, 'Versions/Current')), 'A')
  assert.equal((await stat(join(stage, 'Versions/A/binary'))).mode & 0o777, 0o755)
})
