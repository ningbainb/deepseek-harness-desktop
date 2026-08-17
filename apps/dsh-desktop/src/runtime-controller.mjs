import { execFile, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { delimiter, join, win32 } from 'node:path'

import { emitBestEffort } from './best-effort-events.mjs'

const READY_LINE = /^dsh web:\s+(http:\/\/\S+)/u
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
export const DEFAULT_STARTUP_TIMEOUT_MS = 120_000
export const DESKTOP_PROFILE_NAME = 'desktop'
const STABLE_RUNTIME_RESET_MS = 60_000

function runtimeArguments(cliPath, preferredPort) {
  return ['--expose-internals', cliPath, '--profile', DESKTOP_PROFILE_NAME, '--port', String(preferredPort)]
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function createRuntimeInvocation({
  executable,
  cliPath,
  preferredPort = 0,
  platform = process.platform,
  systemRoot = process.env.SystemRoot,
} = {}) {
  if (typeof executable !== 'string' || executable.length === 0) {
    throw new TypeError('runtime executable must be a non-empty path')
  }
  if (typeof cliPath !== 'string' || cliPath.length === 0) {
    throw new TypeError('runtime CLI path must be a non-empty path')
  }
  if (!Number.isInteger(preferredPort) || preferredPort < 0 || preferredPort > 65_535) {
    throw new TypeError('preferred runtime port must be an integer from 0 to 65535')
  }
  const args = runtimeArguments(cliPath, preferredPort)
  if (platform !== 'win32') return { executable, args }

  // Electron is a GUI-subsystem executable and therefore gives its Node-mode
  // DSH child no console to inherit. A hidden PowerShell host supplies one so
  // nested cmd/pwsh/PTY helpers cannot create a visible console window even
  // when a third-party package omits its own windowsHide option.
  const command = [
    `& ${[executable, ...args].map(quotePowerShellLiteral).join(' ')} | ForEach-Object { [Console]::Out.WriteLine($_) }`,
    'exit $LASTEXITCODE',
  ].join('\n')
  return {
    executable: systemRoot
      ? win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      Buffer.from(command, 'utf16le').toString('base64'),
    ],
  }
}

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

export function formatRuntimeExit(code, signal, { platform = process.platform } = {}) {
  if (platform === 'win32' && Number.isInteger(code)) {
    const unsignedCode = code >>> 0
    if (code < 0 || unsignedCode > 0x7FFF_FFFF) {
      const signedCode = unsignedCode > 0x7FFF_FFFF ? unsignedCode - 0x1_0000_0000 : unsignedCode
      const hexadecimalCode = unsignedCode.toString(16).toUpperCase().padStart(8, '0')
      return `runtime exited unexpectedly with Windows code 0x${hexadecimalCode} (signed ${signedCode})`
    }
  }
  if (code !== null && code !== undefined) return `runtime exited unexpectedly with code ${String(code)}`
  if (signal) return `runtime exited unexpectedly from signal ${String(signal)}`
  return 'runtime exited unexpectedly without an exit code'
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
    platform = process.platform,
    systemRoot = process.env.SystemRoot,
    preferredPort = 0,
    onReadyPort = () => {},
    environmentProvider = () => ({}),
    preflight = () => {},
    now = Date.now,
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
    this.platform = platform
    this.systemRoot = systemRoot
    if (!Number.isInteger(preferredPort) || preferredPort < 0 || preferredPort > 65_535) {
      throw new TypeError('preferred runtime port must be an integer from 0 to 65535')
    }
    if (typeof onReadyPort !== 'function') throw new TypeError('runtime ready-port observer must be a function')
    this.preferredPort = preferredPort
    this.onReadyPort = onReadyPort
    if (typeof environmentProvider !== 'function') throw new TypeError('environmentProvider must be a function')
    if (typeof preflight !== 'function') throw new TypeError('runtime preflight must be a function')
    if (typeof now !== 'function') throw new TypeError('runtime clock must be a function')
    this.environmentProvider = environmentProvider
    this.preflight = preflight
    this.now = now
    this.child = undefined
    this.readyPromise = undefined
    this.stopPromise = undefined
    this.failedStartupCleanup = undefined
    this.restartTimer = undefined
    this.restartAttempt = 0
    this.lastCrashFingerprint = undefined
    this.sameCrashCount = 0
    this.readySince = undefined
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
      ...(details.restartBlocked === 'repeated-crash' ? { restartBlocked: details.restartBlocked } : {}),
    })
    emitBestEffort(this, 'status', [this.status], (error) => {
      this.#appendDiagnostic(`[observer] status observer failed: ${this.#errorMessage(error)}`)
    })
  }

  #errorMessage(error) {
    return String(error instanceof Error ? error.message : error).slice(0, 1_000)
  }

  #appendDiagnostic(value) {
    try {
      void Promise.resolve(this.logStore.append(value)).catch(() => {})
    } catch {
      // Diagnostics are best-effort and never own runtime lifecycle progress.
    }
  }

  start({ preserveRestartAttempt = false } = {}) {
    if (this.stopPromise) {
      const stopping = this.stopPromise
      return stopping.then(() => this.start({ preserveRestartAttempt }))
    }
    if (this.status.state === 'ready') return Promise.resolve(this.status.url)
    if (this.readyPromise) return this.readyPromise
    if (this.failedStartupCleanup) {
      const cleanup = this.failedStartupCleanup
      return cleanup.then(() => {
        if (this.manualStop || ['stopping', 'stopped'].includes(this.status.state)) {
          throw new Error('runtime start cancelled because shutdown is in progress')
        }
        return this.start({ preserveRestartAttempt })
      })
    }
    if (!preserveRestartAttempt && this.restartTimer !== undefined) {
      this.cancelSchedule(this.restartTimer)
      this.restartTimer = undefined
    }
    if (!preserveRestartAttempt) {
      this.restartAttempt = 0
      this.lastCrashFingerprint = undefined
      this.sameCrashCount = 0
      this.readySince = undefined
    }
    this.manualStop = false
    this.#setStatus('starting')

    const readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.readyPromise = readyPromise

    try {
      this.preflight()
    } catch (error) {
      this.#failBeforeReady(error)
      return readyPromise
    }

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
      DSH_PROFILE: DESKTOP_PROFILE_NAME,
      DSH_SKIN_PROFILE: DESKTOP_PROFILE_NAME,
      DSH_SKINS_DIR: join(this.dshHome, 'profiles', DESKTOP_PROFILE_NAME, 'node_modules', '@linxin666'),
      ELECTRON_RUN_AS_NODE: '1',
      PATH: [...this.pathEntries, process.env.PATH].filter(Boolean).join(delimiter),
    }
    try {
      const invocation = createRuntimeInvocation({
        executable: this.executable,
        cliPath: this.cliPath,
        platform: this.platform,
        systemRoot: this.systemRoot,
        preferredPort: this.preferredPort,
      })
      const child = this.spawnProcess(
        invocation.executable,
        invocation.args,
        {
          cwd: this.cwd,
          env: environment,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      )
      this.child = child
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
    const child = this.child
    child.once('error', (error) => this.#handleChildError(child, error))
    child.once('exit', (code, signal) => this.#handleExit(child, code, signal))
    this.startupTimer = this.schedule(() => {
      if (this.status.state !== 'starting') return
      const error = new Error(`DSH runtime did not become ready within ${this.startupTimeoutMs}ms`)
      this.#failBeforeReady(error)
    }, this.startupTimeoutMs)
    return readyPromise
  }

  async #handleLine(stream, line) {
    this.#appendDiagnostic(`[${stream}] ${line}`)
    emitBestEffort(this, 'line', [{ stream, line }], (error) => {
      this.#appendDiagnostic(`[observer] line observer failed: ${this.#errorMessage(error)}`)
    })
    if (stream !== 'stdout' || this.status.state !== 'starting') return
    let url
    try {
      url = parseDshReadyUrl(line)
    } catch (error) {
      this.#failBeforeReady(error)
      return
    }
    if (url === undefined) return
    try {
      await this.probeReady(url)
    } catch (error) {
      if (this.status.state === 'starting') {
        this.#failBeforeReady(error)
      }
      return
    }
    if (this.status.state !== 'starting') return
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    const readyPort = Number.parseInt(new URL(url).port, 10)
    this.preferredPort = readyPort
    try {
      void Promise.resolve(this.onReadyPort(readyPort)).catch((error) => {
        this.#appendDiagnostic(`[port] failed to persist preferred port: ${this.#errorMessage(error)}`)
      })
    } catch (error) {
      this.#appendDiagnostic(`[port] failed to persist preferred port: ${this.#errorMessage(error)}`)
    }
    this.#setStatus('ready', { url })
    this.readySince = this.now()
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
    this.#terminateFailedStartupChild()
  }

  #terminateFailedStartupChild() {
    const child = this.child
    if (child === undefined || child.exitCode !== null || this.failedStartupCleanup) return

    let resolveExit
    const exited = new Promise((resolve) => { resolveExit = resolve })
    const onExit = () => resolveExit()
    child.once('exit', onExit)
    if (child.exitCode !== null) {
      child.off('exit', onExit)
      resolveExit()
    }

    const forceTimer = this.schedule(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, this.shutdownTimeoutMs)
    forceTimer?.unref?.()

    let cleanup
    cleanup = exited.finally(() => {
      this.cancelSchedule(forceTimer)
      if (this.failedStartupCleanup === cleanup) this.failedStartupCleanup = undefined
    })
    this.failedStartupCleanup = cleanup

    void Promise.resolve()
      .then(() => this.terminateProcessTree(child))
      .catch((error) => {
        this.#appendDiagnostic(`[process] failed-startup tree shutdown failed: ${error.message}`)
        if (child.exitCode === null) child.kill('SIGKILL')
      })
  }

  #handleChildError(child, error) {
    if (this.child !== child) {
      this.#appendDiagnostic(`[process] stale child error: ${error.message}`)
      return
    }
    this.#appendDiagnostic(`[process] ${error.message}`)
    if (this.status.state === 'starting') this.#failBeforeReady(error)
  }

  #handleExit(child, code, signal) {
    if (this.child !== child) {
      this.#appendDiagnostic(`[process] stale child exited code=${String(code)} signal=${String(signal)}`)
      return
    }
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    const previousState = this.status.state
    const readyDuration = previousState === 'ready' && this.readySince !== undefined
      ? this.now() - this.readySince
      : 0
    this.readySince = undefined
    this.child = undefined
    this.#appendDiagnostic(`[process] exited code=${String(code)} signal=${String(signal)}`)

    if (previousState === 'starting' && this.rejectReady) {
      this.#failBeforeReady(new Error(`DSH runtime exited before readiness with code ${String(code)}`))
    }
    if (this.manualStop || previousState === 'stopping') {
      this.#setStatus('stopped')
      this.stopResolver?.()
      this.stopResolver = undefined
      return
    }

    if (readyDuration >= STABLE_RUNTIME_RESET_MS) {
      this.lastCrashFingerprint = undefined
      this.sameCrashCount = 0
    }
    const fingerprint = `code=${String(code)};signal=${String(signal)}`
    if (fingerprint === this.lastCrashFingerprint) {
      this.sameCrashCount += 1
    } else {
      this.lastCrashFingerprint = fingerprint
      this.sameCrashCount = 1
    }
    const exitError = formatRuntimeExit(code, signal)
    this.#setStatus('crashed', { error: exitError })
    if (!this.autoRestart) return
    if (this.sameCrashCount >= 2) {
      this.#setStatus('crashed', {
        error: `${exitError}. Automatic restart stopped after the same crash repeated to prevent a restart loop; open the runtime logs for details.`,
        restartBlocked: 'repeated-crash',
      })
      this.#appendDiagnostic(`[process] automatic restart circuit opened for ${fingerprint}`)
      return
    }
    this.#scheduleRestart()
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

  stop() {
    if (this.stopPromise) return this.stopPromise
    if (this.status.state === 'stopped') return Promise.resolve()
    let operation
    operation = this.#performStop().finally(() => {
      if (this.stopPromise === operation) this.stopPromise = undefined
    })
    this.stopPromise = operation
    return operation
  }

  async #performStop() {
    this.manualStop = true
    if (this.restartTimer !== undefined) {
      this.cancelSchedule(this.restartTimer)
      this.restartTimer = undefined
    }
    this.#setStatus('stopping')
    if (this.readyPromise) {
      const rejectReady = this.rejectReady
      this.cancelSchedule(this.startupTimer)
      this.startupTimer = undefined
      this.resolveReady = undefined
      this.rejectReady = undefined
      this.readyPromise = undefined
      rejectReady?.(new Error('runtime startup cancelled by stop'))
    }
    if (this.failedStartupCleanup) {
      await this.failedStartupCleanup
      if (this.child === undefined || this.child.exitCode !== null) {
        this.child = undefined
        if (this.status.state !== 'stopped') this.#setStatus('stopped')
        return
      }
    }
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
      this.#appendDiagnostic(`[process] process-tree shutdown failed: ${error.message}`)
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
