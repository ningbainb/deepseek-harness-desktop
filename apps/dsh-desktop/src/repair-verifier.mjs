import { execFile, spawn } from 'node:child_process'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const CHECK_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/u

/**
 * Candidate verification runs untrusted plugin scripts in a staging copy, so
 * the child only receives the OS and package-manager variables those scripts
 * genuinely need. Secrets, tokens, cookies, cloud credentials, signing keys,
 * CI secrets, and unrelated user variables never cross this boundary.
 */
const VERIFIER_ENV_ALLOWLIST = new Set([
  // OS essentials (a Windows child without SystemRoot fails to start).
  'COMPUTERNAME',
  'COMSPEC',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'ProgramData',
  'ProgramFiles',
  'SystemDrive',
  'SystemRoot',
  'TEMP',
  'TMP',
  'windir',
  // User path essentials for locating node/pnpm/git shims.
  'ALLUSERSPROFILE',
  'APPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'PATH',
  'USERDOMAIN',
  'USERNAME',
  'USERPROFILE',
  // pnpm store resolution without touching user registries.
  'PNPM_HOME',
])
const VERIFIER_ENV_OVERRIDES = Object.freeze({
  CI: '1',
  npm_config_offline: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
})

export function verifierChildEnvironment(sourceEnv = process.env) {
  const filtered = {}
  const source = sourceEnv ?? {}
  // Node's Windows process.env proxy reports hasOwnProperty('PATH') as true
  // even when the only enumerable spelling is Path. Check enumerable keys so
  // the alias is not discarded in that launch context.
  const hasCanonicalPath = Object.keys(source).some(name => name === 'PATH')
  for (const [name, value] of Object.entries(source)) {
    // Windows exposes the environment's PATH entry as Path in some Node
    // launch contexts. Normalize only this OS-specific alias; Unix remains
    // case-sensitive and continues to use the explicit allowlist.
    const canonicalName = process.platform === 'win32' && name.toLowerCase() === 'path'
      ? 'PATH'
      : name
    if (!VERIFIER_ENV_ALLOWLIST.has(name) && !VERIFIER_ENV_ALLOWLIST.has(canonicalName)) continue
    if (canonicalName === 'PATH' && name !== 'PATH' && hasCanonicalPath) continue
    filtered[canonicalName] = value
  }
  return Object.freeze({
    ...filtered,
    ...VERIFIER_ENV_OVERRIDES,
  })
}

function isWithin(candidate, parent) {
  const path = relative(parent, candidate)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

/**
 * Bounded one-line diagnostic. Component, operation, error name, truncated
 * message - never a stack, because these lines are persisted and a stack can
 * carry tokens, absolute paths or message bodies.
 */
function logDiagnostic(log, operation, error) {
  try {
    log?.(
      `[repair-verifier] ${operation} failed: ${String(error?.name ?? 'Error')}: `
      + String(error?.message ?? error).slice(0, 300),
    )
  } catch {
    // Diagnostics must never change verifier behaviour.
  }
}

export function runRegisteredRepairCommand(command, workspace, {
  spawnProcess = spawn,
  timeoutMs = 60_000,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  log,
} = {}) {
  if (command === null || typeof command !== 'object' || typeof command.executable !== 'string'
    || !isAbsolute(command.executable) || !Array.isArray(command.args)
    || typeof command.cwd !== 'string' || typeof workspace !== 'string' || !isAbsolute(workspace)) {
    throw new TypeError('registered repair command is invalid')
  }
  const cwd = resolve(workspace, command.cwd)
  if (!isWithin(cwd, resolve(workspace))) throw new TypeError('registered repair command is outside candidate workspace')
  return new Promise((resolveRun) => {
    let child
    try {
      child = spawnProcess(command.executable, command.args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: verifierChildEnvironment(),
        stdio: ['ignore', 'ignore', 'ignore'],
      })
    } catch (error) {
      // Downstream, a spawn failure is indistinguishable from "the repair
      // command ran and failed". Recording it is what makes that difference
      // visible in a diagnostics export.
      logDiagnostic(log, 'spawn', error)
      resolveRun({ ok: false, exitCode: null, timedOut: false })
      return
    }
    let timedOut = false
    const timer = schedule(() => {
      timedOut = true
      if (process.platform === 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
        try {
          execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {})
        } catch (error) {
          logDiagnostic(log, 'taskkill', error)
        }
      }
      // Both kills are best-effort, but a failure means a repair child may
      // have survived the timeout - exactly the leftover that later surfaces
      // as a stale process still holding the profile directory.
      try { child.kill('SIGKILL') } catch (error) { logDiagnostic(log, 'kill', error) }
    }, timeoutMs)
    timer?.unref?.()
    child.once('error', () => {
      cancelSchedule(timer)
      resolveRun({ ok: false, exitCode: null, timedOut })
    })
    child.once('exit', (exitCode) => {
      cancelSchedule(timer)
      resolveRun({ ok: exitCode === 0 && !timedOut, exitCode, timedOut })
    })
  })
}

