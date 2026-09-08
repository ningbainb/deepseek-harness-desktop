import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron } from 'playwright'

import {
  createMemorySample,
  normalizeProcessSnapshot,
  summarizeMemorySamples,
} from './packaged-memory-metrics.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const executeFile = promisify(execFile)
const DEFAULTS = Object.freeze({
  iterations: 3,
  idleMs: 300_000,
  sampleMs: 5_000,
  windowMs: 60_000,
})

function integerArgument(name, fallback, { minimum, maximum }) {
  const prefix = `--${name}=`
  const argument = process.argv.find(value => value.startsWith(prefix))
  const value = Number(argument?.slice(prefix.length) ?? fallback)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`--${name} must be between ${minimum} and ${maximum}`)
  }
  return value
}

const iterations = integerArgument('iterations', DEFAULTS.iterations, { minimum: 1, maximum: 10 })
const idleMs = integerArgument('idle-ms', DEFAULTS.idleMs, { minimum: 10_000, maximum: 900_000 })
const sampleMs = integerArgument('sample-ms', DEFAULTS.sampleMs, { minimum: 1_000, maximum: 60_000 })
const windowMs = integerArgument('window-ms', DEFAULTS.windowMs, { minimum: sampleMs, maximum: idleMs })
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join('dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
if (process.platform !== 'win32') throw new Error('packaged memory measurement currently requires Windows')
if (!existsSync(appPath)) throw new Error(`packaged executable does not exist: ${appPath}`)

const snapshotCommand = [
  "$ErrorActionPreference='Stop';",
  'Get-CimInstance Win32_Process',
  '| Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,Name,CommandLine',
  '| ConvertTo-Json -Compress',
].join(' ')

async function readProcessSnapshot() {
  const { stdout } = await executeFile('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    snapshotCommand,
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    timeout: 15_000,
  })
  return normalizeProcessSnapshot(JSON.parse(stdout))
}

const wait = delayMs => new Promise(resolveWait => setTimeout(resolveWait, delayMs))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-memory-'))
const rounds = []
let activeApplication

try {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const root = join(temporary, `round-${iteration + 1}`)
    const userData = join(root, 'user-data')
    const dshHome = join(root, 'dsh-home')
    await seedPrimaryRuntimePermissionForTest({ userData })
    activeApplication = await electron.launch({
      executablePath: appPath,
      cwd: resolve('.'),
      env: {
        ...process.env,
        DSH_DESKTOP_USER_DATA: userData,
        DSH_DESKTOP_DISABLE_UPDATES: '1',
        DSH_DESKTOP_VERIFY_UPDATER: '0',
        DSH_HOME: dshHome,
        DSH_AGENTS_HOME: join(userData, 'agents'),
      },
    })
    const page = await activeApplication.firstWindow()
    try {
      await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 180_000 })
      await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', {
        state: 'attached',
        timeout: 180_000,
      })
    } catch (error) {
      const log = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
      throw new Error(`${error.message}\nRecent runtime log:\n${log.slice(-8_000)}`, { cause: error })
    }

    const rootProcessId = activeApplication.process().pid
    const startedAt = Date.now()
    const samples = []
    while (Date.now() - startedAt < idleMs) {
      const remainingMs = idleMs - (Date.now() - startedAt)
      await wait(Math.min(sampleMs, remainingMs))
      const elapsedMs = Math.min(idleMs, Date.now() - startedAt)
      samples.push(createMemorySample(await readProcessSnapshot(), rootProcessId, elapsedMs))
    }
    rounds.push(Object.freeze({
      iteration: iteration + 1,
      ...summarizeMemorySamples(samples, { idleMs, windowMs }),
    }))
    await activeApplication.close()
    activeApplication = undefined
  }

  const medianRound = field => {
    const values = rounds.map(round => round[field].median).toSorted((left, right) => left - right)
    return values[Math.floor(values.length / 2)]
  }
  console.log(JSON.stringify({
    appPath,
    iterations,
    idleMs,
    sampleMs,
    windowMs,
    medianOfRoundMedians: {
      totalWorkingSetBytes: medianRound('totalWorkingSetBytes'),
      totalPrivateBytes: medianRound('totalPrivateBytes'),
      runtimeWorkingSetBytes: medianRound('runtimeWorkingSetBytes'),
      processCount: medianRound('processCount'),
    },
    rounds,
  }, null, 2))
} finally {
  await activeApplication?.close().catch(() => {})
  await rm(temporary, { recursive: true, force: true })
}
