import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import afterPack from '../scripts/after-pack.cjs'

const buildRoot = new URL('../build/', import.meta.url)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function temporary(t) {
  const directory = await mkdtemp('E:/DeepSeekHarnessDesktop-Build/temp/skin-asset-refresh-')
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('the shared prepare/pack restore refreshes only the audited Maid hook in an existing package', async t => {
  const root = await temporary(t)
  const packageRoot = join(root, '@linxin666', 'dsh-client-ui-skin-center')
  const manifest = JSON.parse(await readFile(new URL('skin-center-v2-assets.sha256.json', buildRoot), 'utf8'))
  const maid = manifest.files.find(entry => entry.path === 'maid-atelier/hooks.mjs')
  assert.equal(maid.previousSha256, '54394436db0a9dfd51972adbc31c567b1871632cb599e1a8440b87b98401a2d4')
  assert.ok(maid.previousSha256s.includes('e8a9569198f4f2a42970c56810d62cc7f90d4fe153c50b55d8a9c8234219ec3a'))
  const ids = [...new Set(manifest.files.map(entry => entry.path.split('/')[0]))]
  for (const id of ids) await mkdir(join(packageRoot, 'skins', id), { recursive: true })
  const packageJson = JSON.stringify({ version: '0.4.4', files: ids.map(id => `skins/${id}`) })
  await writeFile(join(packageRoot, 'package.json'), packageJson)
  const target = join(packageRoot, 'skins', 'maid-atelier', 'hooks.mjs')
  const assetsRoot = join(root, 'audited-assets')
  await mkdir(join(assetsRoot, 'maid-atelier'), { recursive: true })
  await writeFile(join(assetsRoot, 'maid-atelier', 'hooks.mjs'), 'new audited hook')
  await writeFile(join(assetsRoot, 'maid-atelier', 'skin.css'), 'audited CSS')
  const manifestPath = join(root, 'assets.sha256.json')
  await writeFile(manifestPath, JSON.stringify({ files: [
    { path: 'maid-atelier/hooks.mjs', sha256: digest('new audited hook'), previousSha256: digest('old audited hook') },
    { path: 'maid-atelier/skin.css', sha256: digest('audited CSS') },
  ] }))
  await writeFile(target, 'old audited hook')
  const css = join(packageRoot, 'skins', 'maid-atelier', 'skin.css')
  const custom = join(packageRoot, 'skins', 'maid-atelier', 'custom.txt')
  await writeFile(css, 'existing CSS remains untouched')
  await writeFile(custom, 'user supplement remains untouched')
  assert.deepEqual(await afterPack.restoreBundledSkinAssets(root, { assetsRoot, manifestPath }), ['maid-atelier'])
  assert.equal(await readFile(target, 'utf8'), 'new audited hook')
  assert.equal(await readFile(css, 'utf8'), 'existing CSS remains untouched')
  assert.equal(await readFile(custom, 'utf8'), 'user supplement remains untouched')
  assert.equal(await readFile(join(packageRoot, 'package.json'), 'utf8'), packageJson)
})

async function fixture(t, installed = 'audited old hook') {
  const root = await temporary(t)
  const assetsRoot = join(root, 'assets')
  const skinRoot = join(root, 'skins')
  for (const base of [assetsRoot, skinRoot]) await mkdir(join(base, 'maid-atelier'), { recursive: true })
  const destination = join(skinRoot, 'maid-atelier', 'hooks.mjs')
  const source = join(assetsRoot, 'maid-atelier', 'hooks.mjs')
  const next = 'new hook with ownership-safe cleanup'
  const entry = { path: 'maid-atelier/hooks.mjs', sha256: digest(next), previousSha256: digest('audited old hook') }
  await writeFile(source, next)
  if (installed !== null) await writeFile(destination, installed)
  return { assetsRoot, skinRoot, source, destination, next, entry,
    refresh: () => afterPack.refreshAuditedSkinAsset(assetsRoot, skinRoot, entry) }
}

test('audited file refresh updates the known old digest and leaves a current digest unwritten', async t => {
  const f = await fixture(t)
  assert.equal(await f.refresh(), true)
  assert.equal(await readFile(f.destination, 'utf8'), f.next)
  const timestamp = new Date('2020-01-01T00:00:00Z')
  await utimes(f.destination, timestamp, timestamp)
  const before = await stat(f.destination)
  assert.equal(await f.refresh(), false)
  assert.equal((await stat(f.destination)).mtimeMs, before.mtimeMs)
})

test('audited file refresh refuses unknown modifications and preserves their bytes and mtime', async t => {
  const f = await fixture(t, 'unreviewed user hook')
  f.entry.previousSha256s = [digest('audited first lease hook')]
  const before = await stat(f.destination)
  await assert.rejects(f.refresh(), /refusing.*unrecognized.*maid-atelier\/hooks\.mjs/u)
  assert.equal(await readFile(f.destination, 'utf8'), 'unreviewed user hook')
  assert.equal((await stat(f.destination)).mtimeMs, before.mtimeMs)
})

test('audited file refresh restores a missing hook without replacing sibling files', async t => {
  const f = await fixture(t, null)
  const sibling = join(f.skinRoot, 'maid-atelier', 'skin.css')
  await writeFile(sibling, 'keep existing CSS')
  assert.equal(await f.refresh(), true)
  assert.equal(await readFile(f.destination, 'utf8'), f.next)
  assert.equal(await readFile(sibling, 'utf8'), 'keep existing CSS')
})

test('audited file refresh validates source bytes before changing the installed old file', async t => {
  const f = await fixture(t)
  await writeFile(f.source, 'source hash mismatch')
  await assert.rejects(f.refresh(), /hash mismatch/u)
  assert.equal(await readFile(f.destination, 'utf8'), 'audited old hook')
})

test('audited file refresh rejects a linked skin directory outside its package', async t => {
  const f = await fixture(t)
  const outside = join(await temporary(t), 'foreign-skin')
  await mkdir(outside)
  await writeFile(join(outside, 'hooks.mjs'), 'audited old hook')
  await rm(join(f.skinRoot, 'maid-atelier'), { recursive: true })
  await symlink(outside, join(f.skinRoot, 'maid-atelier'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(f.refresh(), /escapes.*skin root/u)
  assert.equal(await readFile(join(outside, 'hooks.mjs'), 'utf8'), 'audited old hook')
})

test('audited file refresh rejects hard links without changing either linked file', async t => {
  const f = await fixture(t)
  const otherLink = join(await temporary(t), 'other-hook.mjs')
  await link(f.destination, otherLink)
  assert.ok((await stat(f.destination)).nlink > 1)
  await assert.rejects(f.refresh(), /refusing.*hard.link/u)
  assert.equal(await readFile(f.destination, 'utf8'), 'audited old hook')
  assert.equal(await readFile(otherLink, 'utf8'), 'audited old hook')
})

test('audited file refresh accepts a second reviewed old digest without removing the original digest', async t => {
  const f = await fixture(t, 'audited first lease hook')
  f.entry.previousSha256s = [digest('audited first lease hook')]
  assert.equal(await f.refresh(), true)
  assert.equal(await readFile(f.destination, 'utf8'), f.next)
  await writeFile(f.destination, 'audited old hook')
  assert.equal(await f.refresh(), true)
  assert.equal(await readFile(f.destination, 'utf8'), f.next)
})
