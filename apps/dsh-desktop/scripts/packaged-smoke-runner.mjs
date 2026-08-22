import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { join } from 'node:path'

import { terminateChildProcessTree } from '../src/runtime-controller.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { parseStartupTimings } from './startup-metrics.mjs'

const OUTPUT_LIMIT = 16_384

export async function runPackagedDesktop({
  appPath,
  userData,
  dshHome,
  agentsHome = join(userData, 'agents'),
  timeoutMs = 180_000,
  requireStartupTimings = true,
  windowsHide = true,
  forceRendererAccessibility = false,
  onSpawn,
}) {
  if (!appPath || !userData || !dshHome) throw new TypeError('appPath, userData, and dshHome are required')
  if (typeof requireStartupTimings !== 'boolean') throw new TypeError('requireStartupTimings must be a boolean')
  if (typeof windowsHide !== 'boolean') throw new TypeError('windowsHide must be a boolean')
  if (typeof forceRendererAccessibility !== 'boolean') throw new TypeError('forceRendererAccessibility must be a boolean')
  if (onSpawn !== undefined && typeof onSpawn !== 'function') throw new TypeError('onSpawn must be a function when provided')
  let output = ''
  let child
  let timeout

  const appendOutput = (chunk) => {
    output = `${output}${chunk.toString('utf8')}`.slice(-OUTPUT_LIMIT)
  }
  const readRuntimeLog = async () => {
    try {
      return await readFile(join(userData, 'logs', 'runtime.log'), 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return ''
      return `runtime log read failed: ${error.message}`
    }
  }
  const diagnostics = async () => {
    const runtimeLog = await readRuntimeLog()
    return `process output:\n${output || '(empty)'}\nruntime log:\n${runtimeLog.slice(-OUTPUT_LIMIT) || '(missing)'}`
  }

  try {
    await seedPrimaryRuntimePermissionForTest({ userData })
    const startedAt = performance.now()
    child = spawn(appPath, forceRendererAccessibility ? ['--force-renderer-accessibility'] : [], {
      env: {
        ...process.env,
        DSH_DESKTOP_USER_DATA: userData,
        DSH_DESKTOP_SMOKE_EXIT: '1',
        DSH_DESKTOP_DISABLE_UPDATES: '1',
        DSH_HOME: dshHome,
        DSH_AGENTS_HOME: agentsHome,
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide,
    })
    child.stdout.on('data', appendOutput)
    child.stderr.on('data', appendOutput)
    const spawnObserver = onSpawn === undefined
      ? undefined
      : Promise.resolve()
        .then(() => onSpawn(Object.freeze({
          processId: child.pid,
          appPath,
          userData,
          dshHome,
          forceRendererAccessibility,
        })))
        .catch(async (error) => {
          await terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
          throw error
        })

    let timedOut = false
    timeout = setTimeout(() => {
      timedOut = true
      void terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
    }, timeoutMs)
    timeout.unref()

    const { code, signal } = await new Promise((resolveExit, rejectExit) => {
      child.once('error', rejectExit)
      child.once('exit', (code, signal) => resolveExit({ code, signal }))
    })
    if (spawnObserver !== undefined) await spawnObserver
    const elapsedMs = Number((performance.now() - startedAt).toFixed(1))
    if (timedOut) throw new Error(`packaged desktop smoke timed out after ${timeoutMs}ms\n${await diagnostics()}`)
    if (code !== 0) {
      throw new Error(
        `packaged desktop smoke exited code=${String(code)} signal=${String(signal)}\n${await diagnostics()}`,
      )
    }

    const runtimeLog = await readRuntimeLog()
    return Object.freeze({
      elapsedMs,
      runtimeLog,
      ...(requireStartupTimings ? { timings: parseStartupTimings(runtimeLog) } : {}),
    })
  } finally {
    clearTimeout(timeout)
    if (child?.exitCode === null) {
      await terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
    }
  }
}
