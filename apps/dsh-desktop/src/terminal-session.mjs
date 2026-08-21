import { existsSync } from 'node:fs'
import { delimiter, posix, win32 } from 'node:path'

const DEFAULT_TERMINAL_SIZE = Object.freeze({ cols: 80, rows: 24 })
const MAX_TERMINAL_INPUT_LENGTH = 65_536
const MAX_TERMINAL_OUTPUT_LENGTH = 65_536
const MAX_PATH_ENTRIES = 64

function terminalPath(environment) {
  const key = Object.keys(environment).find((name) => name.toLowerCase() === 'path')
  return { key: key ?? (process.platform === 'win32' ? 'Path' : 'PATH'), value: key === undefined ? '' : environment[key] }
}

function normalizedPathEntries(pathEntries) {
  if (!Array.isArray(pathEntries) || pathEntries.length > MAX_PATH_ENTRIES) {
    throw new TypeError('terminal PATH entries must be a bounded array')
  }
  return pathEntries.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 4_096 || entry.includes('\0')) {
      throw new TypeError('terminal PATH entry is invalid')
    }
    return entry
  })
}

function emitSafely(emit, kind, payload) {
  try { emit(kind, payload) } catch {}
}

function disposeSubscription(subscription) {
  try { subscription?.dispose?.() } catch {}
}

export function normalizeTerminalSize(value = DEFAULT_TERMINAL_SIZE) {
  const cols = value?.cols ?? DEFAULT_TERMINAL_SIZE.cols
  const rows = value?.rows ?? DEFAULT_TERMINAL_SIZE.rows
  if (!Number.isInteger(cols) || cols < 2 || cols > 500 || !Number.isInteger(rows) || rows < 1 || rows > 200) {
    throw new TypeError('terminal size is invalid')
  }
  return Object.freeze({ cols, rows })
}

export function normalizeTerminalInput(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TERMINAL_INPUT_LENGTH || value.includes('\0')) {
    throw new TypeError('terminal input is invalid')
  }
  return value
}

export function resolveDesktopTerminalShell({
  platform = process.platform,
  environment = process.env,
  exists = existsSync,
} = {}) {
  if (typeof exists !== 'function') throw new TypeError('terminal shell existence probe must be a function')
  if (platform === 'win32') {
    const candidates = []
    for (const root of [environment.ProgramW6432, environment.ProgramFiles]) {
      if (typeof root === 'string' && root.length > 0) {
        const executable = win32.join(root, 'PowerShell', '7', 'pwsh.exe')
        if (!candidates.includes(executable)) candidates.push(executable)
      }
    }
    for (const executable of candidates) {
      if (exists(executable)) return Object.freeze({ executable, args: ['-NoLogo'], label: 'PowerShell 7' })
    }
    if (typeof environment.SystemRoot === 'string' && environment.SystemRoot.length > 0) {
      const executable = win32.join(
        environment.SystemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      )
      if (exists(executable)) return Object.freeze({ executable, args: ['-NoLogo'], label: 'Windows PowerShell' })
    }
    return Object.freeze({ executable: 'powershell.exe', args: ['-NoLogo'], label: 'Windows PowerShell' })
  }

  const configured = typeof environment.SHELL === 'string' && posix.isAbsolute(environment.SHELL)
    ? environment.SHELL
    : platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
  return Object.freeze({ executable: configured, args: [], label: configured.split('/').at(-1) || 'Shell' })
}

export function createTerminalEnvironment({
  platform = process.platform,
  environment = process.env,
  pathEntries = [],
} = {}) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new TypeError('terminal environment must be an object')
  }
  const result = {}
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  const entries = normalizedPathEntries(pathEntries)
  const path = terminalPath(result)
  if (entries.length > 0) {
    const identity = (value) => platform === 'win32'
      ? value.replaceAll('/', '\\').replace(/\\+$/u, '').toLowerCase()
      : value.replace(/\/+$/u, '')
    const seen = new Set()
    const combined = []
    for (const entry of [...entries, ...(typeof path.value === 'string' ? path.value.split(delimiter) : [])]) {
      if (entry.length === 0) continue
      const key = identity(entry)
      if (seen.has(key)) continue
      seen.add(key)
      combined.push(entry)
    }
    result[path.key] = combined.join(delimiter)
  }
  result.TERM = 'xterm-256color'
  result.COLORTERM = 'truecolor'
  return Object.freeze(result)
}

function assertWorkingDirectory(value, platform) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || value.includes('\0')) {
    throw new TypeError('terminal working directory must be an absolute path')
  }
  const absolute = platform === 'win32' ? win32.isAbsolute(value) : posix.isAbsolute(value)
  if (!absolute) {
    throw new TypeError('terminal working directory must be an absolute path')
  }
  return value
}

