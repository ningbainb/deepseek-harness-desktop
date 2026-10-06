import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { canonicalizeSourceSkinAssets } from '../scripts/prepare-source-skins.mjs'

async function fixture(context, entries) {
  const assetsRoot = await mkdtemp(join(tmpdir(), 'dsh-skin-bytes-'))
  context.after(() => rm(assetsRoot, { recursive: true, force: true }))
  await mkdir(join(assetsRoot, 'fixture'))
  const manifestPath = join(assetsRoot, 'manifest.json')
  const files = []
  for (const entry of entries) {
    files.push({ path: `fixture/${entry.name}`, sha256: createHash('sha256').update(entry.expected).digest('hex') })
    await writeFile(join(assetsRoot, 'fixture', entry.name), entry.actual)
  }
  await writeFile(manifestPath, JSON.stringify({ files }))
  return { assetsRoot, manifestPath }
}

test('source skin preparation restores only the exact pinned newline bytes', async context => {
  const options = await fixture(context, [
    { name: 'skin.css', expected: 'first\nsecond', actual: 'first\r\nsecond\n' },
    { name: 'icon.png', expected: Buffer.from([0, 255, 24]), actual: Buffer.from([0, 255, 24]) },
  ])
  assert.equal(await canonicalizeSourceSkinAssets(options), 1)
  assert.equal(await readFile(join(options.assetsRoot, 'fixture/skin.css'), 'utf8'), 'first\nsecond')
  assert.deepEqual(await readFile(join(options.assetsRoot, 'fixture/icon.png')), Buffer.from([0, 255, 24]))
  assert.equal(await canonicalizeSourceSkinAssets(options), 0)
})

test('source skin preparation rejects real content drift without changing other assets', async context => {
  const options = await fixture(context, [
    { name: 'skin.css', expected: 'first\nsecond', actual: 'first\r\nsecond' },
    { name: 'hooks.mjs', expected: 'original', actual: 'tampered' },
  ])
  await assert.rejects(canonicalizeSourceSkinAssets(options), /hash mismatch: fixture\/hooks.mjs/u)
  assert.equal(await readFile(join(options.assetsRoot, 'fixture/skin.css'), 'utf8'), 'first\r\nsecond')
  assert.equal(await readFile(join(options.assetsRoot, 'fixture/hooks.mjs'), 'utf8'), 'tampered')
})

test('source skin preparation rejects manifest path traversal', async context => {
  const options = await fixture(context, [])
  await writeFile(options.manifestPath, JSON.stringify({ files: [{ path: 'fixture/../../escape', sha256: 'irrelevant' }] }))
  await assert.rejects(canonicalizeSourceSkinAssets(options), /asset path is invalid/u)
})
