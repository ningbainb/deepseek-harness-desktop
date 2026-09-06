import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { prepareReleaseDirectory } from '../scripts/prepare-release-directory.mjs'
import {
  assertDarwinPackHost,
  electronBuilderArgs,
  electronBuilderCommand,
  packEnvironment,
  packMac,
  parsePackMacArguments,
} from '../scripts/package-mac.mjs'
import {
  PRODUCT_FILENAME,
} from '../scripts/verify-package-mac.mjs'
import {
  assertIsolatedSmokePaths,
  assertMacTerminalNatives,
  assertSnapshotUnchanged,
  packagedMacExecutableCandidates,
  packagedMacResourcesPath,
} from '../scripts/verify-packaged-smoke-mac.mjs'

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')

test('pack:mac arguments default to a signed-off unsigned arm64 mac build', () => {
  assert.deepEqual(parsePackMacArguments([]), { dir: false })
  assert.deepEqual(parsePackMacArguments(['--dir']), { dir: true })
  assert.deepEqual(
    electronBuilderArgs([]),
    ['--mac', '--arm64', '--publish', 'never'],
  )
  assert.deepEqual(
    electronBuilderArgs(['--dir']),
    ['--mac', '--arm64', '--publish', 'never', '--dir'],
  )
  assert.equal(packEnvironment({ PATH: '/bin' }).CSC_IDENTITY_AUTO_DISCOVERY, 'false')
  assert.match(packEnvironment({ PATH: '/bin' }).npm_config_user_agent, /pnpm/u)
  assert.equal(
    packEnvironment({ npm_config_user_agent: 'pnpm/11.22.0' }).npm_config_user_agent,
    'pnpm/11.22.0',
  )
  assert.throws(() => assertDarwinPackHost('win32'), /only runs on macOS/u)
  assert.doesNotThrow(() => assertDarwinPackHost('darwin'))
})

test('pack:mac never prepares MinGit or asserts Windows signing', async () => {
  const source = await readFile(join(appDirectory, 'scripts', 'package-mac.mjs'), 'utf8')
  assert.equal(source.includes('prepare:bundled-git'), false)
  assert.equal(source.includes('--assert-signing'), false)
  assert.match(source, /CSC_IDENTITY_AUTO_DISCOVERY/u)
  assert.match(source, /--mac/u)
  assert.match(source, /--arm64/u)
  assert.match(electronBuilderCommand(), /electron-builder$/u)

  const manifest = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
  assert.match(manifest.scripts['pack:dir'], /^pnpm prepare:bundled-git && /u)
  assert.equal(manifest.scripts['pack:mac'], 'node scripts/package-mac.mjs')
  assert.equal(manifest.scripts['pack:mac:dir'], 'node scripts/package-mac.mjs --dir')
  assert.equal(manifest.scripts['pack:smoke:mac'], 'node scripts/verify-packaged-smoke-mac.mjs')

  const calls = []
  await packMac({
    argv: ['--dir'],
    platform: 'darwin',
    prepare: async () => { calls.push('prepare') },
    runCommand: async (command, args, env) => {
      calls.push({ command, args, env })
    },
  })
  assert.equal(calls[0], 'prepare')
  assert.equal(calls[1].command, electronBuilderCommand())
  assert.deepEqual(calls[1].args, electronBuilderArgs(['--dir']))
  assert.equal(calls[1].env.CSC_IDENTITY_AUTO_DISCOVERY, 'false')
  await assert.rejects(packMac({ platform: 'linux', prepare: async () => {} }), /only runs on macOS/u)
})

test('release directory preparation also removes mac staging folders', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-mac-'))
  try {
    await mkdir(join(directory, 'mac-arm64', `${PRODUCT_FILENAME}.app`), { recursive: true })
    await mkdir(join(directory, 'mac', `${PRODUCT_FILENAME}.app`), { recursive: true })
    await writeFile(join(directory, 'keep.txt'), 'keep')
    const removed = await prepareReleaseDirectory(directory)
    assert.equal(removed.includes('mac-arm64'), true)
    assert.equal(removed.includes('mac'), true)
    assert.equal(removed.includes('win-unpacked'), false)
    assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), 'keep')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('mac packaged smoke resolves the .app executable and keeps homes off ~/.dsh', () => {
  const [arm64, intelLayout] = packagedMacExecutableCandidates(appDirectory)
  assert.equal(
    arm64,
    join(appDirectory, 'dist', 'mac-arm64', `${PRODUCT_FILENAME}.app`, 'Contents', 'MacOS', PRODUCT_FILENAME),
  )
  assert.equal(
    intelLayout,
    join(appDirectory, 'dist', 'mac', `${PRODUCT_FILENAME}.app`, 'Contents', 'MacOS', PRODUCT_FILENAME),
  )
  assert.equal(
    packagedMacResourcesPath(arm64),
    join(appDirectory, 'dist', 'mac-arm64', `${PRODUCT_FILENAME}.app`, 'Contents', 'Resources'),
  )

  const realHome = join(tmpdir(), 'real-home')
  assert.throws(
    () => assertIsolatedSmokePaths({
      userData: join(realHome, 'user-data'),
      dshHome: join(realHome, '.dsh'),
      realHome,
    }),
    /must not use the real ~\/\.dsh/u,
  )
  assert.doesNotThrow(() => assertIsolatedSmokePaths({
    userData: join(tmpdir(), 'user-data'),
    dshHome: join(tmpdir(), 'dsh-home'),
    realHome,
  }))
  assert.throws(
    () => assertSnapshotUnchanged(
      { exists: true, mtimeMs: 1, size: 4 },
      { exists: true, mtimeMs: 2, size: 4 },
      'real ~/.dsh',
    ),
    /real ~\/\.dsh changed/u,
  )
})

test('mac packaged smoke requires darwin-arm64 pty natives and rejects MinGit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-smoke-mac-natives-'))
  try {
    const resources = join(root, 'Resources')
    const pty = join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64')
    await mkdir(pty, { recursive: true })
    await writeFile(join(pty, 'pty.node'), 'pty')
    await writeFile(join(pty, 'spawn-helper'), 'helper')
    const modules = join(resources, 'app.asar.unpacked', 'node_modules')
    await mkdir(join(modules, '@img', 'sharp-darwin-arm64'), { recursive: true })
    await mkdir(join(modules, 'lightningcss-darwin-arm64'), { recursive: true })
    await writeFile(join(modules, 'lightningcss-darwin-arm64', 'lightningcss.darwin-arm64.node'), 'css')
    await mkdir(join(modules, '@koromix', 'koffi-darwin-arm64'), { recursive: true })
    await assertMacTerminalNatives(resources)

    await writeFile(join(resources, 'managed-git'), 'mingit')
    await assert.rejects(assertMacTerminalNatives(resources), /must not include bundled MinGit/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
