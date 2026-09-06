import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import afterPack from '../scripts/after-pack.cjs'

const {
  classifyPrunableFile,
  packingTargetFromContext,
  packagedNodeModulesRoot,
  prunePackagedRuntime,
} = afterPack

const DARWIN_ARM64 = Object.freeze({ platform: 'darwin', arch: 'arm64' })

test('darwin-arm64 packing keeps node-pty spawn-helper and prunes foreign prebuilds', () => {
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/darwin-arm64/pty.node', DARWIN_ARM64),
    undefined,
  )
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/darwin-arm64/spawn-helper', DARWIN_ARM64),
    undefined,
  )
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/darwin-x64/pty.node', DARWIN_ARM64),
    'foreign-native-binary',
  )
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/win32-x64/pty.node', DARWIN_ARM64),
    'foreign-native-binary',
  )
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/linux-arm64/pty.node', DARWIN_ARM64),
    'foreign-native-binary',
  )
  assert.equal(
    classifyPrunableFile('node-pty/third_party/conpty/win10-x64/conpty.dll', DARWIN_ARM64),
    'foreign-native-binary',
  )
})

test('default classifyPrunableFile still treats darwin prebuilds as foreign on Windows x64', () => {
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/darwin-arm64/pty.node'),
    'foreign-native-binary',
  )
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/darwin-arm64/spawn-helper'),
    'foreign-native-binary',
  )
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/win32-x64/pty.node'),
    undefined,
  )
  assert.equal(
    classifyPrunableFile('node-pty/prebuilds/win32-arm64/pty.node'),
    'foreign-native-binary',
  )
})

test('electron-builder Arch enum 3 maps to darwin arm64', () => {
  assert.deepEqual(
    packingTargetFromContext({ electronPlatformName: 'darwin', arch: 3 }),
    DARWIN_ARM64,
  )
  assert.deepEqual(
    packingTargetFromContext({ electronPlatformName: 'darwin', arch: 'arm64' }),
    DARWIN_ARM64,
  )
  assert.deepEqual(
    packingTargetFromContext({ electronPlatformName: 'win32', arch: 1 }),
    { platform: 'win32', arch: 'x64' },
  )
})

test('packaged node_modules root uses Contents/Resources on macOS and resources on Windows', () => {
  assert.equal(
    packagedNodeModulesRoot({
      electronPlatformName: 'darwin',
      appOutDir: '/tmp/mac',
      packager: { appInfo: { productFilename: 'DeepSeek Harness Desktop' } },
    }),
    join(
      '/tmp/mac',
      'DeepSeek Harness Desktop.app',
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
    ),
  )
  assert.equal(
    packagedNodeModulesRoot({
      electronPlatformName: 'win32',
      appOutDir: '/tmp/win-unpacked',
    }),
    join('/tmp/win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules'),
  )
})

test('darwin-arm64 pruner keeps spawn-helper and drops foreign node-pty prebuilds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-prune-darwin-'))
  try {
    const fixtures = new Map([
      ['node-pty/prebuilds/darwin-arm64/pty.node', 'keep-pty'],
      ['node-pty/prebuilds/darwin-arm64/spawn-helper', 'keep-helper'],
      ['node-pty/prebuilds/darwin-x64/pty.node', 'drop-x64'],
      ['node-pty/prebuilds/win32-x64/pty.node', 'drop-win'],
      ['node-pty/prebuilds/linux-arm64/pty.node', 'drop-linux'],
      ['openai/index.js', 'runtime'],
    ])
    for (const [path, content] of fixtures) {
      const absolute = join(root, ...path.split('/'))
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, content)
    }

    const report = await prunePackagedRuntime(root, DARWIN_ARM64)
    assert.equal(report.categories['foreign-native-binary'], 3)
    assert.equal(
      await readFile(join(root, 'node-pty', 'prebuilds', 'darwin-arm64', 'pty.node'), 'utf8'),
      'keep-pty',
    )
    assert.equal(
      await readFile(join(root, 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper'), 'utf8'),
      'keep-helper',
    )
    await assert.rejects(
      readFile(join(root, 'node-pty', 'prebuilds', 'darwin-x64', 'pty.node')),
      { code: 'ENOENT' },
    )
    await assert.rejects(
      readFile(join(root, 'node-pty', 'prebuilds', 'win32-x64', 'pty.node')),
      { code: 'ENOENT' },
    )
    assert.equal(await readFile(join(root, 'openai', 'index.js'), 'utf8'), 'runtime')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('afterPack on darwin writes a prune report using the macOS bundle layout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-after-pack-darwin-'))
  try {
    const appOutDir = join(root, 'mac')
    const nodeModules = packagedNodeModulesRoot({
      electronPlatformName: 'darwin',
      appOutDir,
      packager: { appInfo: { productFilename: 'DeepSeek Harness Desktop' } },
    })
    const keepPty = join(nodeModules, 'node-pty', 'prebuilds', 'darwin-arm64', 'pty.node')
    const keepHelper = join(nodeModules, 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper')
    const dropWin = join(nodeModules, 'node-pty', 'prebuilds', 'win32-x64', 'pty.node')
    for (const path of [keepPty, keepHelper, dropWin]) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, 'native')
    }

    await afterPack({
      electronPlatformName: 'darwin',
      arch: 3,
      appOutDir,
      outDir: root,
      packager: { appInfo: { productFilename: 'DeepSeek Harness Desktop' } },
    })

    const report = JSON.parse(await readFile(join(root, 'runtime-prune-report.json'), 'utf8'))
    assert.ok(report.removedFiles >= 1)
    await access(keepPty)
    await access(keepHelper)
    await assert.rejects(access(dropWin), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('afterPack still no-ops on linux so Windows-only early return is not inverted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-after-pack-linux-'))
  try {
    await afterPack({
      electronPlatformName: 'linux',
      arch: 'x64',
      appOutDir: join(root, 'linux-unpacked'),
      outDir: root,
    })
    await assert.rejects(access(join(root, 'runtime-prune-report.json')), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
