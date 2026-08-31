import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareReleaseDirectory } from './prepare-release-directory.mjs'

const APP_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const WINDOWS_COMMAND_SHELL = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe'

function spawnProcess(command, args) {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    return spawn(WINDOWS_COMMAND_SHELL, ['/d', '/s', '/c', command, ...args], {
      cwd: APP_DIRECTORY,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    })
  }
  return spawn(command, args, {
    cwd: APP_DIRECTORY,
    env: process.env,
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

await prepareReleaseDirectory()
await run(PNPM_COMMAND, ['prepare:bundled-git'])
await run(process.execPath, ['src/release-manifest.mjs', '--assert-signing'])
await run(PNPM_COMMAND, [
  'exec',
  'electron-builder',
  '--win',
  'nsis',
  '--publish',
  'never',
  ...process.argv.slice(2),
])
await run(process.execPath, ['src/release-manifest.mjs', '--write', '--directory', 'dist'])
await run(process.execPath, ['src/release-manifest.mjs', '--verify', '--directory', 'dist'])
