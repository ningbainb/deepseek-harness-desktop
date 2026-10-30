import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import afterPack from '../scripts/after-pack.cjs'

const { pruneNestedElectronLocales } = afterPack

async function fixture(t, { nested = false } = {}) {
  const container = await realpath(await mkdtemp(join(tmpdir(), 'dsh-electron-locales-')))
  const root = nested ? join(container, 'app-out', 'resources', 'app.asar.unpacked', 'node_modules') : container
  t.after(() => rm(container, { recursive: true, force: true }))
  const locales = join(root, 'electron', 'dist', 'locales')
  const files = new Map([
    ['electron/dist/locales/en-US.pak', 'english'], ['electron/dist/locales/zh-CN.pak', 'simplified'],
    ['electron/dist/locales/zh-TW.pak', 'traditional'], ['electron/dist/locales/de.pak', 'german'],
    ['electron/dist/locales/unknown_blob.pak', 'unclassified'], ['electron/dist/locales/LICENSE', 'license'],
    ['electron/dist/electron.exe', 'executable'], ['electron/dist/icudtl.dat', 'icu'],
    ['other-package/locales/de.pak', 'other-locale'],
  ])
  for (const [file, content] of files) {
    await mkdir(dirname(join(root, file)), { recursive: true })
    await writeFile(join(root, file), content)
  }
  return { root, container, locales, files }
}

test('nested Electron retains every Desktop language and fallback while omitting only unused locale data', async t => {
  const f = await fixture(t)
  const report = { removedBytes: 0, removedFiles: 0, categories: {} }
  await pruneNestedElectronLocales(f.root, report, { platform: 'win32', arch: 'x64' }, ['en-US', 'zh-CN', 'zh-TW'])
  await assert.rejects(readFile(join(f.locales, 'de.pak')), { code: 'ENOENT' })
  for (const [file, content] of f.files) {
    if (file === 'electron/dist/locales/de.pak') continue
    assert.equal(await readFile(join(f.root, file), 'utf8'), content, `Retain ${file}`)
  }
  assert.equal(report.removedBytes, Buffer.byteLength('german'))
  assert.equal(report.removedFiles, 1)
  assert.deepEqual(report.categories, { 'unused-electron-locale': 1 })
})

for (const languages of [undefined, [], ['*'], ['../outside'], ['missing'], ['zh-CN', 'missing']]) {
  test(`missing or unsupported locale configuration preserves every file: ${JSON.stringify(languages)}`, async t => {
    const f = await fixture(t)
    const report = { removedBytes: 0, removedFiles: 0, categories: {} }
    await pruneNestedElectronLocales(f.root, report, { platform: 'win32', arch: 'x64' }, languages)
    for (const [file, content] of f.files) assert.equal(await readFile(join(f.root, file), 'utf8'), content)
    assert.deepEqual(report, { removedBytes: 0, removedFiles: 0, categories: {} })
  })
}

for (const platform of ['darwin', 'linux']) {
  test(`Windows locale optimization does not change ${platform} payloads`, async t => {
    const f = await fixture(t)
    const report = { removedBytes: 0, removedFiles: 0, categories: {} }
    await pruneNestedElectronLocales(f.root, report, { platform, arch: 'x64' }, ['en-US'])
    for (const [file, content] of f.files) assert.equal(await readFile(join(f.root, file), 'utf8'), content)
    assert.equal(report.removedFiles, 0)
  })
}

for (const segments of [['electron'], ['electron', 'dist'], ['electron', 'dist', 'locales']]) {
  test(`locale pruning never follows linked ${segments.join('/')} into another tree`, async t => {
    const f = await fixture(t)
    const linked = join(f.root, ...segments)
    const external = join(f.root, 'external-payload')
    await rename(linked, external)
    await symlink(external, linked, process.platform === 'win32' ? 'junction' : 'dir')
    const report = { removedBytes: 0, removedFiles: 0, categories: {} }
    await pruneNestedElectronLocales(f.root, report, { platform: 'win32', arch: 'x64' }, ['en-US'])
    for (const [file, content] of f.files) assert.equal(await readFile(join(f.root, file), 'utf8'), content)
    assert.equal(report.removedFiles, 0)
  })
}

for (const segments of [['resources'], ['resources', 'app.asar.unpacked']]) {
  test(`locale pruning retains bytes below an ancestor junction at ${segments.join('/')}`, async t => {
    const f = await fixture(t, { nested: true })
    const linked = join(f.container, 'app-out', ...segments)
    const external = join(f.container, 'external-tree')
    await rename(linked, external)
    await symlink(external, linked, process.platform === 'win32' ? 'junction' : 'dir')
    const report = { removedBytes: 0, removedFiles: 0, categories: {} }
    await pruneNestedElectronLocales(f.root, report, { platform: 'win32', arch: 'x64' }, ['en-US'])
    for (const [file, content] of f.files) assert.equal(await readFile(join(f.root, file), 'utf8'), content)
    assert.equal(report.removedFiles, 0)
  })
}
