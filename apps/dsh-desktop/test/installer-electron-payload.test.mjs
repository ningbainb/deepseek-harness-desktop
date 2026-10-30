import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { tinyPE, payloadFixture } from './fixtures/electron-payload.mjs'

const moduleURL = new URL('../scripts/installer-electron-payload.mjs', import.meta.url)
const sha = b => createHash('sha256').update(b).digest('hex')
test('offline deduplication generator is available', async () => {
  const exists = await access(moduleURL).then(() => true, () => false)
  assert.equal(exists, true, 'Windows packaging needs a reversible Electron payload generator')
})
test('PE plan restores the exact independent executable without reusing its desktop icon', async () => {
  const { createElectronReusePlan } = await import(moduleURL)
  const source = tinyPE('desktop'), target = tinyPE('generic')
  const plan = createElectronReusePlan(source, target)
  const restored = Buffer.alloc(plan.targetSize)
  for (const r of plan.ranges) (r.kind === 'source' ? source : plan.literal).copy(restored, r.targetOffset, r.offset, r.offset + r.length)
  assert.deepEqual(restored, target)
  assert.equal(plan.targetSHA256, sha(target))
  assert.equal(plan.sourceSHA256, sha(source))
  assert.ok(plan.literal.length < target.length)
  assert.equal(restored.subarray(1536, 1543).toString(), 'generic')
})
test('malformed or overlapping PE images cannot be compacted', async () => {
  const { createElectronReusePlan } = await import(moduleURL)
  assert.throws(() => createElectronReusePlan(Buffer.alloc(24), tinyPE()), /PE/u)
  const malformed = tinyPE()
  malformed.writeUInt32LE(512, 392 + 40 + 20)
  assert.throws(() => createElectronReusePlan(tinyPE(), malformed), /overlap/u)
})

test('NSIS runtime restoration precedes registration and keeps original install steps', async () => {
  const { runtimeInstallerInclude } = await import(moduleURL)
  const core = 'header\n!macro installApplicationFiles\nFile "${UNINSTALLER_OUT_FILE}"\n!macroend\n!macro registryAddInstallInfo\n!macroend\nfooter'
  const result = runtimeInstallerInclude(core)
  assert.ok(result.indexOf('customRestoreRuntime') > result.indexOf('UNINSTALLER_OUT_FILE'))
  assert.ok(result.indexOf('customRestoreRuntime') < result.indexOf('registryAddInstallInfo'))
  assert.match(result, /File "\$\{UNINSTALLER_OUT_FILE\}"/u)
  assert.match(result, /header[\s\S]*footer/u)
  assert.throws(() => runtimeInstallerInclude('missing macro'), /template/u)
})
test('archive staging removes only verified duplicates and restores every original file', async t => {
  const { prepareInstallerElectronPayload } = await import(moduleURL)
  const f = await payloadFixture(t)
  const original = await readFile(join(f.dist, 'electron.exe'))
  const staged = await prepareInstallerElectronPayload(f.app)
  const adapter = JSON.parse(await readFile(staged.builderArguments[0].split('=').slice(1).join('='), 'utf8'))
  assert.equal(adapter.schemaVersion, 2)
  assert.equal(adapter.restorationBytes, 2057, 'Full 2048-byte EXE and 9-byte data must count, without subtracting literals')
  assert.equal(await access(join(f.dist, 'electron.exe')).then(() => true, () => false), false)
  assert.equal(await access(join(f.dist, 'icudtl.dat')).then(() => true, () => false), false)
  assert.equal(await readFile(join(f.dist, 'resources.pak'), 'utf8'), 'different-resources')
  const manifest = JSON.parse(await readFile(join(f.app, 'resources/runtime-reconstruction/manifest.json'), 'utf8'))
  assert.deepEqual(manifest.files.map(x => x.target.split('/').at(-1)).sort(), ['electron.exe', 'icudtl.dat'])
  assert.equal(manifest.files.find(x => x.target.endsWith('/electron.exe')).sha256, sha(original))
  await staged.restore()
  await staged.restore()
  assert.deepEqual(await readFile(join(f.dist, 'electron.exe')), original)
  assert.equal(await readFile(join(f.dist, 'icudtl.dat'), 'utf8'), 'same-data')
})
test('linked runtime source refuses compaction and leaves all runtime files intact', async t => {
  const { prepareInstallerElectronPayload } = await import(moduleURL)
  const f = await payloadFixture(t)
  await mkdir(join(f.root, 'outside'))
  await rm(join(f.app, 'resources.pak'))
  await symlink(join(f.root, 'outside'), join(f.app, 'resources.pak'), 'junction')
  await assert.rejects(prepareInstallerElectronPayload(f.app), /link|regular/u)
  assert.deepEqual(await readFile(join(f.dist, 'electron.exe')), tinyPE())
  assert.equal(await readFile(join(f.dist, 'icudtl.dat'), 'utf8'), 'same-data')
})
