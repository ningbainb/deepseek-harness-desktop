import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { delimiter, join, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV,
  isDesktopWorkspaceFileOpenToken,
} from '@linxin666/dsh-desktop-compat/workspace-file-open-policy'
import { emitBestEffort } from './best-effort-events.mjs'
import {
  STARTUP_OUTCOMES,
  STARTUP_PHASES,
  classifyStartupFailure,
  createStartupPhaseRecorder,
} from './startup-phase.mjs'

const READY_LINE = /^dsh web:\s+(http:\/\/\S+)/u
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
export const DEFAULT_STARTUP_TIMEOUT_MS = 120_000
export const DESKTOP_PROFILE_NAME = 'desktop'
const STABLE_RUNTIME_RESET_MS = 60_000
const WINDOWS_CONSOLE_PRELOAD_PATH = fileURLToPath(new URL('./windows-console-preload.cjs', import.meta.url))
const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/iu

function validateRuntimeProfileName(value) {
  if (typeof value !== 'string' || !PROFILE_NAME_PATTERN.test(value)) {
    throw new TypeError('runtime profile name is invalid')
  }
  return value
}

function createWorkspaceFileOpenCapabilityToken() {
  // base64url encodes 32 CSPRNG bytes as the exact opaque token shape shared
  // with the Desktop compat Host route. This value stays in main-process
  // memory and the runtime child's environment only.
  return randomBytes(32).toString('base64url')
}

function validateRuntimePatchFiles(value) {
  if (!Array.isArray(value) || value.length > 8) {
    throw new TypeError('runtime patch files must be an array of at most eight paths')
  }
  const normalized = value.map((path) => {
    if (
      typeof path !== 'string'
      || path.length === 0
      || path.length > 4_096
      || /[\u0000-\u001f\u007f]/u.test(path)
    ) {
      throw new TypeError('runtime patch file path is invalid')
    }
    return path
  })
  return Object.freeze(normalized)
}

