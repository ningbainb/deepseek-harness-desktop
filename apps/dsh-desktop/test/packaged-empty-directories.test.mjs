import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, rmdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import afterPack from '../scripts/after-pack.cjs'
import { assertNativeFixtureStorage } from '../scripts/native-fixture-storage.mjs'

async function fixture(t) {
  const parent = await realpath(tmpdir())
  if (process.platform === 'win32') await assertNativeFixtureStorage({ temporaryDirectory: parent })
  const container = await realpath(await mkdtemp(join(parent, 'dsh-empty-directories-')))
  const root = join(container, 'node_modules')
  await mkdir(root)
  t.after(async () => {
    assert.equal(dirname(container), parent)
    assert.ok(basename(container).startsWith('dsh-empty-directories-'))
    await rm(container, { recursive: true, force: true })
  })
  if (process.platform === 'win32') await assertNativeFixtureStorage({ temporaryDirectory: parent, outputDirectory: container })
  return { root, container }
}
const exists = path => lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
function helper() {
  assert.equal(typeof afterPack.pruneEmptyMaterialDirectories, 'function', 'The guarded empty-directory packaging helper must exist')
  return afterPack.pruneEmptyMaterialDirectories
}

test('runtime pruning removes empty material directories without changing retained files', async t => {
  const f = await fixture(t)
  await mkdir(join(f.root, 'openai/src/nested'), { recursive: true })
  await writeFile(join(f.root, 'openai/src/nested/client.ts'), 'excluded source')
  await writeFile(join(f.root, 'openai/index.js'), 'retained runtime')
  await writeFile(join(f.root, 'openai/LICENSE'), 'retained license')
  const report = await afterPack.prunePackagedRuntime(f.root, { platform: 'win32', arch: 'x64' })
  assert.equal(await exists(join(f.root, 'openai/src')), false, 'An excluded source tree must not leave install-time directory entries')
  assert.equal(await readFile(join(f.root, 'openai/index.js'), 'utf8'), 'retained runtime')
  assert.equal(await readFile(join(f.root, 'openai/LICENSE'), 'utf8'), 'retained license')
  assert.equal(report.removedFiles, 1)
  assert.deepEqual(new Set(report.removedEmptyDirectories), new Set(['openai/src/nested', 'openai/src'].map(path => path.split('/').join(process.platform === 'win32' ? '\\' : '/'))))
})

test('empty-directory pruning uses existing material categories and preserves unknown directories', async t => {
  const f = await fixture(t)
  const eligible = ['openai/src/nested', '@linxin666/dsh-fixture/src/client', 'sdk/examples/empty', 'node-pty/prebuilds/darwin-arm64', 'pnpm/artifacts/exe/dist']
  const unknown = ['es-toolkit/dist/types', 'undici/types', '@linxin666/dsh-fixture/compat/prompt-pilot', 'sdk/cache', 'sdk/src']
  for (const path of [...eligible, ...unknown]) await mkdir(join(f.root, path), { recursive: true })
  const removed = await helper()(f.root, { platform: 'win32', arch: 'x64' })
  assert.ok(removed.length >= eligible.length)
  for (const path of eligible) assert.equal(await exists(join(f.root, path)), false, path)
  for (const path of unknown) assert.equal(await exists(join(f.root, path)), true, path)
  assert.ok(await exists(f.root), 'Retain the supplied package root')
  for (const path of removed) assert.ok(!relative(f.root, resolve(f.root, path)).startsWith('..'))
})

test('the directory helper never removes files or nonempty material directories', async t => {
  const f = await fixture(t)
  await mkdir(join(f.root, 'openai/src/nested'), { recursive: true })
  await writeFile(join(f.root, 'openai/src/nested/LICENSE'), 'preserve all bytes')
  assert.deepEqual(await helper()(f.root, { platform: 'win32', arch: 'x64' }), [])
  assert.equal(await readFile(join(f.root, 'openai/src/nested/LICENSE'), 'utf8'), 'preserve all bytes')
})

test('descendant links preserve external empty material and the link itself', async t => {
  const f = await fixture(t)
  const external = join(f.container, 'external-source')
  await mkdir(join(external, 'nested'), { recursive: true })
  await mkdir(join(f.root, 'openai'))
  const link = join(f.root, 'openai/src')
  await symlink(external, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.deepEqual(await helper()(f.root, { platform: 'win32', arch: 'x64' }), [])
  assert.equal((await lstat(link)).isSymbolicLink(), true)
  assert.equal(await exists(join(external, 'nested')), true)
})

for (const position of ['root', 'ancestor']) {
  test(`a link at the ${position} preserves the complete physical tree`, async t => {
    const f = await fixture(t)
    await mkdir(join(f.root, 'openai/src/nested'), { recursive: true })
    let supplied, physical
    if (position === 'root') {
      physical = join(f.container, 'physical-modules')
      await rename(f.root, physical)
      await symlink(physical, f.root, process.platform === 'win32' ? 'junction' : 'dir')
      supplied = f.root
    } else {
      const external = join(f.container, 'physical-resources')
      await mkdir(external)
      physical = join(external, 'node_modules')
      await rename(f.root, physical)
      const link = join(f.container, 'resources')
      await symlink(external, link, process.platform === 'win32' ? 'junction' : 'dir')
      supplied = join(link, 'node_modules')
    }
    assert.deepEqual(await helper()(supplied, { platform: 'win32', arch: 'x64' }), [])
    assert.equal(await exists(join(physical, 'openai/src/nested')), true)
  })
}

test('a file arriving at atomic rmdir is retained without a recursive fallback', async t => {
  const f = await fixture(t)
  const directory = join(f.root, 'openai/src')
  await mkdir(directory, { recursive: true })
  const file = join(directory, 'late-runtime.js')
  const removed = await helper()(f.root, { platform: 'win32', arch: 'x64' }, async path => {
    if (path === directory) await writeFile(file, 'late file remains')
    await rmdir(path)
  })
  assert.deepEqual(removed, [])
  assert.equal(await readFile(file, 'utf8'), 'late file remains')
})

test('repeated empty-material cleanup is idempotent', async t => {
  const f = await fixture(t)
  await mkdir(join(f.root, 'openai/src/nested'), { recursive: true })
  assert.ok((await helper()(f.root, { platform: 'win32', arch: 'x64' })).length > 0)
  assert.deepEqual(await helper()(f.root, { platform: 'win32', arch: 'x64' }), [])
})

for (const platform of ['darwin', 'linux']) {
  test(`the Windows empty-directory optimization leaves ${platform} payloads unchanged`, async t => {
    const f = await fixture(t)
    await mkdir(join(f.root, 'openai/src/nested'), { recursive: true })
    assert.deepEqual(await helper()(f.root, { platform, arch: 'x64' }), [])
    assert.equal(await exists(join(f.root, 'openai/src/nested')), true)
  })
}
