import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { payloadFixture, tinyPE } from './fixtures/electron-payload.mjs'
import { prepareInstallerElectronPayload } from '../scripts/installer-electron-payload.mjs'
import { windowsInstallerTestOptions } from './fixtures/installer-platform.mjs'

const nativeTest = (name, run) => test(name, windowsInstallerTestOptions(), run)

const exec = promisify(execFile)
const helper = resolve(import.meta.dirname, '../build/installer-runtime-restore.ps1')
const exists = path => access(path).then(() => true, () => false)
const expectedDigests = new Map()
const sha = b => createHash('sha256').update(b).digest('hex')
async function compactFixture(t) {
  const fixture = await payloadFixture(t)
  const staged = await prepareInstallerElectronPayload(fixture.app)
  const install = join(fixture.root, "独立 user's install")
  await cp(fixture.app, install, { recursive: true })
  await staged.restore()
  expectedDigests.set(install, sha(await readFile(join(install, 'resources/runtime-reconstruction/manifest.json'))))
  return { ...fixture, install, manifestPath: join(install, 'resources/runtime-reconstruction/manifest.json'),
    target: join(install, 'resources/app.asar.unpacked/node_modules/electron/dist/electron.exe') }
}
const restore = install => exec('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-InstallDirectory', install, '-ExpectedManifestSHA256', expectedDigests.get(install)], { windowsHide: true, timeout: 30_000 })
async function editManifest(f, edit) {
  const m = JSON.parse(await readFile(f.manifestPath, 'utf8'))
  edit(m)
  await writeFile(f.manifestPath, JSON.stringify(m))
  expectedDigests.set(f.install, sha(await readFile(f.manifestPath)))
}
test('the offline installation restoration helper exists', async () => {
  assert.equal(await exists(helper), true, 'Installer commit must restore compacted Electron before success')
})
nativeTest('Windows installation reconstructs independent Electron exactly, including fresh and repeat invocation', async t => {
  const f = await compactFixture(t)
  await restore(f.install)
  assert.deepEqual(await readFile(f.target), tinyPE())
  assert.equal(await readFile(join(f.install, 'resources/app.asar.unpacked/node_modules/electron/dist/icudtl.dat'), 'utf8'), 'same-data')
  await restore(f.install)
  assert.deepEqual(await readFile(f.target), tinyPE())
})
nativeTest('a changed application executable cannot produce a committed runtime', async t => {
  const f = await compactFixture(t)
  await writeFile(join(f.install, 'DeepSeek Harness Desktop.exe'), tinyPE('tampered', 0x11))
  await assert.rejects(restore(f.install), /source.*(?:hash|integrity)|(?:hash|integrity).*source/iu)
  assert.equal(await exists(f.target), false)
})
nativeTest('a changed literal payload cannot produce a runtime', async t => {
  const f = await compactFixture(t)
  await writeFile(join(f.install, 'resources/runtime-reconstruction/electron-literal.bin'), 'broken')
  await assert.rejects(restore(f.install), /literal/iu)
  assert.equal(await exists(f.target), false)
})
for (const [name, edit] of [
  ['traversal target', m => { m.files[0].target = '../outside.dll' }],
  ['arbitrary source', m => { m.files[0].source = 'resources/app.asar' }],
  ['overlapping target ranges', m => { m.files.at(-1).ranges[1].targetOffset = 0 }],
  ['fractional range', m => { m.files.at(-1).ranges[0].length = 1.5 }],
  ['out of bounds source', m => { m.files.at(-1).ranges[1].offset = 2147483647 }],
  ['duplicate target', m => { m.files.push(m.files[0]) }],
]) nativeTest(`invalid ${name} is rejected before reconstruction`, async t => {
  const f = await compactFixture(t)
  await editManifest(f, edit)
  await assert.rejects(restore(f.install), /invalid|unsupported|duplicate|range|path/iu)
  assert.equal(await exists(f.target), false)
  assert.equal(await exists(join(f.root, 'outside.dll')), false)
})
nativeTest('linked target ancestor cannot write into another directory', async t => {
  const f = await compactFixture(t)
  const parent = join(f.install, 'resources/app.asar.unpacked/node_modules/electron/dist')
  const outside = join(f.root, 'outside')
  await mkdir(outside)
  await rm(parent, { recursive: true })
  await symlink(outside, parent, 'junction')
  await assert.rejects(restore(f.install), /link|reparse/iu)
  assert.equal(await exists(join(outside, 'electron.exe')), false)
})
nativeTest('Electron-bearing installation cannot silently succeed with missing metadata', async t => {
  const f = await compactFixture(t)
  await rm(f.manifestPath)
  await assert.rejects(restore(f.install), /manifest.*missing/iu)
})

nativeTest('a trusted installer digest still requires metadata when the entire Electron folder is missing', async t => {
  const f = await compactFixture(t)
  await rm(f.manifestPath)
  await rm(join(f.install, 'resources/app.asar.unpacked/node_modules/electron'), { recursive: true })
  await assert.rejects(restore(f.install), /manifest.*missing/iu)
})

nativeTest('an externally truncated manifest cannot skip required runtime files', async t => {
  const f = await compactFixture(t)
  const m = JSON.parse(await readFile(f.manifestPath, 'utf8'))
  m.files = []
  await writeFile(f.manifestPath, JSON.stringify(m))
  await assert.rejects(restore(f.install), /manifest.*integrity/iu)
  assert.equal(await exists(f.target), false)
})

nativeTest('an existing mismatching runtime target is preserved and rejected', async t => {
  const f = await compactFixture(t)
  await writeFile(f.target, 'unrecognized-existing-file')
  await assert.rejects(restore(f.install), /target.*integrity/iu)
  assert.equal(await readFile(f.target, 'utf8'), 'unrecognized-existing-file')
})
