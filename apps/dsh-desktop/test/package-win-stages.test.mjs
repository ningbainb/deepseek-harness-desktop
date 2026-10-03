import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildVerifiedWindowsInstaller } from '../scripts/package-win-stages.mjs'

test('the Windows release command uses packed and unpacked integrity verification before compression', async () => {
  const source = await readFile(new URL('../scripts/package-win.mjs', import.meta.url), 'utf8')
  assert.match(source, /await buildVerifiedWindowsInstaller\(/u)
  assert.match(source, /verifyDirectory: async resources =>/u)
  assert.match(source, /await assertPackagedUpdateIdentity\(join\(resources, 'app-update.yml'\)\)/u)
  assert.match(source, /await verifyPackagedRuntimeSdkIdentity\(resources,[\s\S]*expectedManifest: PACKAGE_MANIFEST,[\s\S]*sourceDirectory: join\(APP_DIRECTORY, 'src'\)/u)
  assert.match(source, /verifyAsarIntegrity\(join\(resources, 'app.asar'\),[\s\S]*requiredFiles: \['runtime-support\/community-plugin-known-issues.json'\]/u)
})

test('Windows builds, verifies and compresses the same directory with the original release arguments', async () => {
  const appDirectory = join('build', 'desktop')
  const calls = []
  const builderArguments = ['--publish', 'never', '--config.publish.channel=beta', '--config.compression=normal']
  await buildVerifiedWindowsInstaller({
    appDirectory,
    builderArguments,
    runBuilder: async args => { calls.push(['builder', args]) },
    verifyDirectory: async resources => { calls.push(['verify', resources]) },
  })
  const appOutDir = join(appDirectory, 'dist', 'win-unpacked')
  assert.deepEqual(calls, [
    ['builder', ['--win', '--dir', ...builderArguments]],
    ['verify', join(appOutDir, 'resources')],
    ['builder', ['--win', 'nsis', '--prepackaged', appOutDir, ...builderArguments]],
  ])
  assert.deepEqual(builderArguments, ['--publish', 'never', '--config.publish.channel=beta', '--config.compression=normal'])
})

test('Windows does not compress or replace an invalid directory after integrity verification fails', async () => {
  const calls = []
  const failure = new Error('unpacked Runtime file integrity mismatch: src/window-chrome.mjs')
  await assert.rejects(buildVerifiedWindowsInstaller({
    appDirectory: 'desktop',
    builderArguments: ['--publish', 'never'],
    runBuilder: async args => { calls.push(args) },
    verifyDirectory: async () => { throw failure },
  }), error => error === failure)
  assert.deepEqual(calls, [['--win', '--dir', '--publish', 'never']])
})

test('Windows does not verify or compress a directory whose build failed', async () => {
  const calls = []
  const failure = new Error('builder failed')
  await assert.rejects(buildVerifiedWindowsInstaller({
    appDirectory: 'desktop',
    builderArguments: [],
    runBuilder: async args => { calls.push(args); throw failure },
    verifyDirectory: async () => { assert.fail('failed build must not be verified') },
  }), error => error === failure)
  assert.deepEqual(calls, [['--win', '--dir']])
})
