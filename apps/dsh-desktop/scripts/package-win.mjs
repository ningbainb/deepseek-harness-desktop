import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareReleaseDirectory } from './prepare-release-directory.mjs'
import { buildVerifiedWindowsInstaller } from './package-win-stages.mjs'
import { verifyPackagedRuntimeSdkIdentity } from './packaged-runtime-sdk-identity.mjs'
import { verifyAsarIntegrity } from './verify-asar-integrity.mjs'
import { verifyBrandingAssets } from './verify-branding-assets.mjs'
import { defaultReleaseChannel } from '../src/release-manifest.mjs'
import { assertPackagedUpdateIdentity } from '../src/update-identity.mjs'

const APP_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const WINDOWS_COMMAND_SHELL = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe'
const PACKAGE_MANIFEST = JSON.parse(await readFile(resolve(APP_DIRECTORY, 'package.json'), 'utf8'))
const RELEASE_CHANNEL = defaultReleaseChannel({
  version: PACKAGE_MANIFEST.version,
  configuredChannel: process.env.DSH_DESKTOP_UPDATE_CHANNEL,
})
const UPDATER_CHANNEL = RELEASE_CHANNEL === 'beta' ? 'beta' : 'latest'

export function packEnvironment(env = process.env) {
  const userAgent = env.npm_config_user_agent
  return {
    ...env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    npm_config_user_agent: typeof userAgent === 'string' && userAgent.includes('pnpm')
      ? userAgent
      : 'pnpm/11.22.0 npm/? node/? win32 x64',
  }
}

function spawnProcess(command, args) {
  const env = packEnvironment(process.env)
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    return spawn(WINDOWS_COMMAND_SHELL, ['/d', '/s', '/c', command, ...args], {
      cwd: APP_DIRECTORY,
      env,
      stdio: 'inherit',
      shell: false,
    })
  }
  return spawn(command, args, {
    cwd: APP_DIRECTORY,
    env,
    stdio: 'inherit',
    shell: false,
  })
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawnProcess(command, args)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${signal || `code ${code}`}`))
    })
  })
}

const runtimeSupportEvidence = JSON.parse(await readFile(resolve(APP_DIRECTORY, 'runtime-support/known-good.json'), 'utf8'))
await run(process.execPath, [
  resolve(APP_DIRECTORY, '../../scripts/generate-runtime-support.mjs'),
  '--check',
  '--support-status',
  runtimeSupportEvidence.supportStatus,
])
await run(process.execPath, [
  resolve(APP_DIRECTORY, '../../scripts/generate-runtime-support-matrix.mjs'),
  '--check',
])
await verifyBrandingAssets(APP_DIRECTORY)
await prepareReleaseDirectory()
// prepare:bundled-git
const prepareGitScript = resolve(APP_DIRECTORY, 'scripts/prepare-bundled-git.mjs')
await run(process.execPath, [prepareGitScript])
await run(process.execPath, ['src/release-manifest.mjs', '--assert-signing'])
const electronBuilderCli = resolve(APP_DIRECTORY, 'node_modules/electron-builder/cli.js')
await buildVerifiedWindowsInstaller({
  appDirectory: APP_DIRECTORY,
  builderArguments: [
    '--publish',
    'never',
    `--config.publish.channel=${UPDATER_CHANNEL}`,
    ...process.argv.slice(2),
  ],
  runBuilder: async args => {
    if (existsSync(electronBuilderCli)) await run(process.execPath, [electronBuilderCli, ...args])
    else await run(PNPM_COMMAND, ['exec', 'electron-builder', ...args])
  },
  verifyDirectory: async resources => {
    await assertPackagedUpdateIdentity(join(resources, 'app-update.yml'))
    const identity = await verifyPackagedRuntimeSdkIdentity(resources, {
      expectedManifest: PACKAGE_MANIFEST,
      sourceDirectory: join(APP_DIRECTORY, 'src'),
    })
    const packedFiles = verifyAsarIntegrity(join(resources, 'app.asar'), {
      requiredFiles: ['runtime-support/community-plugin-known-issues.json'],
    })
    process.stdout.write(`verified directory before installer compression: ${identity.runtimeFiles.length} unpacked files, ${packedFiles} packed files, ${identity.consumers.length} SDK consumers\n`)
  },
})
await run(process.execPath, ['src/release-manifest.mjs', '--write', '--directory', 'dist', '--channel', RELEASE_CHANNEL])
await run(process.execPath, ['src/release-manifest.mjs', '--verify', '--directory', 'dist'])
