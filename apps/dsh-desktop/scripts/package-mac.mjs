import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { prepareReleaseDirectory } from './prepare-release-directory.mjs'

const APP_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ELECTRON_BUILDER_BIN = join(APP_DIRECTORY, 'node_modules', '.bin', 'electron-builder')

export function assertDarwinPackHost(platform = process.platform) {
  if (platform !== 'darwin') throw new Error('pack:mac only runs on macOS')
}

export function parsePackMacArguments(argv) {
  return { dir: argv.includes('--dir') }
}

export function electronBuilderCommand() {
  return ELECTRON_BUILDER_BIN
}

export function electronBuilderArgs(argv = []) {
  const extra = argv.filter((argument) => argument !== '--dir')
  const args = ['--mac', '--arm64', '--publish', 'never']
  if (argv.includes('--dir')) args.push('--dir')
  args.push(...extra)
  return args
}

export function packEnvironment(env = process.env) {
  const userAgent = env.npm_config_user_agent
  return {
    ...env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    // electron-builder looks in the app directory for pnpm-lock.yaml. Direct
    // node invocation has no user-agent, so it would collect modules as npm
    // and drop optional darwin natives (sharp / koffi / lightningcss).
    npm_config_user_agent: typeof userAgent === 'string' && userAgent.includes('pnpm')
      ? userAgent
      : 'pnpm/11.22.0 npm/? node/? darwin arm64',
  }
}

function spawnProcess(command, args, env) {
  return spawn(command, args, {
    cwd: APP_DIRECTORY,
    env,
    stdio: 'inherit',
    shell: false,
  })
}

function run(command, args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawnProcess(command, args, env)
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

export async function packMac({
  argv = process.argv.slice(2),
  platform = process.platform,
  runCommand = run,
  prepare = prepareReleaseDirectory,
} = {}) {
  assertDarwinPackHost(platform)
  await prepare()
  await runCommand(electronBuilderCommand(), electronBuilderArgs(argv), packEnvironment())
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await packMac()
}
