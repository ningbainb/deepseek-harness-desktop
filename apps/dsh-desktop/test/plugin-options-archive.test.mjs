import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { PLUGIN_OPTIONS_FIXTURE, preparePluginOptionsArchive, verifyPluginOptionsArchive } from '../scripts/plugin-options-archive.mjs'

test('plugin configuration verification pins a public NPM version and its immutable archive integrity', () => {
  assert.equal(PLUGIN_OPTIONS_FIXTURE.name, 'dsh-free-search')
  assert.equal(PLUGIN_OPTIONS_FIXTURE.version, '0.6.6')
  assert.equal(PLUGIN_OPTIONS_FIXTURE.tarball, 'https://registry.npmjs.org/dsh-free-search/-/dsh-free-search-0.6.6.tgz')
  assert.equal(PLUGIN_OPTIONS_FIXTURE.integrity, 'sha512-B3eFTdCdGci6m31Q0CWZi+j2mML2u0HPkIFcdYy1iex4ikDdudH29zGa8gfY4vxG3vmvB4MwwH23j8sKOkj65g==')
  assert.ok(Object.isFrozen(PLUGIN_OPTIONS_FIXTURE))
})

test('archive integrity checks the complete bytes, rejects changes and rejects empty or oversized buffers', () => {
  const contents = Buffer.from('integrity-algorithm-fixture')
  const expected = `sha512-${createHash('sha512').update(contents).digest('base64')}`
  verifyPluginOptionsArchive(contents, expected)
  assert.throws(() => verifyPluginOptionsArchive(Buffer.from('changed'), expected), /integrity mismatch/u)
  assert.throws(() => verifyPluginOptionsArchive(contents), /integrity mismatch/u)
  assert.throws(() => verifyPluginOptionsArchive(Buffer.alloc(0)), /size is invalid/u)
  assert.throws(() => verifyPluginOptionsArchive(Buffer.alloc(PLUGIN_OPTIONS_FIXTURE.maxBytes + 1)), /size is invalid/u)
  assert.throws(() => verifyPluginOptionsArchive('untyped'), TypeError)
})

test('offline archives cannot bypass the pinned digest and are never silently overwritten or downloaded again', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-plugin-options-invalid-'))
  try {
    const archivePath = join(temporary, 'original.tgz')
    await writeFile(archivePath, 'wrong-version')
    await assert.rejects(preparePluginOptionsArchive({ archivePath, download: async () => assert.fail('offline archive must not fall back to a download') }), /integrity mismatch/u)
    assert.equal(await readFile(archivePath, 'utf8'), 'wrong-version')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('fixture downloads use the pinned HTTPS URL without redirects and fail closed on HTTP errors', async () => {
  await assert.rejects(preparePluginOptionsArchive({ download: async (url, options) => {
    assert.equal(url, PLUGIN_OPTIONS_FIXTURE.tarball)
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    return new Response('not found', { status: 404 })
  } }), /HTTP 404/u)
})

test('fixture downloads reject a declared oversized body before reading it', async () => {
  await assert.rejects(preparePluginOptionsArchive({ download: async () => ({
    ok: true,
    headers: new Headers({ 'content-length': String(PLUGIN_OPTIONS_FIXTURE.maxBytes + 1) }),
    get body() { assert.fail('oversized body must not be read') },
  }) }), /size is invalid/u)
})

test('fixture downloads bound actual streaming bytes and cancel an oversized response without a content length', async () => {
  let cancelled = false
  const body = new ReadableStream({
    start(controller) { controller.enqueue(Buffer.alloc(PLUGIN_OPTIONS_FIXTURE.maxBytes + 1)) },
    cancel() { cancelled = true },
  })
  await assert.rejects(preparePluginOptionsArchive({ download: async () => new Response(body) }), /size is invalid/u)
  assert.equal(cancelled, true)
})

test('fixture downloads reject missing or tampered bodies instead of installing them', async () => {
  await assert.rejects(preparePluginOptionsArchive({ download: async () => new Response(null) }), /no body/u)
  await assert.rejects(preparePluginOptionsArchive({ download: async () => new Response('unverified') }), /integrity mismatch/u)
})
