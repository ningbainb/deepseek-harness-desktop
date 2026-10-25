import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function validProcessId(pid) {
  return Number.isSafeInteger(pid) && pid > 0
}

async function windowsProcessTable(run) {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId) -Compress"],
  { windowsHide: true, timeout: 5_000, maxBuffer: 4 * 1024 * 1024 })
  const rows = JSON.parse(stdout)
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Windows process inventory is unavailable')
  const seen = new Set()
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.ProcessId) || row.ProcessId < 0
      || !Number.isSafeInteger(row.ParentProcessId) || row.ParentProcessId < 0 || seen.has(row.ProcessId)) {
      throw new Error('Windows process inventory is invalid')
    }
    seen.add(row.ProcessId)
  }
  return rows
}

export async function ownedProcessIds(rootPid, { platform = process.platform, run = execFileAsync } = {}) {
  if (!validProcessId(rootPid)) throw new Error('Electron test process identity is unavailable')
  if (platform !== 'win32') return [rootPid]
  const rows = await windowsProcessTable(run)
  if (!rows.some(row => row.ProcessId === rootPid)) throw new Error('Electron test process identity is absent from the inventory')
  const owned = new Set([rootPid])
  let expanded = true
  while (expanded) {
    expanded = false
    for (const row of rows) {
      if (owned.has(row.ParentProcessId) && !owned.has(row.ProcessId)) {
        owned.add(row.ProcessId)
        expanded = true
      }
    }
  }
  return [...owned]
}

export async function ownedProcessesStopped(owned, {
  platform = process.platform,
  run = execFileAsync,
  kill = (pid, signal) => process.kill(pid, signal),
} = {}) {
  if (!Array.isArray(owned) || owned.length === 0 || !owned.every(validProcessId)) {
    throw new Error('Electron test process identity is unavailable')
  }
  if (platform === 'win32') {
    const running = new Set((await windowsProcessTable(run)).map(row => row.ProcessId))
    return owned.every(pid => !running.has(pid))
  }
  return owned.every(pid => {
    try { kill(pid, 0); return false } catch (error) {
      if (error.code === 'ESRCH') return true
      throw error
    }
  })
}

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
  child: savedChild,
} = {}) {
  if (!instance) return
  const child = savedChild ?? instance.process()
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
