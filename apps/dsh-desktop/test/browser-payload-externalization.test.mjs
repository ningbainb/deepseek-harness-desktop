import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
const require = createRequire(import.meta.url)
const afterPack = require('../scripts/after-pack.cjs')

test('packaging removes only the second Electron and reports actual bytes while retaining browser and Office', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-external-browser-payload-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const modules = join(root, 'node_modules')
  for (const [name, bytes] of [['electron/dist/electron.exe', 'second-runtime'], ['electron/package.json', '{}'], ['dsh-builtin-browser/lib/index.js', 'browser'], ['@deepseek-ai/dsh-office-kit/lib/index.js', 'office']]) {
    await mkdir(join(modules, name, '..'), { recursive: true })
    await writeFile(join(modules, name), bytes)
  }
  const report = { removedFiles: 0, removedBytes: 0, categories: {} }
  await afterPack.externalizeBrowserElectron(modules, report)
  assert.equal(report.externalBrowserRuntime, true)
  assert.equal(report.externalBrowserRemovedBytes, Buffer.byteLength('second-runtime{}'))
  assert.equal(report.removedFiles, 2)
  await assert.rejects(readFile(join(modules, 'electron/dist/electron.exe')), { code: 'ENOENT' })
  assert.equal(await readFile(join(modules, 'dsh-builtin-browser/lib/index.js'), 'utf8'), 'browser')
  assert.equal(await readFile(join(modules, '@deepseek-ai/dsh-office-kit/lib/index.js'), 'utf8'), 'office')
  await afterPack.externalizeBrowserElectron(modules, report)
  assert.equal(report.removedFiles, 2)
})
