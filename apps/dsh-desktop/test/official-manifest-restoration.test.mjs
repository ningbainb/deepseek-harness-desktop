import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import afterPack from '../scripts/after-pack.cjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-manifest-provenance-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceRoot = join(root, 'source')
  const nodeModulesRoot = join(root, 'staging', 'node_modules')
  const target = join(nodeModulesRoot, '@deepseek-ai', 'dsh')
  const manifest = { name: '@deepseek-ai/dsh', version: '0.2.2-rc.3', scripts: {}, bin: { dsh: 'lib/bin.js' } }
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  const bin = Buffer.from('export const official = true\n')
  for (const dir of [sourceRoot, target]) {
    await mkdir(join(dir, 'lib'), { recursive: true })
    await writeFile(join(dir, 'package.json'), bytes)
    await writeFile(join(dir, 'lib', 'bin.js'), bin)
  }
  const evidence = { runtime: { packageName: manifest.name, version: manifest.version, files: { 'package.json': hash(bytes), 'lib/bin.js': hash(bin) } } }
  return { root, sourceRoot, nodeModulesRoot, target, manifest, bytes, evidence }
}

test('restores exact official bytes after builder removes only empty scripts; repeat is idempotent', async t => {
  const f = await fixture(t)
  const { scripts, ...normalized } = f.manifest
  await writeFile(join(f.target, 'package.json'), JSON.stringify(normalized, null, 2))
  assert.equal(await afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, f), true)
  assert.deepEqual(await readFile(join(f.target, 'package.json')), f.bytes)
  assert.equal(await afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, f), false)
})

test('rejects unknown target manifest and executable tampering without writing', async t => {
  for (const file of ['package.json', 'lib/bin.js']) {
    const f = await fixture(t)
    const changed = file === 'package.json' ? JSON.stringify({ ...f.manifest, unknown: true }) : 'tampered JavaScript'
    await writeFile(join(f.target, file), changed)
    await assert.rejects(() => afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, f), /target|packaged/i)
    assert.equal(await readFile(join(f.target, file), 'utf8'), changed)
  }
})

test('rejects unverified source manifest or executable before restoring staging', async t => {
  for (const file of ['package.json', 'lib/bin.js']) {
    const f = await fixture(t)
    await writeFile(join(f.sourceRoot, file), 'unverified source')
    await assert.rejects(() => afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, f), /source.*(hash|provenance)/i)
    assert.deepEqual(await readFile(join(f.target, 'package.json')), f.bytes)
  }
})

test('rejects a linked target directory even when it points to verified bytes', async t => {
  const f = await fixture(t)
  await rm(f.target, { recursive: true })
  await symlink(f.sourceRoot, f.target, 'junction')
  await assert.rejects(() => afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, f), /link|physical/i)
  assert.deepEqual(await readFile(join(f.sourceRoot, 'package.json')), f.bytes)
})

test('rejects target file hardlinks and targets outside the staging boundary', async t => {
  const f = await fixture(t)
  await assert.rejects(() => afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, { ...f, stagingRoot: join(f.root, 'different-staging') }), /outside physical staging/)
  await rm(join(f.target, 'package.json'))
  await link(join(f.sourceRoot, 'package.json'), join(f.target, 'package.json'))
  await assert.rejects(() => afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, f), /physical without links/)
  assert.deepEqual(await readFile(join(f.sourceRoot, 'package.json')), f.bytes)
})

test('requires source identity independently of its matching evidence hashes', async t => {
  const f = await fixture(t)
  const wrongIdentity = Buffer.from(JSON.stringify({ ...f.manifest, version: 'unverified-version' }))
  await writeFile(join(f.sourceRoot, 'package.json'), wrongIdentity)
  f.evidence.runtime.files['package.json'] = hash(wrongIdentity)
  await assert.rejects(() => afterPack.restoreOfficialRuntimeManifest(f.nodeModulesRoot, f), /source provenance identity mismatch/)
  assert.deepEqual(await readFile(join(f.target, 'package.json')), f.bytes)
})
