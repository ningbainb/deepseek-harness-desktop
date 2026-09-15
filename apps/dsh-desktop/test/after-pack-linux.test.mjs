import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import afterPack from '../scripts/after-pack.cjs'

const {
  classifyPrunableFile,
  packageSupportsPlatform,
  packagedNodeModulesRoot,
  packingTargetFromContext,
  prunePackagedRuntime,
} = afterPack

const LINUX_X64 = Object.freeze({ platform: 'linux', arch: 'x64' })

test('linux-x64 packing target and resources layout are explicit', () => {
  assert.deepEqual(
    packingTargetFromContext({ electronPlatformName: 'linux', arch: 1 }),
    LINUX_X64,
  )
  assert.equal(
    packagedNodeModulesRoot({
      electronPlatformName: 'linux',
      appOutDir: '/tmp/linux-unpacked',
    }),
    join('/tmp/linux-unpacked', 'resources', 'app.asar.unpacked', 'node_modules'),
  )
})

test('linux-x64 pruning keeps only matching node-pty and platform packages', async () => {
  assert.equal(classifyPrunableFile('node-pty/prebuilds/linux-x64/pty.node', LINUX_X64), undefined)
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/darwin-arm64/pty.node', LINUX_X64),
    'foreign-native-binary',
  )
  assert.equal(
    classifyPrunableFile('node-pty/third_party/conpty/win10-x64/conpty.dll', LINUX_X64),
    'foreign-native-binary',
  )
  assert.equal(packageSupportsPlatform({ os: ['linux'], cpu: ['x64'] }, LINUX_X64), true)
  assert.equal(packageSupportsPlatform({ os: ['win32'], cpu: ['x64'] }, LINUX_X64), false)

  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-prune-linux-'))
  try {
    for (const [path, content] of [
      ['node-pty/prebuilds/linux-x64/pty.node', 'keep-linux'],
      ['node-pty/prebuilds/darwin-arm64/pty.node', 'drop-mac'],
      ['node-pty/prebuilds/win32-x64/conpty.node', 'drop-win'],
      ['openai/index.js', 'runtime'],
    ]) {
      const absolute = join(root, ...path.split('/'))
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, content)
    }
    const report = await prunePackagedRuntime(root, LINUX_X64)
    assert.equal(report.categories['foreign-native-binary'], 2)
    assert.equal(
      await readFile(join(root, 'node-pty', 'prebuilds', 'linux-x64', 'pty.node'), 'utf8'),
      'keep-linux',
    )
    await assert.rejects(access(join(root, 'node-pty', 'prebuilds', 'darwin-arm64', 'pty.node')), {
      code: 'ENOENT',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Linux native binding restore inventory is complete and afterPack accepts Linux', async () => {
  const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'after-pack.cjs'), 'utf8')
  for (const packageName of [
    '@img/sharp-linux-x64',
    '@img/sharp-libvips-linux-x64',
    '@koromix/koffi-linux-x64',
    '@vscode/ripgrep-linux-x64',
    'lightningcss-linux-x64-gnu',
    'node-addon-require-builtin-linux-x64-gnu',
    '@deepseek-ai/node-addon-system-linux-x64',
  ]) {
    assert.ok(source.includes(packageName), `missing Linux native binding ${packageName}`)
  }
  assert.match(source, /platform !== 'linux'/u)
})
