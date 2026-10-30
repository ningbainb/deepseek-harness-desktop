import { spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, open, stat, unlink, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { terminateChildProcessTree } from '../src/runtime-controller.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { parseStartupTimings } from './startup-metrics.mjs'

const OUTPUT_LIMIT = 16_384
const LOG_LIMIT = 65_536
const CLOSE_DRAIN_LIMIT_MS = 2_000
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const QA_ROOT = join(REPOSITORY_ROOT, '.tmp', 'release-qa', 'packaged-smoke')
const PERMISSION_PRESET_FAILURE = /\bpermission\s+\((?:@deepseek-ai\/dsh-permission-presets|file:[^)\r\n]*\/runtime-permission-presets\.mjs)\):\s*(?:[A-Za-z]*Error\b|[^\r\n]*\bdid not activate\b)/u

function credentialValueEnd(text, start) {
  while (/\s/u.test(text[start] ?? '') && start < text.length) start += 1
  if (!['"', "'", '{', '['].includes(text[start])) {
    const newline = text.indexOf('\n', start)
    return newline === -1 ? text.length : newline
  }
  let quote
  let escaped = false
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) {
        quote = undefined
        if (depth === 0) return index + 1
      }
    } else if (character === '"' || character === "'") quote = character
    else if (character === '{' || character === '[') depth += 1
    else if (character === '}' || character === ']') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return text.length // An incomplete value is private through the end of the log.
}

function sanitizeLog(text) {
  text = text
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/gu, '[redacted private key]')
    // A bounded tail can begin inside a PEM block. An orphan END makes the
    // entire preceding fragment private, even when its contents are not base64.
    .replace(/^[\s\S]*-----END [^-\r\n]*PRIVATE KEY-----/u, '[redacted private key fragment]')
  const assignments = /(?:api[ _-]?key|\bkey|token|authorization|cookie|password|passwd|secret|credential)["']?\s*[:=][ \t]*/giu
  let redacted = ''
  let cursor = 0
  for (let match; (match = assignments.exec(text)) !== null;) {
    redacted += `${text.slice(cursor, assignments.lastIndex)}[redacted credential value]`
    cursor = credentialValueEnd(text, assignments.lastIndex)
    assignments.lastIndex = cursor
  }
  return (redacted + text.slice(cursor))
    .split('\n').map(line => /(?:api[ _-]?key|\bkey|token|authorization|cookie|password|passwd|secret|credential)["']?\s*[:=]|\bBearer\s+|\bsk-[A-Za-z0-9_-]{12,}/iu.test(line)
      ? '[redacted credential-bearing line]'
      : line.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/giu, '$1[redacted]@'))
    .join('\n')
}

function logText(buffer, truncated = false) {
  // Discard a cut first line: it may have lost its credential label or UTF-8 prefix.
  if (truncated) {
    const newline = buffer.indexOf(10)
    buffer = newline === -1 ? Buffer.alloc(0) : buffer.subarray(newline + 1)
  }
  const sanitized = Buffer.from(`${truncated ? '[earlier log bytes omitted]\n' : ''}${sanitizeLog(buffer.toString('utf8'))}`)
  if (sanitized.length <= LOG_LIMIT) return sanitized.toString('utf8')
  const tail = sanitized.subarray(-LOG_LIMIT)
  const newline = tail.indexOf(10)
  return newline === -1 ? '' : tail.subarray(newline + 1).toString('utf8')
}

function logTail() {
  let buffer = Buffer.alloc(0)
  let bytes = 0
  return {
    append(chunk) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += data.length
      buffer = Buffer.concat([buffer, data.subarray(-LOG_LIMIT)]).subarray(-LOG_LIMIT)
    },
    text: () => logText(buffer, bytes > LOG_LIMIT),
    get bytes() { return bytes },
  }
}

async function readLogTail(path) {
  let file
  try {
    file = await open(path, 'r')
    const { size } = await file.stat()
    const buffer = Buffer.alloc(Math.min(size, LOG_LIMIT))
    const { bytesRead } = await file.read(buffer, 0, buffer.length, Math.max(0, size - LOG_LIMIT))
    return logText(buffer.subarray(0, bytesRead), size > LOG_LIMIT)
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  } finally {
    await file?.close()
  }
}

async function permissionPresetFailed(path, since) {
  let file
  try {
    file = await open(path, 'r')
    const info = await file.stat()
    let position = since && info.dev === since.dev && info.ino === since.ino && info.size >= since.size ? since.size : 0
    const buffer = Buffer.alloc(LOG_LIMIT)
    let carry = ''
    // Scan this launch in bounded chunks before redaction/truncation, so a
    // large diagnostic tail cannot turn a real loader failure into a pass.
    while (position < info.size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, info.size - position), position)
      if (bytesRead === 0) break
      const text = carry + buffer.subarray(0, bytesRead).toString('utf8')
      if (PERMISSION_PRESET_FAILURE.test(text)) return true
      carry = text.slice(-4096)
      position += bytesRead
    }
    return false
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  } finally {
    await file?.close()
  }
}

