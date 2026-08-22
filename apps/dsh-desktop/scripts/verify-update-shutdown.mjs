import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const execFileAsync = promisify(execFile)
const desktopRoot = join(import.meta.dirname, '..')
const executablePath = process.env.DSH_DESKTOP_E2E_EXECUTABLE
if (!executablePath) throw new Error('DSH_DESKTOP_E2E_EXECUTABLE is required')

const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-update-shutdown-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
let application

async function settleWithin(promise, timeoutMs, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForRuntimeWindow(application, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (application.process().exitCode !== null) {
      throw new Error(`packaged application exited with code ${application.process().exitCode} before Runtime readiness`)
    }
    const runtimeWindow = application.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (runtimeWindow !== undefined) return runtimeWindow
    await delay(100)
  }
  throw new Error('packaged Runtime window did not become ready before timeout')
}

async function readStartupDiagnostics(userData) {
  const logsDirectory = join(userData, 'logs')
  const logFiles = await readdir(logsDirectory, { withFileTypes: true }).catch(() => [])
  const sections = await Promise.all(logFiles
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const contents = await readFile(join(logsDirectory, entry.name), 'utf8').catch(() => '')
      return `--- ${entry.name} ---\n${contents.slice(-4_000)}`
    }))
  return sections.join('\n')
}

try {
  await seedPrimaryRuntimePermissionForTest({ userData })
  application = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
    },
  })
  try {
    await waitForRuntimeWindow(application, 120_000)
  } catch (error) {
    const diagnostics = await readStartupDiagnostics(userData)
    const windowUrls = application.windows().map((candidate) => candidate.url()).join(', ')
    throw new Error(
      `packaged runtime was not ready before shutdown verification\nwindows: ${windowUrls || '(none)'}\n${diagnostics}`,
      { cause: error },
    )
  }

  const playwrightPid = application.process().pid
  assert.equal(Number.isInteger(playwrightPid) && playwrightPid > 0, true)
  const { stdout: processSnapshotText } = await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress',
    ],
    { timeout: 30_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  )
  const processSnapshot = JSON.parse(processSnapshotText)
  const packagedProcesses = (Array.isArray(processSnapshot) ? processSnapshot : [processSnapshot])
    .filter((entry) => entry.ExecutablePath?.toLocaleLowerCase('en-US') === executablePath.toLocaleLowerCase('en-US'))
  const browserProcesses = packagedProcesses.filter((entry) => {
    const commandLine = entry.CommandLine ?? ''
    const isBrowser = !/(?:^|\s)--type=/iu.test(commandLine)
      && !/(?:^|\s)--expose-internals(?:\s|$)/iu.test(commandLine)
    return isBrowser && (entry.ProcessId === playwrightPid || entry.ParentProcessId === playwrightPid)
  })
  assert.equal(
    browserProcesses.length,
    1,
    `expected one packaged Electron browser process: ${JSON.stringify(packagedProcesses)}`,
  )
  const expectedPid = browserProcesses[0].ProcessId
  const closed = application.waitForEvent('close')
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'),
      '-InstallDirectory',
      dirname(executablePath),
    ],
    {
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        DSH_DESKTOP_USER_DATA: userData,
        DSH_HOME: dshHome,
      },
    },
  )
  await settleWithin(closed, 10_000, 'packaged app did not exit after its validated receipt')

  assert.match(stdout, new RegExp(`receipt-ok pid=${expectedPid}(?:\\r?\\n|$)`, 'u'))
  assert.doesNotMatch(stdout, /receipt-(?:timeout|invalid|pid-timeout|fallback)|stop-error|busy pid=/u)
  assert.equal(stderr.trim(), '')
  console.log(`verified packaged receipt-v2 shutdown and installer PID validation for pid ${expectedPid}`)
} finally {
  await application?.close().catch(() => {})
  await rm(temporary, { recursive: true, force: true })
}
