import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

import YAML from 'yaml'
import sharp from 'sharp'

import afterPack from '../scripts/after-pack.cjs'

const {
  classifyPrunableFile,
  packageSupportsPlatform,
  prunePackagedRuntime,
  restoreRequiredPackagedPeers,
} = afterPack

test('release package constraints retain only the target operating system and architecture', () => {
  const target = { platform: 'win32', arch: 'x64' }
  assert.equal(packageSupportsPlatform({}, target), true)
  assert.equal(packageSupportsPlatform({ os: ['win32'], cpu: ['x64'] }, target), true)
  assert.equal(packageSupportsPlatform({ os: ['linux'], cpu: ['x64'] }, target), false)
  assert.equal(packageSupportsPlatform({ os: ['win32'], cpu: ['arm64'] }, target), false)
  assert.equal(packageSupportsPlatform({ os: ['!win32'] }, target), false)
  assert.equal(packageSupportsPlatform({ os: ['win32', '!darwin'] }, target), true)
})

test('release pruner classifies only non-runtime package files', () => {
  assert.equal(classifyPrunableFile('openai/src/client.ts'), 'published-source')
  assert.equal(classifyPrunableFile('@mistralai/mistralai/packages/example.ts'), 'published-source')
  assert.equal(classifyPrunableFile('zod/v4/index.d.cts'), 'type-declaration')
  assert.equal(classifyPrunableFile('sdk/examples/client/demo.js'), 'development-material')
  assert.equal(classifyPrunableFile('cytoscape-fcose/demo/constraints.gif'), 'development-material')
  assert.equal(classifyPrunableFile('node-pty/prebuilds/win32-arm64/pty.node'), 'foreign-native-binary')
  assert.equal(classifyPrunableFile('node-pty/prebuilds/win32-x64/pty.node'), undefined)
  assert.equal(classifyPrunableFile('pnpm/artifacts/exe/dist/pnpm.mjs'), 'duplicate-runtime-artifact')
  assert.equal(
    classifyPrunableFile('pnpm/dist/vendor/fastlist-0.3.0-x86.exe'),
    'foreign-native-binary',
  )
  assert.equal(classifyPrunableFile('pnpm/dist/pnpm.mjs'), undefined)
  assert.equal(classifyPrunableFile('@deepseek-ai/dsh/lib/index.js'), undefined)
  assert.equal(classifyPrunableFile('pnpm/bin/pnpm.mjs'), undefined)
  assert.equal(
    classifyPrunableFile('@linxin666/dsh-client-ui-task-board/docs/e2e/demo.png'),
    'first-party-source',
  )
  assert.equal(
    classifyPrunableFile('@linxin666/dsh-client-ui-skin-dragon-heir/src/client/art.ts'),
    'first-party-source',
  )
  assert.equal(
    classifyPrunableFile('@linxin666/dsh-client-ui-skin-dragon-heir/artwork/original.png'),
    'first-party-source',
  )
  assert.equal(
    classifyPrunableFile('@linxin666/dsh-client-ui-skin-dragon-heir/preview/light.png'),
    undefined,
  )
  assert.equal(
    classifyPrunableFile('@linxin666/dsh-client-ui-task-board/lib/client.js.map'),
    'source-map',
  )
  assert.equal(
    classifyPrunableFile('@linxin666/dsh-client-ui-task-board/lib/client.js'),
    undefined,
  )
})

