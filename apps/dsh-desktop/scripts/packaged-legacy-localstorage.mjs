import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { terminateChildProcessTree } from '../src/runtime-controller.mjs'

const require = createRequire(import.meta.url)
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const HELPER_SCRIPT = join(SCRIPT_DIRECTORY, 'seed-legacy-localstorage.cjs')
const OUTPUT_LIMIT = 4_096

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} is required`)
  return value
}

function validPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65_535
}

function validResult(value, mode) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.mode === mode
    && typeof value.found === 'boolean'
    && (value.found === false || (typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(value.sha256)
      && Number.isSafeInteger(value.bytes) && value.bytes >= 0))
}

function electronExecutable() {
  const executable = require('electron')
  if (typeof executable !== 'string' || executable.length === 0) throw new Error('test Electron executable is unavailable')
  return executable
}

async function runHelper({ mode, userData, port, resultPath, sourcePath, timeoutMs = 30_000 }) {
  requiredText(userData, 'legacy localStorage user data path')
  requiredText(resultPath, 'legacy localStorage result path')
  if (!['seed', 'read'].includes(mode)) throw new TypeError('legacy localStorage mode is invalid')
  if (!validPort(port)) throw new TypeError('legacy localStorage port is invalid')
  if (mode === 'seed') requiredText(sourcePath, 'legacy localStorage source path')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new TypeError('legacy localStorage timeout is invalid')
  await rm(resultPath, { force: true })
  let child
  let timeout
  let output = ''
  const appendOutput = (chunk) => { output = `${output}${chunk.toString('utf8')}`.slice(-OUTPUT_LIMIT) }
  try {
    child = spawn(electronExecutable(), [HELPER_SCRIPT, ...(mode === 'seed' ? [sourcePath] : [])], {
      env: {
        ...process.env,
        DSH_DESKTOP_E2E_LEGACY_MODE: mode,
        DSH_DESKTOP_E2E_LEGACY_USER_DATA: resolve(userData),
        DSH_DESKTOP_E2E_LEGACY_PORT: String(port),
        DSH_DESKTOP_E2E_LEGACY_RESULT: resolve(resultPath),
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout.on('data', appendOutput)
    child.stderr.on('data', appendOutput)
    let timedOut = false
    timeout = setTimeout(() => {
      timedOut = true
      void terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
    }, timeoutMs)
    timeout.unref()
    const { code, signal } = await new Promise((resolveExit, rejectExit) => {
      child.once('error', rejectExit)
      child.once('exit', (exitCode, exitSignal) => resolveExit({ code: exitCode, signal: exitSignal }))
    })
    if (timedOut) throw new Error(`legacy localStorage ${mode} helper timed out after ${timeoutMs}ms`)
    if (code !== 0) throw new Error(`legacy localStorage ${mode} helper exited code=${String(code)} signal=${String(signal)}: ${output || '(empty)'}`)
    const result = JSON.parse(await readFile(resultPath, 'utf8'))
    if (!validResult(result, mode)) throw new Error(`legacy localStorage ${mode} helper wrote an invalid result`)
    return Object.freeze(result)
  } finally {
    clearTimeout(timeout)
    if (child?.exitCode === null) await terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
    await rm(resultPath, { force: true }).catch(() => {})
  }
}

export function seedPackagedLegacyLocalStorage({ userData, port, sourcePath, resultPath, timeoutMs } = {}) {
  return runHelper({ mode: 'seed', userData, port, sourcePath, resultPath, timeoutMs })
}

export function readPackagedLegacyLocalStorage({ userData, port, resultPath, timeoutMs } = {}) {
  return runHelper({ mode: 'read', userData, port, resultPath, timeoutMs })
}