function runtimeArguments(cliPath, preferredPort, consolePreloadPath, profileName, patchFiles = []) {
  return [
    '--expose-internals',
    ...(consolePreloadPath ? ['--require', consolePreloadPath] : []),
    cliPath,
    '--profile',
    profileName,
    ...patchFiles.flatMap((path) => ['--patch', path]),
    '--port',
    String(preferredPort),
    '--no-open',
  ]
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function createRuntimeInvocation({
  executable,
  cliPath,
  preferredPort = 0,
  profileName = DESKTOP_PROFILE_NAME,
  patchFiles = [],
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
  const normalizedProfileName = validateRuntimeProfileName(profileName)
  const normalizedPatchFiles = validateRuntimePatchFiles(patchFiles)
  const args = runtimeArguments(
    cliPath,
    preferredPort,
    platform === 'win32' ? WINDOWS_CONSOLE_PRELOAD_PATH : undefined,
    normalizedProfileName,
    normalizedPatchFiles,
  )
  if (platform !== 'win32') return { executable, args }

  // Electron is a GUI-subsystem executable and therefore gives its Node-mode
  // DSH child no console to inherit. A hidden PowerShell host supplies one;
  // the required preload explicitly attaches the GUI-subsystem DSH process
  // to it so restricted-token pwsh children can share it without flashing a
  // new console window. Window suppression belongs to spawn's windowsHide
  // option: PowerShell 5.1 can terminate a GUI-subsystem Node-mode child with
  // 0xFFFFFFFF when -WindowStyle Hidden is also supplied.
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

// Windows terminates the whole tree through `taskkill /T`. POSIX has no such
// flag, so the runtime child is spawned as a process-group leader (`detached`)
// and the signal goes to the negated pid, which reaches every descendant the
// child started. Signalling only the direct child leaves the grandchildren to
// be reparented to pid 1, where nothing ever reaps them.
function signalChildProcessGroup(child, signal, processKill) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return false
  try {
    processKill(-child.pid, signal)
    return true
  } catch (error) {
    // ESRCH means the group is already gone; EPERM means the child never became
    // a group leader. Both fall back to the direct child instead of propagating,
    // so a group that cannot be signalled never turns into no signal at all.
    if (error?.code !== 'ESRCH' && error?.code !== 'EPERM') throw error
    return false
  }
}

export function terminateChildProcessTree(
  child,
  {
    platform = process.platform,
    systemRoot = process.env.SystemRoot,
    execFileFn = execFile,
    processKill = process.kill,
  } = {},
) {
  if (!child || child.exitCode !== null) return Promise.resolve()
  if (platform !== 'win32' || !Number.isInteger(child.pid) || child.pid <= 0) {
    if (!signalChildProcessGroup(child, 'SIGTERM', processKill)) child.kill('SIGTERM')
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

/**
 * Escalation used when the graceful tree shutdown fails or times out. On
 * Windows the graceful path is already `taskkill /F`, so the direct kill is the
 * only remaining lever; on POSIX the escalation has to reach the group too, or
 * the force path leaks exactly the descendants the graceful path just tried to
 * collect.
 */
export function forceKillChildProcessTree(
  child,
  { platform = process.platform, processKill = process.kill } = {},
) {
  if (!child || child.exitCode !== null) return
  if (platform !== 'win32' && signalChildProcessGroup(child, 'SIGKILL', processKill)) return
  child.kill('SIGKILL')
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
    forceTerminateProcessTree = forceKillChildProcessTree,
    pathEntries = [],
    patchFiles = [],
    patchFilesProvider,
    platform = process.platform,
    systemRoot = process.env.SystemRoot,
    preferredPort = 0,
    profileName = DESKTOP_PROFILE_NAME,
    onReadyPort = () => {},
    environmentProvider = () => ({}),
    workspaceFileOpenTokenFactory = createWorkspaceFileOpenCapabilityToken,
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
    this.forceTerminateProcessTree = forceTerminateProcessTree
    this.pathEntries = pathEntries
    this.patchFiles = validateRuntimePatchFiles(patchFiles)
    if (patchFilesProvider !== undefined && typeof patchFilesProvider !== 'function') {
      throw new TypeError('runtime patchFilesProvider must be a function')
    }
    this.patchFilesProvider = patchFilesProvider ?? (() => this.patchFiles)
    this.platform = platform
    this.systemRoot = systemRoot
    this.profileName = validateRuntimeProfileName(profileName)
    if (!Number.isInteger(preferredPort) || preferredPort < 0 || preferredPort > 65_535) {
      throw new TypeError('preferred runtime port must be an integer from 0 to 65535')
    }
    if (typeof onReadyPort !== 'function') throw new TypeError('runtime ready-port observer must be a function')
    this.preferredPort = preferredPort
    this.onReadyPort = onReadyPort
    if (typeof environmentProvider !== 'function') throw new TypeError('environmentProvider must be a function')
    if (typeof workspaceFileOpenTokenFactory !== 'function') {
      throw new TypeError('workspace file open token factory must be a function')
    }
    if (typeof preflight !== 'function') throw new TypeError('runtime preflight must be a function')
    if (typeof now !== 'function') throw new TypeError('runtime clock must be a function')
    this.environmentProvider = environmentProvider
    this.workspaceFileOpenTokenFactory = workspaceFileOpenTokenFactory
    this.preflight = preflight
    this.now = now
    this.startupPhases = createStartupPhaseRecorder({ now })
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
    this.workspaceFileOpenToken = undefined
    this.stopResolver = undefined
    this.status = Object.freeze({ state: 'stopped', url: undefined, error: undefined })
  }

  #redactWorkspaceFileOpenToken(value, token = this.workspaceFileOpenToken) {
    const message = String(value)
    if (!isDesktopWorkspaceFileOpenToken(token) || !message.includes(token)) return message
    return message.replaceAll(token, '[redacted]')
  }

  #setStatus(state, details = {}, redactionToken = this.workspaceFileOpenToken) {
    // Phase transitions are derived here rather than at each call site, so a
    // newly added crash path cannot silently skip them.
    if (state === 'crashed') {
      const active = this.startupPhases.current()
      if (active !== undefined && active !== STARTUP_PHASES.FAILED) {
        this.startupPhases.complete(
          active,
          classifyStartupFailure(details.error) === 'startup-timeout'
            ? STARTUP_OUTCOMES.TIMEOUT
            : STARTUP_OUTCOMES.FAILED,
        )
      }
      this.startupPhases.enter(STARTUP_PHASES.FAILED)
    } else if (state === 'ready') {
      // READY and FAILED are terminal: they stay the current phase instead of
      // being closed, so the UI keeps showing a meaningful final state rather
      // than an empty phase with nowhere to go.
      this.startupPhases.complete(STARTUP_PHASES.RUNTIME_READY)
      this.startupPhases.enter(STARTUP_PHASES.READY)
    }
    // `phase` is a live getter, not a snapshot. It must answer "where is
    // startup right now", because phases advance between status transitions:
    // a single `starting` status spans resolve, spawn and wait-for-ready.
    const startupPhases = this.startupPhases
    this.status = Object.freeze({
      state,
      get phase() {
        return startupPhases.current()
      },
      url: details.url,
      error: details.error === undefined
        ? undefined
        : this.#redactWorkspaceFileOpenToken(details.error, redactionToken),
      restartAttempt: this.restartAttempt,
      pid: this.child?.pid,
      ...(details.restartBlocked === 'repeated-crash' ? { restartBlocked: details.restartBlocked } : {}),
    })
    emitBestEffort(this, 'status', [this.status], (error) => {
      this.#appendDiagnostic(
        `[observer] status observer failed: ${this.#errorMessage(error, redactionToken)}`,
        redactionToken,
      )
    })
  }

  #errorMessage(error, redactionToken = this.workspaceFileOpenToken) {
    return this.#redactWorkspaceFileOpenToken(
      String(error instanceof Error ? error.message : error),
      redactionToken,
    ).slice(0, 1_000)
  }

  #appendDiagnostic(value, redactionToken = this.workspaceFileOpenToken) {
    try {
      void Promise.resolve(this.logStore.append(this.#redactWorkspaceFileOpenToken(value, redactionToken))).catch(() => {})
    } catch {
      // Diagnostics are best-effort and never own runtime lifecycle progress.
    }
  }

  /**
   * Return the current private Host capability only to Electron-main callers.
   * It is intentionally not projected into runtime status or the provider.
   */
  getWorkspaceFileOpenToken() {
    return this.status.state === 'ready' ? this.workspaceFileOpenToken : undefined
  }

  /**
   * Diagnostics projection of the real startup lifecycle.
   *
   * Carries only phase names, timestamps and durations - no capability
   * tokens, no credentials, no absolute paths, no message content - so it is
   * safe to attach to a diagnostics export. This is what lets a support
   * thread answer "where did it hang" from the export alone.
   */
  getStartupPhases() {
    return this.startupPhases.history()
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
    // A restart must never reuse an authority accepted by a previous Host.
    this.workspaceFileOpenToken = undefined
    this.startupPhases.reset()
    this.startupPhases.enter(STARTUP_PHASES.RUNTIME_RESOLVE)
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
    let workspaceFileOpenToken
    try {
      workspaceFileOpenToken = this.workspaceFileOpenTokenFactory()
      if (!isDesktopWorkspaceFileOpenToken(workspaceFileOpenToken)) {
        throw new TypeError('workspace file open token factory returned an invalid token')
      }
    } catch (error) {
      this.#failBeforeReady(error)
      return readyPromise
    }
    this.workspaceFileOpenToken = workspaceFileOpenToken
    const environment = {
      ...process.env,
      ...additionalEnvironment,
      DSH_HOME: this.dshHome,
      DSH_PROFILE: this.profileName,
      DSH_SKIN_PROFILE: this.profileName,
      DSH_SKINS_DIR: join(this.dshHome, 'profiles', this.profileName, 'node_modules', '@linxin666'),
      // Override an ambient parent value. The token is new for every Host
      // spawn and never appears in argv, diagnostics, or public status.
      [DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV]: workspaceFileOpenToken,
      ELECTRON_RUN_AS_NODE: '1',
      PATH: [...this.pathEntries, process.env.PATH].filter(Boolean).join(delimiter),
    }
    try {
      const launchPatchFiles = validateRuntimePatchFiles(this.patchFilesProvider() ?? [])
      const invocation = createRuntimeInvocation({
        executable: this.executable,
        cliPath: this.cliPath,
        platform: this.platform,
        systemRoot: this.systemRoot,
        preferredPort: this.preferredPort,
        profileName: this.profileName,
        patchFiles: launchPatchFiles,
      })
      this.startupPhases.complete(STARTUP_PHASES.RUNTIME_RESOLVE)
      this.startupPhases.enter(STARTUP_PHASES.RUNTIME_SPAWN)
      const child = this.spawnProcess(
        invocation.executable,
        invocation.args,
        {
          cwd: this.cwd,
          env: environment,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          // Makes the child a POSIX process-group leader so shutdown can signal
          // the whole group. Windows keeps its existing semantics: `detached`
          // there means a new console, and `taskkill /T` already walks the tree.
          detached: this.platform !== 'win32',
        },
      )
      this.child = child
      this.startupPhases.complete(STARTUP_PHASES.RUNTIME_SPAWN)
      this.startupPhases.enter(STARTUP_PHASES.RUNTIME_READY)
    } catch (error) {
      this.#failBeforeReady(error)
      return readyPromise
    }

    // Keep the per-child value in these closures. The authority itself is
    // cleared as soon as the child stops, but stdio/error events can arrive
    // after that transition and must still be safe to persist.
    const stdout = createLineReader((line) => this.#handleLine('stdout', line, workspaceFileOpenToken))
    const stderr = createLineReader((line) => this.#handleLine('stderr', line, workspaceFileOpenToken))
    this.child.stdout?.on('data', (chunk) => stdout.write(chunk))
    this.child.stdout?.on('end', () => stdout.end())
    this.child.stderr?.on('data', (chunk) => stderr.write(chunk))
    this.child.stderr?.on('end', () => stderr.end())
    const child = this.child
    child.once('error', (error) => this.#handleChildError(child, error, workspaceFileOpenToken))
    child.once('exit', (code, signal) => this.#handleExit(child, code, signal, workspaceFileOpenToken))
    this.startupTimer = this.schedule(() => {
      if (this.status.state !== 'starting') return
      const error = new Error(`DSH runtime did not become ready within ${this.startupTimeoutMs}ms`)
      this.#failBeforeReady(error)
    }, this.startupTimeoutMs)
    return readyPromise
  }

  async #handleLine(stream, line, redactionToken = this.workspaceFileOpenToken) {
    const sanitizedLine = this.#redactWorkspaceFileOpenToken(line, redactionToken)
    this.#appendDiagnostic(`[${stream}] ${sanitizedLine}`, redactionToken)
    emitBestEffort(this, 'line', [{ stream, line: sanitizedLine }], (error) => {
      this.#appendDiagnostic(
        `[observer] line observer failed: ${this.#errorMessage(error, redactionToken)}`,
        redactionToken,
      )
    })
    if (stream !== 'stdout' || this.status.state !== 'starting') return
    let url
    try {
      url = parseDshReadyUrl(line)
    } catch (error) {
      this.#failBeforeReady(error, redactionToken)
      return
    }
    if (url === undefined) return
    try {
      await this.probeReady(url)
    } catch (error) {
      if (this.status.state === 'starting') {
        this.#failBeforeReady(error, redactionToken)
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
        this.#appendDiagnostic(
          `[port] failed to persist preferred port: ${this.#errorMessage(error, redactionToken)}`,
          redactionToken,
        )
      })
    } catch (error) {
      this.#appendDiagnostic(
        `[port] failed to persist preferred port: ${this.#errorMessage(error, redactionToken)}`,
        redactionToken,
      )
    }
    this.#setStatus('ready', { url }, redactionToken)
    this.readySince = this.now()
    this.resolveReady?.(url)
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.readyPromise = undefined
  }

  #failBeforeReady(error, redactionToken = this.workspaceFileOpenToken) {
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    this.#setStatus('crashed', { error: error.message }, redactionToken)
    this.rejectReady?.(error)
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.readyPromise = undefined
    this.workspaceFileOpenToken = undefined
    this.#terminateFailedStartupChild(redactionToken)
  }

  // Single exit for every SIGKILL escalation, so the POSIX group semantics
  // cannot drift apart from the graceful path in one branch and not another.
  // Every caller is either a timer or a catch block, so an unexpected errno
  // must not escape here: that would take down the app instead of the runtime.
  #forceKillChild(child, redactionToken = this.workspaceFileOpenToken) {
    try {
      this.forceTerminateProcessTree(child, { platform: this.platform })
    } catch (error) {
      this.#appendDiagnostic(
        `[process] force kill failed: ${this.#errorMessage(error, redactionToken)}`,
        redactionToken,
      )
      // The group signal never reached the child, so the direct kill is the
      // last lever left.
      try {
        child.kill('SIGKILL')
      } catch {
        // Nothing left to escalate to; the exit handler still reports the state.
      }
    }
  }

  #terminateFailedStartupChild(redactionToken = this.workspaceFileOpenToken) {
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
      if (child.exitCode === null) this.#forceKillChild(child)
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
        this.#appendDiagnostic(
          `[process] failed-startup tree shutdown failed: ${this.#errorMessage(error, redactionToken)}`,
          redactionToken,
        )
        if (child.exitCode === null) this.#forceKillChild(child)
      })
  }

  #handleChildError(child, error, redactionToken = this.workspaceFileOpenToken) {
    if (this.child !== child) {
      this.#appendDiagnostic(
        `[process] stale child error: ${this.#errorMessage(error, redactionToken)}`,
        redactionToken,
      )
      return
    }
    this.#appendDiagnostic(`[process] ${this.#errorMessage(error, redactionToken)}`, redactionToken)
    if (this.status.state === 'starting') this.#failBeforeReady(error, redactionToken)
  }

  #handleExit(child, code, signal, redactionToken = this.workspaceFileOpenToken) {
    if (this.child !== child) {
      this.#appendDiagnostic(
        `[process] stale child exited code=${String(code)} signal=${String(signal)}`,
        redactionToken,
      )
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
    this.workspaceFileOpenToken = undefined
    this.#appendDiagnostic(`[process] exited code=${String(code)} signal=${String(signal)}`, redactionToken)

    if (previousState === 'starting' && this.rejectReady) {
      this.#failBeforeReady(
        new Error(`DSH runtime exited before readiness with code ${String(code)}`),
        redactionToken,
      )
    }
    if (this.manualStop || previousState === 'stopping') {
      this.#setStatus('stopped', {}, redactionToken)
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
    this.#setStatus('crashed', { error: exitError }, redactionToken)
    if (!this.autoRestart) return
    if (this.sameCrashCount >= 2) {
      this.#setStatus('crashed', {
        error: `${exitError}. Automatic restart stopped after the same crash repeated to prevent a restart loop; open the runtime logs for details.`,
        restartBlocked: 'repeated-crash',
      }, redactionToken)
      this.#appendDiagnostic(`[process] automatic restart circuit opened for ${fingerprint}`, redactionToken)
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

  async forceStop() {
    this.manualStop = true
    const redactionToken = this.workspaceFileOpenToken
    this.workspaceFileOpenToken = undefined
    if (this.restartTimer !== undefined) {
      this.cancelSchedule(this.restartTimer)
      this.restartTimer = undefined
    }
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    const rejectReady = this.rejectReady
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.readyPromise = undefined
    rejectReady?.(new Error('runtime startup cancelled by force stop'))

    const child = this.child
    if (child !== undefined && child.exitCode === null) {
      let timeout
      const boundedTermination = new Promise((resolve) => {
        timeout = this.schedule(resolve, this.shutdownTimeoutMs)
        timeout?.unref?.()
      })
      try {
        await Promise.race([
          Promise.resolve().then(() => this.terminateProcessTree(child)),
          boundedTermination,
        ])
      } catch (error) {
        this.#appendDiagnostic(
          `[process] forced process-tree shutdown failed: ${this.#errorMessage(error, redactionToken)}`,
          redactionToken,
        )
      } finally {
        this.cancelSchedule(timeout)
      }
      if (child.exitCode === null) child.kill('SIGKILL')
      await Promise.resolve()
    }

    if (this.child === child) this.child = undefined
    this.failedStartupCleanup = undefined
    this.stopResolver?.()
    this.stopResolver = undefined
    this.#setStatus('stopped', {}, redactionToken)
  }

  async #performStop() {
    this.manualStop = true
    // Do not retain an authority while shutdown is in progress. The child
    // event handlers captured it separately for redaction of late output.
    const redactionToken = this.workspaceFileOpenToken
    this.workspaceFileOpenToken = undefined
    if (this.restartTimer !== undefined) {
      this.cancelSchedule(this.restartTimer)
      this.restartTimer = undefined
    }
    this.#setStatus('stopping', {}, redactionToken)
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
        if (this.status.state !== 'stopped') this.#setStatus('stopped', {}, redactionToken)
        return
      }
    }
    const child = this.child
    if (child === undefined || child.exitCode !== null) {
      this.child = undefined
      this.#setStatus('stopped', {}, redactionToken)
      return
    }
    const exited = new Promise((resolve) => {
      this.stopResolver = resolve
    })
    const forceTimer = this.schedule(() => this.#forceKillChild(child), this.shutdownTimeoutMs)
    try {
      await this.terminateProcessTree(child)
    } catch (error) {
      this.#appendDiagnostic(
        `[process] process-tree shutdown failed: ${this.#errorMessage(error, redactionToken)}`,
        redactionToken,
      )
      this.#forceKillChild(child)
    }
    await exited
    this.cancelSchedule(forceTimer)
  }

  async restart() {
    await this.stop()
    return this.start()
  }
}
