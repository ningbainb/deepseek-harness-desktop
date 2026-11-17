import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test from 'node:test'
import { tinyPE } from './fixtures/electron-payload.mjs'
import { prepareInstallerElectronPayload } from '../scripts/installer-electron-payload.mjs'

test('lifecycle scenarios derive every path from their physical QA root', async () => {
  const source = await readFile(new URL('../scripts/verify-installer-lifecycle.mjs', import.meta.url), 'utf8')
  assert.match(source, /const root = await createInstallerLifecycleRoot\(\)/u)
  assert.ok(source.indexOf('const root = await createInstallerLifecycleRoot()') < source.indexOf('prepareBrowserPreflightFixtureResources(root'))
})

test('aliased temporary parents become physical lifecycle roots while production still rejects linked payloads', async t => {
  const { createInstallerLifecycleRoot } = await import('./fixtures/installer-lifecycle-root.mjs')
  const container = await realpath(await mkdtemp(join(tmpdir(), 'dsh-lifecycle-root-test-')))
  t.after(() => rm(container, { recursive: true, force: true }))
  const physical = join(container, 'physical-temp')
  const alias = join(container, 'temporary-alias')
  await mkdir(physical)
  await symlink(physical, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const root = await createInstallerLifecycleRoot(alias)
  assert.equal(dirname(root), physical)
  assert.equal(root, await realpath(root))

  const payload = join(root, 'runtime-payload')
  const electron = join(payload, 'resources/app.asar.unpacked/node_modules/electron')
  await mkdir(join(electron, 'dist'), { recursive: true })
  await writeFile(join(payload, 'DeepSeek Harness Desktop.exe'), tinyPE('desktop'))
  await writeFile(join(electron, 'package.json'), JSON.stringify({ name: 'electron', version: '44.0.0' }))
  await writeFile(join(electron, 'dist/electron.exe'), tinyPE())
  await assert.rejects(prepareInstallerElectronPayload(join(alias, basename(root), 'runtime-payload'), { compactRuntime: false }), /Linked application directory/u)
  const staged = await prepareInstallerElectronPayload(payload, { compactRuntime: false })
  try {
    assert.equal(staged.manifest.completeFiles.some(file => file.target.endsWith('/electron.exe')), true)
    assert.equal(staged.summary.withheldFiles, 0)
  } finally { await staged.restore() }
})
