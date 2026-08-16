import { execFile, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { delimiter, join } from 'node:path'

const READY_LINE = /^dsh web:\s+(http:\/\/\S+)/u
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
export const DEFAULT_STARTUP_TIMEOUT_MS = 120_000

export function validateLoopbackUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(`invalid runtime URL: ${JSON.stringify(value)}`)
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError('runtime URL must use loopback HTTP')
  }
  if (url.username || url.password) throw new TypeError('runtime URL must not contain credentials')
  if (!url.port) throw new TypeError('runtime URL must contain an explicit port')
  return `${url.origin}/`
}

export function parseDshReadyUrl(line) {
  const match = READY_LINE.exec(String(line).trim())
  if (match === null) return undefined
  return validateLoopbackUrl(match[1])
}

export function computeRestartDelay(attempt, maxAttempts = 3) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new TypeError('restart attempt must be non-negative')
  if (attempt >= maxAttempts) return undefined
  return Math.min(15_000, 500 * 3 ** attempt)
}

export function terminateChildProcessTree(
  child,
  {
    platform = process.platform,
    systemRoot = process.env.SystemRoot,
    execFileFn = execFile,
  } = {},
) {
  if (!child || child.exitCode !== null) return Promise.resolve()
  if (platform !== 'win32' || !Number.isInteger(child.pid) || child.pid <= 0) {
    child.kill('SIGTERM')
    return Promise.resolve()
  }
  const executable = systemRoot ? join(systemRoot, 'System32', 'taskkill.exe') : 'taskkill.exe'
  return new Promise((resolve, reject) => {
    execFileFn(
      executable,
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, timeout: 5_000 },
      (error) => error ? reject(error) : resolve(),
    )
  })
}