async function createDiagnosticDirectory(destination) {
  if (typeof destination !== 'string' || destination.trim() === '') throw new TypeError('smoke diagnostics must use the confined QA directory')
  const target = resolve(destination)
  const suffix = relative(QA_ROOT, target)
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) {
    throw new Error('smoke diagnostics must be confined to .tmp/release-qa/packaged-smoke')
  }
  // Reject links at every component, including .tmp and release-qa. Do not
  // follow an existing junction into a profile or any other artifact tree.
  let current = REPOSITORY_ROOT
  for (const component of relative(REPOSITORY_ROOT, target).split(sep)) {
    current = join(current, component)
    try { await mkdir(current, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const entry = await lstat(current)
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('smoke diagnostics directory contains a link or non-directory')
  }
  return mkdtemp(join(target, 'smoke-'))
}

export async function runPackagedDesktop({
  appPath,
  userData,
  dshHome,
  agentsHome = join(userData, 'agents'),
  timeoutMs = 180_000,
  requireStartupTimings = true,
  requirePermissionPresets = false,
  windowsHide = true,
  forceRendererAccessibility = false,
  seedPrimaryRuntimePermission = true,
  onSpawn,
  diagnosticsDirectory = process.env.DSH_DESKTOP_SMOKE_DIAGNOSTICS,
  spawnProcess = spawn,
}) {
  if (!appPath || !userData || !dshHome) throw new TypeError('appPath, userData, and dshHome are required')
  if (typeof requireStartupTimings !== 'boolean') throw new TypeError('requireStartupTimings must be a boolean')
  if (typeof requirePermissionPresets !== 'boolean') throw new TypeError('requirePermissionPresets must be a boolean')
  if (typeof windowsHide !== 'boolean') throw new TypeError('windowsHide must be a boolean')
  if (typeof forceRendererAccessibility !== 'boolean') throw new TypeError('forceRendererAccessibility must be a boolean')
  if (typeof seedPrimaryRuntimePermission !== 'boolean') {
    throw new TypeError('seedPrimaryRuntimePermission must be a boolean')
  }
  if (onSpawn !== undefined && typeof onSpawn !== 'function') throw new TypeError('onSpawn must be a function when provided')
  const stdout = logTail()
  const stderr = logTail()
  let child
  let timeout
  let evidenceDirectory
  let rawElectronLog
  let startedAt
  let startedAtUtc
  let exit
  let exitElapsedMs
  let closeObserved = false
  let stdioDrainTimedOut = false
  let timedOut = false
  let observerError
  let failure
  let runtimeLog
  let permissionLogStart
  const runtimeLogPath = join(userData, 'logs', 'runtime.log')
  const readRuntimeLog = () => readLogTail(runtimeLogPath)
    .catch(() => '[runtime log could not be read]')
  const diagnostics = async () => {
    runtimeLog ??= await readRuntimeLog()
    return `process output:\nstdout:\n${stdout.text().slice(-OUTPUT_LIMIT) || '(empty)'}\nstderr:\n${stderr.text().slice(-OUTPUT_LIMIT) || '(empty)'}\nruntime log:\n${runtimeLog.slice(-OUTPUT_LIMIT) || '(missing)'}`
  }

  try {
    if (diagnosticsDirectory !== undefined && diagnosticsDirectory !== null) {
      evidenceDirectory = await createDiagnosticDirectory(diagnosticsDirectory)
      rawElectronLog = join(evidenceDirectory, 'electron.raw.log')
    }
    if (seedPrimaryRuntimePermission) await seedPrimaryRuntimePermissionForTest({ userData })
    if (requirePermissionPresets) permissionLogStart = await stat(runtimeLogPath).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
    startedAt = performance.now()
    startedAtUtc = new Date().toISOString()
    const args = forceRendererAccessibility ? ['--force-renderer-accessibility'] : []
    if (rawElectronLog) args.push('--enable-logging=file', `--log-file=${rawElectronLog}`)
    child = spawnProcess(appPath, args, {
      cwd: dirname(appPath),
      env: {
        ...process.env,
        DSH_DESKTOP_USER_DATA: userData,
        DSH_DESKTOP_SMOKE_EXIT: '1',
        DSH_DESKTOP_DISABLE_UPDATES: '1',
        DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
        DSH_HOME: dshHome,
        DSH_AGENTS_HOME: agentsHome,
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide,
    })
    child.stdout.on('data', chunk => stdout.append(chunk))
    child.stderr.on('data', chunk => stderr.append(chunk))
    const closed = new Promise(resolveClose => child.once('close', () => {
      closeObserved = true
      resolveClose(true)
    }))
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
        .then(() => undefined)
        .catch(async (error) => {
          observerError = error instanceof Error ? error : new Error('packaged desktop smoke observer failed', { cause: error })
          await terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
        })

    const deadline = new Promise(resolveDeadline => {
      timeout = setTimeout(() => {
        timedOut = true
        resolveDeadline()
        void terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
      }, Math.max(0, timeoutMs - (performance.now() - startedAt)))
    })

    exit = await new Promise((resolveExit, rejectExit) => {
      child.once('error', rejectExit)
      child.once('exit', (code, signal) => resolveExit({ code, signal }))
    })
    exitElapsedMs = Number((performance.now() - startedAt).toFixed(1))
    // exit does not mean inherited pipe handles are closed. Drain only within
    // the original smoke deadline, with a short cap; never restart its budget.
    let drainTimer
    try {
      stdioDrainTimedOut = !await Promise.race([
        closed,
        new Promise(resolveDrain => {
          drainTimer = setTimeout(() => resolveDrain(false), Math.max(0, Math.min(CLOSE_DRAIN_LIMIT_MS, timeoutMs - (performance.now() - startedAt))))
        }),
      ])
    } finally {
      clearTimeout(drainTimer)
    }
    if (spawnObserver !== undefined) await Promise.race([spawnObserver, deadline])
    const elapsedMs = Number((performance.now() - startedAt).toFixed(1))
    timedOut ||= elapsedMs >= timeoutMs
    const { code, signal } = exit
    const nativeExit = `packaged desktop smoke exited code=${String(code)} signal=${String(signal)}`
    const stdioStatus = stdioDrainTimedOut ? '\nstdio close was not observed before the smoke deadline/drain budget' : ''
    if (observerError !== undefined) {
      throw new Error(`packaged desktop smoke observer failed: ${sanitizeLog(observerError.message)}\n${nativeExit}${timedOut ? `\npackaged desktop smoke timed out after ${timeoutMs}ms` : ''}${stdioStatus}\n${await diagnostics()}`, { cause: observerError })
    }
    if (timedOut) throw new Error(`packaged desktop smoke timed out after ${timeoutMs}ms\n${nativeExit}${stdioStatus}\n${await diagnostics()}`)
    if (code !== 0) {
      throw new Error(
        `${nativeExit}\n${await diagnostics()}`,
      )
    }
    if (stdioDrainTimedOut) throw new Error(`packaged desktop smoke stdio close was not observed within the existing smoke deadline (exit code=${String(code)} signal=${String(signal)})\n${await diagnostics()}`)

    runtimeLog = await readRuntimeLog()
    if (requirePermissionPresets) {
      // Upgrade scenarios reuse runtime.log. Only this launch may fail the
      // current-version gate; an old version's warning is retained as evidence.
      if (await permissionPresetFailed(runtimeLogPath, permissionLogStart)) {
        throw new Error(`packaged desktop smoke permission presets did not activate (@deepseek-ai/dsh-permission-presets)\n${await diagnostics()}`)
      }
    }
    return Object.freeze({
      elapsedMs,
      runtimeLog,
      ...(evidenceDirectory ? { diagnosticsDirectory: evidenceDirectory } : {}),
      ...(requireStartupTimings ? { timings: parseStartupTimings(runtimeLog) } : {}),
    })
  } catch (error) {
    failure = error
    throw error
  } finally {
    clearTimeout(timeout)
    if (child?.exitCode === null) {
      await terminateChildProcessTree(child).catch(() => child.kill('SIGKILL'))
    }
    if (stdioDrainTimedOut) {
      child?.stdout.destroy()
      child?.stderr.destroy()
    }
    if (evidenceDirectory) {
      try {
        runtimeLog ??= await readRuntimeLog()
        const diagnosticErrors = []
        const electronLog = await readLogTail(rawElectronLog).catch(() => {
          diagnosticErrors.push('electron.log:read-failed')
          return '[electron log could not be read]'
        })
        const logs = { 'stdout.log': stdout.text(), 'stderr.log': stderr.text(), 'runtime.log': runtimeLog, 'electron.log': electronLog }
        for (const [name, contents] of Object.entries(logs)) {
          await writeFile(join(evidenceDirectory, name), contents, { flag: 'wx', mode: 0o600 })
            .catch(() => { diagnosticErrors.push(`${name}:write-failed`) })
        }
        await writeFile(join(evidenceDirectory, 'exit.json'), `${JSON.stringify({
          startedAt: startedAtUtc ?? null, pid: child?.pid ?? null,
          timeoutMs, requirePermissionPresets, exit: exit ?? null, exitElapsedMs: exitElapsedMs ?? null,
          elapsedMs: startedAt === undefined ? null : Number((performance.now() - startedAt).toFixed(1)),
          closeObserved: closeObserved && !stdioDrainTimedOut, stdioDrainTimedOut, timedOut,
          success: failure === undefined && diagnosticErrors.length === 0, diagnosticErrors, logLimitBytes: LOG_LIMIT,
          stdoutBytes: stdout.bytes, stderrBytes: stderr.bytes,
        }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
        if (diagnosticErrors.length !== 0) throw new Error('smoke diagnostic file failed')
      } catch (error) {
        // Evidence failures must not replace a native exit code or turn a
        // failed smoke into a success. Do not include arbitrary filesystem errors.
        const message = 'packaged desktop smoke diagnostics could not be saved'
        if (failure) failure.message += `\n${message}`
        else throw new Error(message, { cause: error })
      } finally {
        // The workflow excludes this raw file even if the QA driver is killed.
        await unlink(rawElectronLog).catch(() => {})
      }
      if (failure) failure.message += `\nsmoke diagnostics: ${evidenceDirectory}`
    }
  }
}