test('release pruner removes classified files and preserves runtime entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-prune-'))
  try {
    const fixtures = new Map([
      ['openai/src/client.ts', 'source'],
      ['openai/index.js', 'runtime'],
      ['zod/index.d.cts', 'types'],
      ['node-pty/prebuilds/win32-arm64/pty.node', 'arm64'],
      ['node-pty/prebuilds/win32-x64/pty.node', 'x64'],
      ['@linxin666/dsh-client-ui-task-board/docs/e2e/demo.png', 'docs'],
      ['@linxin666/dsh-client-ui-task-board/lib/client.js', 'runtime'],
      ['@linxin666/dsh-client-ui-skin-dragon-heir/preview/light.png', 'preview'],
      ['@linxin666/dsh-client-ui-skin-dragon-heir/src/client/art.ts', 'source'],
    ])
    for (const [path, content] of fixtures) {
      const absolute = join(root, ...path.split('/'))
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, content)
    }

    const report = await prunePackagedRuntime(root)
    assert.equal(report.removedFiles, 5)
    assert.equal(await readFile(join(root, 'openai', 'index.js'), 'utf8'), 'runtime')
    assert.equal(
      await readFile(join(root, 'node-pty', 'prebuilds', 'win32-x64', 'pty.node'), 'utf8'),
      'x64',
    )
    assert.equal(
      await readFile(join(root, '@linxin666', 'dsh-client-ui-task-board', 'lib', 'client.js'), 'utf8'),
      'runtime',
    )
    assert.equal(
      await readFile(join(root, '@linxin666', 'dsh-client-ui-skin-dragon-heir', 'preview', 'light.png'), 'utf8'),
      'preview',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('release pruner removes complete foreign-platform optional packages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-platform-prune-'))
  try {
    const packages = new Map([
      ['native-linux-x64', { os: ['linux'], cpu: ['x64'] }],
      ['native-win-arm64', { os: ['win32'], cpu: ['arm64'] }],
      ['native-win-x64', { os: ['win32'], cpu: ['x64'] }],
      ['portable-runtime', {}],
    ])
    for (const [name, constraints] of packages) {
      const packageRoot = join(root, name)
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name, ...constraints })}\n`)
      await writeFile(join(packageRoot, 'runtime.bin'), name)
    }

    const report = await prunePackagedRuntime(root, { platform: 'win32', arch: 'x64' })

    assert.equal(report.categories['foreign-platform-package'], 4)
    await assert.rejects(readFile(join(root, 'native-linux-x64', 'package.json')), { code: 'ENOENT' })
    await assert.rejects(readFile(join(root, 'native-win-arm64', 'package.json')), { code: 'ENOENT' })
    assert.equal(
      JSON.parse(await readFile(join(root, 'native-win-x64', 'package.json'), 'utf8')).name,
      'native-win-x64',
    )
    assert.equal(
      JSON.parse(await readFile(join(root, 'portable-runtime', 'package.json'), 'utf8')).name,
      'portable-runtime',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('release pruner bounds Skin Center preview dimensions without removing the preview', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-preview-optimize-'))
  try {
    const packageRoot = join(root, '@linxin666', 'dsh-client-ui-skin-center')
    const skinRoot = join(packageRoot, 'skins', 'fixture')
    const previewPath = join(skinRoot, 'preview', 'light.png')
    await mkdir(dirname(previewPath), { recursive: true })
    await writeFile(
      join(packageRoot, 'package.json'),
      '{"name":"@linxin666/dsh-client-ui-skin-center"}\n',
    )
    await writeFile(
      join(skinRoot, 'skin.json'),
      '{"id":"fixture","preview":{"light":"preview/light.png"}}\n',
    )
    await sharp({
      create: {
        width: 2880,
        height: 1800,
        channels: 4,
        background: { r: 45, g: 95, b: 160, alpha: 1 },
      },
    }).png().toFile(previewPath)

    const report = await prunePackagedRuntime(root, { platform: 'win32', arch: 'x64' })
    const metadata = await sharp(previewPath).metadata()

    assert.equal(metadata.width, 1440)
    assert.equal(metadata.height, 900)
    assert.equal(report.optimizedFiles, 1)
    assert.ok(report.optimizedBytes > 0)
    assert.equal(report.optimizations['skin-preview'], 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('release pruner removes the retired skin carrier assets while retaining its manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-retired-skins-'))
  try {
    const carrier = join(root, '@linxin666', 'dsh-skins')
    await mkdir(join(carrier, 'skins', 'legacy'), { recursive: true })
    await writeFile(join(carrier, 'package.json'), '{"name":"@linxin666/dsh-skins"}\n')
    await writeFile(join(carrier, 'skins', 'legacy', 'skin.json'), '{"id":"legacy"}\n')

    const report = await prunePackagedRuntime(root)

    assert.equal(report.categories['retired-skin-assets'], 1)
    await assert.rejects(readFile(join(carrier, 'skins', 'legacy', 'skin.json')), { code: 'ENOENT' })
    assert.equal(
      await readFile(join(carrier, 'package.json'), 'utf8'),
      '{"name":"@linxin666/dsh-skins"}\n',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('release recovery restores pnpm peer snapshots omitted by electron-builder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-peers-'))
  try {
    const restored = await restoreRequiredPackagedPeers(root)
    assert.deepEqual(restored, [
      '@deepseek-ai/dsh-atomic-write',
      '@deepseek-ai/dsh-attachment',
      '@deepseek-ai/dsh-brand',
      '@deepseek-ai/dsh-host-directory-picker',
      '@deepseek-ai/dsh-host-webserver',
      '@deepseek-ai/dsh-sandbox-policy',
      '@deepseek-ai/dsh-settings',
      '@deepseek-ai/dsh-timeout',
      '@deepseek-ai/dsh-typert-protocol',
      '@deepseek-ai/dsh-workspace',
    ])
    for (const packageName of restored) {
      const manifest = JSON.parse(await readFile(join(root, ...packageName.split('/'), 'package.json'), 'utf8'))
      assert.equal(manifest.name, packageName)
    }
    assert.deepEqual(await restoreRequiredPackagedPeers(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Windows packaging uses maximum compression and retains only supported Electron locales', async () => {
  const config = YAML.parse(await readFile(
    resolve(import.meta.dirname, '..', 'electron-builder.yml'),
    'utf8',
  ))
  assert.equal(config.npmRebuild, false)
  assert.equal(config.compression, 'maximum')
  assert.deepEqual(config.electronLanguages, ['en-US', 'zh-CN', 'zh-TW'])
})
