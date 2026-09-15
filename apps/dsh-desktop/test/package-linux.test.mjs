import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { prepareReleaseDirectory } from '../scripts/prepare-release-directory.mjs'
import {
  assertLinuxPackHost,
  electronBuilderArgs,
  electronBuilderCommand,
  electronBuilderPublishChannel,
  packEnvironment,
  packLinux,
  parsePackLinuxArguments,
} from '../scripts/package-linux.mjs'
import {
  assertIsolatedLinuxSmokePaths,
  assertLinuxSnapshotUnchanged,
  packagedLinuxExecutable,
  packagedLinuxResourcesPath,
} from '../scripts/verify-packaged-smoke-linux.mjs'

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')

test('pack:linux accepts only Linux and builds x64 without publishing', () => {
  assert.deepEqual(parsePackLinuxArguments([]), { dir: false })
  assert.deepEqual(parsePackLinuxArguments(['--dir']), { dir: true })
  assert.deepEqual(
    electronBuilderArgs([]),
    ['--linux', '--x64', '--publish', 'never', '--config.publish.channel=latest'],
  )
  assert.deepEqual(
    electronBuilderArgs(['--dir'], 'beta'),
    ['--linux', '--x64', '--publish', 'never', '--config.publish.channel=beta', '--dir'],
  )
  assert.equal(electronBuilderPublishChannel('stable'), 'latest')
  assert.equal(electronBuilderPublishChannel('beta'), 'beta')
  assert.match(packEnvironment({ PATH: '/usr/bin' }).npm_config_user_agent, /pnpm/u)
  assert.throws(() => assertLinuxPackHost('win32'), /only runs on Linux/u)
  assert.doesNotThrow(() => assertLinuxPackHost('linux'))
  assert.match(electronBuilderCommand(), /electron-builder$/u)
})

test('pack:linux prepares the release directory before invoking electron-builder', async () => {
  const calls = []
  await packLinux({
    argv: ['--dir'],
    platform: 'linux',
    prepare: async () => { calls.push('prepare') },
    runCommand: async (command, args, env) => calls.push({ command, args, env }),
  })
  assert.equal(calls[0], 'prepare')
  assert.deepEqual(calls[1].args, electronBuilderArgs(['--dir']))
  assert.match(calls[1].env.npm_config_user_agent, /pnpm/u)
  await assert.rejects(packLinux({ platform: 'darwin', prepare: async () => {} }), /only runs on Linux/u)
})

test('release preparation removes only known Linux outputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-linux-'))
  try {
    await mkdir(join(directory, 'linux-unpacked'), { recursive: true })
    await writeFile(join(directory, 'DeepSeek-Harness-Desktop-4.0.0-x86_64.AppImage'), 'appimage')
    await writeFile(join(directory, 'DeepSeek-Harness-Desktop-4.0.0-amd64.deb'), 'deb')
    await writeFile(join(directory, 'latest-linux.yml'), 'metadata')
    await writeFile(join(directory, 'SHA256SUMS-linux.txt'), 'checksums')
    await writeFile(join(directory, 'keep.AppImage'), 'keep')
    const removed = await prepareReleaseDirectory(directory)
    assert.equal(removed.includes('linux-unpacked'), true)
    assert.equal(removed.includes('DeepSeek-Harness-Desktop-4.0.0-x86_64.AppImage'), true)
    assert.equal(removed.includes('DeepSeek-Harness-Desktop-4.0.0-amd64.deb'), true)
    assert.equal(removed.includes('latest-linux.yml'), true)
    assert.equal(removed.includes('SHA256SUMS-linux.txt'), true)
    assert.equal(await readFile(join(directory, 'keep.AppImage'), 'utf8'), 'keep')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Linux smoke paths use linux-unpacked and never real ~/.dsh', () => {
  const executable = packagedLinuxExecutable(appDirectory)
  assert.equal(executable, join(appDirectory, 'dist', 'linux-unpacked', 'deepseek-harness-desktop'))
  assert.equal(packagedLinuxResourcesPath(executable), join(appDirectory, 'dist', 'linux-unpacked', 'resources'))
  const realHome = join(tmpdir(), 'real-linux-home')
  assert.throws(
    () => assertIsolatedLinuxSmokePaths({
      userData: join(realHome, 'user-data'),
      dshHome: join(realHome, '.dsh'),
      realHome,
    }),
    /must not use the real ~\/\.dsh/u,
  )
  assert.doesNotThrow(() => assertIsolatedLinuxSmokePaths({
    userData: join(tmpdir(), 'linux-user-data'),
    dshHome: join(tmpdir(), 'linux-dsh-home'),
    realHome,
  }))
  assert.throws(
    () => assertLinuxSnapshotUnchanged(
      { exists: true, mtimeMs: 1, size: 4 },
      { exists: true, mtimeMs: 2, size: 4 },
      'real ~/.dsh',
    ),
    /real ~\/\.dsh changed/u,
  )
})