export async function probeHttpReady(
  url,
  { fetchImpl = fetch, attempts = 30, delayMs = 50, schedule = setTimeout } = {},
) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
      lastError = new Error(`runtime health probe returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => schedule(resolve, delayMs))
  }
  throw new Error(`runtime URL did not accept HTTP requests: ${lastError?.message ?? 'unknown error'}`)
}

function createLineReader(onLine) {
  let buffer = ''
  return {
    write(chunk) {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/u)
      buffer = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    },
    end() {
      if (buffer) onLine(buffer)
      buffer = ''
    },
  }
}

export class DshRuntimeController extends EventEmitter {
  constructor({
    cliPath,
    cwd,
    dshHome,
    executable = process.execPath,
    spawnProcess = spawn,
    logStore,
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    shutdownTimeoutMs = 5_000,
    autoRestart = false,
    probeReady = probeHttpReady,
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
    terminateProcessTree = terminateChildProcessTree,
    pathEntries = [],
    environmentProvider = () => ({}),
  }) {
    super()
    if (!cliPath || !cwd || !dshHome) throw new TypeError('cliPath, cwd, and dshHome are required')
    this.cliPath = cliPath
    this.cwd = cwd
    this.dshHome = dshHome
    this.executable = executable
    this.spawnProcess = spawnProcess
    this.logStore = logStore ?? { append: async () => {} }
    this.startupTimeoutMs = startupTimeoutMs
    this.shutdownTimeoutMs = shutdownTimeoutMs
    this.autoRestart = autoRestart
    this.probeReady = probeReady
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
    this.terminateProcessTree = terminateProcessTree
    this.pathEntries = pathEntries
    if (typeof environmentProvider !== 'function') throw new TypeError('environmentProvider must be a function')
    this.environmentProvider = environmentProvider
    this.child = undefined
    this.readyPromise = undefined
    this.restartTimer = undefined
    this.restartAttempt = 0
    this.manualStop = false
    this.stopResolver = undefined
    this.status = Object.freeze({ state: 'stopped', url: undefined, error: undefined })
  }

  #setStatus(state, details = {}) {
    this.status = Object.freeze({
      state,
      url: details.url,
      error: details.error,
      restartAttempt: this.restartAttempt,
      pid: this.child?.pid,
    })
    this.emit('status', this.status)
  }

  start({ preserveRestartAttempt = false } = {}) {
    if (this.status.state === 'ready') return Promise.resolve(this.status.url)
    if (this.readyPromise) return this.readyPromise
    if (!preserveRestartAttempt) this.restartAttempt = 0
    this.manualStop = false
    this.#setStatus('starting')

    const readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.readyPromise = readyPromise

    const additionalEnvironment = this.environmentProvider() ?? {}
    if (typeof additionalEnvironment !== 'object' || Array.isArray(additionalEnvironment)) {
      const error = new TypeError('runtime environment provider must return an object')
      this.#failBeforeReady(error)
      return readyPromise
    }
    const environment = {
      ...process.env,
      ...additionalEnvironment,
      DSH_HOME: this.dshHome,
      DSH_PROFILE: 'desktop',
      DSH_SKIN_PROFILE: 'desktop',
      ELECTRON_RUN_AS_NODE: '1',
      PATH: [...this.pathEntries, process.env.PATH].filter(Boolean).join(delimiter),
    }
    try {
      this.child = this.spawnProcess(
        this.executable,
        ['--expose-internals', this.cliPath, '--profile', 'desktop', '--port', '0'],
        {
          cwd: this.cwd,
          env: environment,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      )
    } catch (error) {
      this.#failBeforeReady(error)
      return readyPromise
    }

    const stdout = createLineReader((line) => this.#handleLine('stdout', line))
    const stderr = createLineReader((line) => this.#handleLine('stderr', line))
    this.child.stdout?.on('data', (chunk) => stdout.write(chunk))
    this.child.stdout?.on('end', () => stdout.end())
    this.child.stderr?.on('data', (chunk) => stderr.write(chunk))
    this.child.stderr?.on('end', () => stderr.end())
    this.child.once('error', (error) => this.#handleChildError(error))
    this.child.once('exit', (code, signal) => this.#handleExit(code, signal))
    this.startupTimer = this.schedule(() => {
      if (this.status.state !== 'starting') return
      const error = new Error(`DSH runtime did not become ready within ${this.startupTimeoutMs}ms`)
      this.#failBeforeReady(error)
      this.child?.kill('SIGKILL')
    }, this.startupTimeoutMs)
    return readyPromise
  }

  async #handleLine(stream, line) {
    await this.logStore.append(`[${stream}] ${line}`)
    this.emit('line', { stream, line })
    if (stream !== 'stdout' || this.status.state !== 'starting') return
    let url
    try {
      url = parseDshReadyUrl(line)
    } catch (error) {
      this.#failBeforeReady(error)
      this.child?.kill('SIGKILL')
      return
    }
    if (url === undefined) return
    try {
      await this.probeReady(url)
    } catch (error) {
      if (this.status.state === 'starting') {
        this.#failBeforeReady(error)
        this.child?.kill('SIGKILL')
      }
      return
    }
    if (this.status.state !== 'starting') return
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    this.#setStatus('ready', { url })
    this.resolveReady?.(url)
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.readyPromise = undefined
  }

  #failBeforeReady(error) {
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    this.#setStatus('crashed', { error: error.message })
    this.rejectReady?.(error)
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.readyPromise = undefined
  }

  #handleChildError(error) {
    void this.logStore.append(`[process] ${error.message}`)
    if (this.status.state === 'starting') this.#failBeforeReady(error)
  }

  #handleExit(code, signal) {
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    const previousState = this.status.state
    this.child = undefined
    void this.logStore.append(`[process] exited code=${String(code)} signal=${String(signal)}`)

    if (previousState === 'starting' && this.rejectReady) {
      this.#failBeforeReady(new Error(`DSH runtime exited before readiness with code ${String(code)}`))
    }
    if (this.manualStop || previousState === 'stopping') {
      this.#setStatus('stopped')
      this.stopResolver?.()
      this.stopResolver = undefined
      return
    }
    if (previousState !== 'crashed') {
      this.#setStatus('crashed', { error: `runtime exited with code ${String(code)}` })
    }
    if (this.autoRestart) this.#scheduleRestart()
  }

  #scheduleRestart() {
    const delay = computeRestartDelay(this.restartAttempt)
    if (delay === undefined) return
    this.restartAttempt += 1
    this.#setStatus('restarting', { error: this.status.error })
    this.restartTimer = this.schedule(() => {
      this.restartTimer = undefined
      this.start({ preserveRestartAttempt: true }).catch(() => {})
    }, delay)
  }

  async stop() {
    if (this.status.state === 'stopped') return
    this.manualStop = true
    if (this.restartTimer !== undefined) {
      this.cancelSchedule(this.restartTimer)
      this.restartTimer = undefined
    }
    this.#setStatus('stopping')
    const child = this.child
    if (child === undefined || child.exitCode !== null) {
      this.child = undefined
      this.#setStatus('stopped')
      return
    }
    const exited = new Promise((resolve) => {
      this.stopResolver = resolve
    })
    const forceTimer = this.schedule(() => child.kill('SIGKILL'), this.shutdownTimeoutMs)
    try {
      await this.terminateProcessTree(child)
    } catch (error) {
      await this.logStore.append(`[process] process-tree shutdown failed: ${error.message}`)
      child.kill('SIGKILL')
    }
    await exited
    this.cancelSchedule(forceTimer)
  }

  async restart() {
    await this.stop()
    return this.start()
  }
}