export function createRegisteredRepairChecks({
  commands,
  workspace,
  runCommand = runRegisteredRepairCommand,
  log,
} = {}) {
  if (!Array.isArray(commands) || typeof workspace !== 'string' || !isAbsolute(workspace)
    || typeof runCommand !== 'function') {
    throw new TypeError('registered repair checks are invalid')
  }
  return new Map(commands.map(command => [
    command.name,
    () => runCommand(command, workspace, { log }),
  ]))
}

function defaultWaitStable(milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    timer?.unref?.()
  })
}

function result(value) {
  return Object.freeze(value)
}

export class RepairVerifier {
  constructor({
    registeredChecks,
    createProbe,
    stableMs = 10_000,
    waitStable = defaultWaitStable,
  } = {}) {
    if (!(registeredChecks instanceof Map)
      || [...registeredChecks].some(([name, check]) => !CHECK_NAME_PATTERN.test(name) || typeof check !== 'function')) {
      throw new TypeError('repair verifier registered checks are invalid')
    }
    if (typeof createProbe !== 'function' || typeof waitStable !== 'function') {
      throw new TypeError('repair verifier candidate probe is required')
    }
    if (!Number.isInteger(stableMs) || stableMs < 1 || stableMs > 60_000) {
      throw new TypeError('repair verifier stability window is invalid')
    }
    this.registeredChecks = new Map(registeredChecks)
    this.createProbe = createProbe
    this.stableMs = stableMs
    this.waitStable = waitStable
  }

  async verify({ checksRequested = [] } = {}) {
    if (!Array.isArray(checksRequested)
      || checksRequested.length > 64
      || checksRequested.some(name => typeof name !== 'string' || !CHECK_NAME_PATTERN.test(name))) {
      throw new TypeError('repair verifier requested checks are invalid')
    }
    const uniqueChecks = [...new Set(checksRequested)]
    for (const checkName of uniqueChecks) {
      const check = this.registeredChecks.get(checkName)
      if (check === undefined) {
        return result({ ok: false, status: 'failed', category: 'unregistered-check' })
      }
      try {
        const outcome = await check()
        if (outcome === false || outcome?.ok === false) {
          return result({ ok: false, status: 'failed', category: 'check-failed', check: checkName })
        }
      } catch {
        return result({ ok: false, status: 'failed', category: 'check-failed', check: checkName })
      }
    }

    let probe
    let crashHandler
    try {
      probe = await this.createProbe()
      if (probe === null || typeof probe !== 'object'
        || typeof probe.start !== 'function' || typeof probe.stop !== 'function') {
        return result({ ok: false, status: 'failed', category: 'candidate-start-failed' })
      }
      try {
        await probe.start()
      } catch {
        return result({ ok: false, status: 'failed', category: 'candidate-start-failed' })
      }
      if (probe.status?.state !== 'ready') {
        return result({ ok: false, status: 'failed', category: 'candidate-start-failed' })
      }
      const crashed = new Promise((resolveCrash, rejectCrash) => {
        crashHandler = (status) => {
          if (status?.state !== 'ready') rejectCrash(new Error('candidate Runtime became unstable'))
        }
        probe.on?.('status', crashHandler)
        void resolveCrash
      })
      try {
        await Promise.race([crashed, this.waitStable(this.stableMs)])
      } catch {
        return result({ ok: false, status: 'failed', category: 'candidate-unstable' })
      }
      if (probe.status?.state !== 'ready') {
        return result({ ok: false, status: 'failed', category: 'candidate-unstable' })
      }
      return result({ ok: true, status: 'verified' })
    } catch {
      return result({ ok: false, status: 'failed', category: 'candidate-start-failed' })
    } finally {
      if (crashHandler !== undefined) probe?.off?.('status', crashHandler)
      if (probe !== undefined) {
        try {
          await probe.stop()
        } catch {
          await probe.forceStop?.().catch?.(() => {})
        }
      }
    }
  }
}
