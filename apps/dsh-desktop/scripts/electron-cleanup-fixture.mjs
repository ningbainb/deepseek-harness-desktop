import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function terminateOwnedProcess(child) {
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) throw new Error('Electron test process identity is unavailable')
  if (child.exitCode !== null && child.exitCode !== undefined) return
  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else child.kill('SIGKILL')
}

export async function closeIsolatedElectron(instance, {
  timeoutMs = 45_000,
  terminate = terminateOwnedProcess,
} = {}) {
  if (!instance) return
  const child = instance.process()
  let timer
  const expired = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('isolated Electron cleanup exceeded its deadline')), timeoutMs)
  })
  try {
    await Promise.race([Promise.resolve().then(() => instance.close()), expired])
  } catch (error) {
    const failures = [error]
    try { await terminate(child) } catch (terminationError) { failures.push(terminationError) }
    throw new AggregateError(failures, 'isolated Electron cleanup failed', { cause: error })
  } finally {
    clearTimeout(timer)
  }
}