function resolvePtySpawn(module) {
  const spawn = module?.spawn ?? module?.default?.spawn
  if (typeof spawn !== 'function') throw new TypeError('node-pty spawn is unavailable')
  return spawn
}

export class DesktopTerminalSession {
  #cwd
  #platform
  #environment
  #pathEntries
  #exists
  #loadPty
  #emit
  #pty
  #dataSubscription
  #exitSubscription
  #startPromise
  #info
  #generation = 0
  #disposed = false

  constructor({
    cwd,
    platform = process.platform,
    environment = process.env,
    pathEntries = [],
    exists = existsSync,
    loadPty = () => import('node-pty'),
    emit = () => {},
  } = {}) {
    this.#cwd = assertWorkingDirectory(cwd, platform)
    this.#platform = platform
    this.#environment = environment
    this.#pathEntries = normalizedPathEntries(pathEntries)
    if (typeof exists !== 'function') throw new TypeError('terminal existence probe must be a function')
    if (typeof loadPty !== 'function') throw new TypeError('terminal PTY loader must be a function')
    if (typeof emit !== 'function') throw new TypeError('terminal emitter must be a function')
    this.#exists = exists
    this.#loadPty = loadPty
    this.#emit = emit
  }

  get active() { return this.#pty !== undefined }

  async start(size = DEFAULT_TERMINAL_SIZE) {
    if (this.#disposed) throw new Error('terminal session is disposed')
    if (this.#pty !== undefined && this.#info !== undefined) return this.#info
    if (this.#startPromise !== undefined) return this.#startPromise
    const normalizedSize = normalizeTerminalSize(size)
    let operation
    operation = this.#start(normalizedSize).finally(() => {
      if (this.#startPromise === operation) this.#startPromise = undefined
    })
    this.#startPromise = operation
    return operation
  }

  async #start(size) {
    try {
      const [module, shell] = await Promise.all([
        this.#loadPty(),
        Promise.resolve(resolveDesktopTerminalShell({
          platform: this.#platform,
          environment: this.#environment,
          exists: this.#exists,
        })),
      ])
      if (this.#disposed) throw new Error('terminal session is disposed')
      const spawn = resolvePtySpawn(module)
      const environment = createTerminalEnvironment({
        platform: this.#platform,
        environment: this.#environment,
        pathEntries: this.#pathEntries,
      })
      const pty = spawn(shell.executable, shell.args, {
        name: 'xterm-256color',
        ...size,
        cwd: this.#cwd,
        env: environment,
        ...(this.#platform === 'win32' ? { useConpty: true } : {}),
      })
      if (!pty || typeof pty.write !== 'function' || typeof pty.resize !== 'function' || typeof pty.kill !== 'function') {
        throw new TypeError('node-pty returned an invalid terminal process')
      }
      const generation = ++this.#generation
      this.#pty = pty
      this.#info = Object.freeze({ label: shell.label, cwd: this.#cwd })
      this.#dataSubscription = pty.onData?.((data) => {
        if (this.#pty !== pty || this.#generation !== generation || typeof data !== 'string') return
        for (let offset = 0; offset < data.length; offset += MAX_TERMINAL_OUTPUT_LENGTH) {
          emitSafely(this.#emit, 'output', data.slice(offset, offset + MAX_TERMINAL_OUTPUT_LENGTH))
        }
      })
      this.#exitSubscription = pty.onExit?.((event = {}) => {
        if (this.#pty !== pty || this.#generation !== generation) return
        this.#clearCurrent()
        emitSafely(this.#emit, 'exit', Object.freeze({
          exitCode: Number.isInteger(event.exitCode) ? event.exitCode : 0,
          signal: Number.isInteger(event.signal) ? event.signal : 0,
        }))
      })
      return this.#info
    } catch (error) {
      this.#stopCurrent()
      emitSafely(this.#emit, 'error', Object.freeze({ code: 'terminal-start-failed' }))
      throw error
    }
  }

  write(value) {
    const data = normalizeTerminalInput(value)
    if (this.#pty === undefined) throw new Error('terminal session is not active')
    this.#pty.write(data)
  }

  resize(value) {
    const size = normalizeTerminalSize(value)
    if (this.#pty === undefined) return false
    this.#pty.resize(size.cols, size.rows)
    return true
  }

  async restart(size = DEFAULT_TERMINAL_SIZE) {
    if (this.#disposed) throw new Error('terminal session is disposed')
    this.#stopCurrent()
    return this.start(size)
  }

  #clearCurrent() {
    disposeSubscription(this.#dataSubscription)
    disposeSubscription(this.#exitSubscription)
    this.#dataSubscription = undefined
    this.#exitSubscription = undefined
    this.#pty = undefined
    this.#info = undefined
  }

  #stopCurrent() {
    const pty = this.#pty
    this.#generation += 1
    this.#clearCurrent()
    try { pty?.kill() } catch {}
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    this.#stopCurrent()
  }
}
