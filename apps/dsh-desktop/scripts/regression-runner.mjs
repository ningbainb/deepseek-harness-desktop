import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'

function terminateProcessTree(child, signal) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // The process exited between the identity check and signal delivery.
    }
  }
}

function nodeArgsFor(suite) {
  return suite.script === '--test' ? ['--test', ...suite.args] : [suite.script, ...suite.args]
}

export function runRegressionSuite({ suite, appDir, env, logDirectory, stdout = process.stdout, stderr = process.stderr }) {
  return new Promise(resolveRun => {
    const startedAt = new Date()
    const startTime = Date.now()
    const logPath = resolve(logDirectory, `${suite.id}.log`)
    const log = createWriteStream(logPath, { flags: 'w' })
    let output = ''
    let timedOut = false
    let settled = false
    let forceTimer
    let cleanupFailureTimer
    const child = spawn(process.execPath, nodeArgsFor(suite), {
      cwd: appDir,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeout = setTimeout(() => {
      timedOut = true
      terminateProcessTree(child, 'SIGTERM')
      forceTimer = setTimeout(() => {
        terminateProcessTree(child, 'SIGKILL')
        cleanupFailureTimer = setTimeout(() => finish({ signal: 'CLEANUP_TIMEOUT', cleanupStatus: 'failed' }), 2_000)
        cleanupFailureTimer.unref()
      }, suite.cleanupTimeoutMs)
      forceTimer.unref()
    }, suite.timeoutMs)
    timeout.unref()

    const append = (chunk, destination) => {
      const text = chunk.toString()
      output = (output + text).slice(-128_000)
      log.write(text)
      destination.write(chunk)
    }
    child.stdout.on('data', chunk => append(chunk, stdout))
    child.stderr.on('data', chunk => append(chunk, stderr))

    const finish = ({ code = null, signal = null, spawnError = null, cleanupStatus = 'passed' }) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (forceTimer) clearTimeout(forceTimer)
      if (cleanupFailureTimer) clearTimeout(cleanupFailureTimer)
      log.end(() => {
        const endedAt = new Date()
        resolveRun({
          status: timedOut ? 'timed-out' : code === 0 && !spawnError ? 'passed' : 'failed',
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: Date.now() - startTime,
          exitCode: code,
          signal,
          errorCategory: timedOut ? 'timeout' : spawnError ? 'spawn' : code === 0 ? null : 'process-exit',
          error: spawnError?.message ?? null,
          output,
          evidence: [logPath],
          cleanup: { status: cleanupStatus, timeoutMs: suite.cleanupTimeoutMs },
        })
      })
    }
    child.once('error', spawnError => finish({ spawnError }))
    child.once('exit', (code, signal) => finish({ code, signal }))
  })
}
