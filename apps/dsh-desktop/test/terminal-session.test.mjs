import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  DesktopTerminalSession,
  createTerminalEnvironment,
  normalizeTerminalInput,
  normalizeTerminalSize,
  resolveDesktopTerminalShell,
} from '../src/terminal-session.mjs'

class FakePty extends EventEmitter {
  writes = []
  resizes = []
  killed = 0

  onData(callback) {
    this.on('data', callback)
    return { dispose: () => this.off('data', callback) }
  }

  onExit(callback) {
    this.on('exit', callback)
    return { dispose: () => this.off('exit', callback) }
  }

  write(data) { this.writes.push(data) }
  resize(cols, rows) { this.resizes.push([cols, rows]) }
  kill() { this.killed += 1 }
}

test('terminal arguments are bounded and normalized', () => {
  assert.deepEqual(normalizeTerminalSize({ cols: 120, rows: 40 }), { cols: 120, rows: 40 })
  assert.deepEqual(normalizeTerminalSize(), { cols: 80, rows: 24 })
  assert.throws(() => normalizeTerminalSize({ cols: 1, rows: 24 }), /terminal size/u)
  assert.throws(() => normalizeTerminalSize({ cols: 80, rows: 201 }), /terminal size/u)
  assert.equal(normalizeTerminalInput('git --version\r'), 'git --version\r')
  assert.throws(() => normalizeTerminalInput('x'.repeat(65_537)), /terminal input/u)
  assert.throws(() => normalizeTerminalInput({ command: 'whoami' }), /terminal input/u)
})

test('Windows shell selection is fixed and never renderer-selected', () => {
  const existing = new Set([
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ])
  const selected = resolveDesktopTerminalShell({
    platform: 'win32',
    environment: { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' },
    exists: (path) => existing.has(path),
  })
  assert.deepEqual(selected, {
    executable: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    args: ['-NoLogo'],
    label: 'PowerShell 7',
  })

  const fallback = resolveDesktopTerminalShell({
    platform: 'win32',
    environment: { SystemRoot: 'C:\\Windows' },
    exists: (path) => existing.has(path),
  })
  assert.equal(fallback.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
})

test('terminal environment prepends only main-process path entries without mutating process state', () => {
  const source = { Path: 'C:\\Windows\\System32', ELECTRON_RUN_AS_NODE: '1', KEEP: 'yes' }
  const result = createTerminalEnvironment({
    platform: 'win32',
    environment: source,
    pathEntries: ['C:\\Managed Git\\cmd'],
  })
  assert.equal(result.Path, 'C:\\Managed Git\\cmd;C:\\Windows\\System32')
  assert.equal(result.TERM, 'xterm-256color')
  assert.equal(result.COLORTERM, 'truecolor')
  assert.equal('ELECTRON_RUN_AS_NODE' in result, false)
  assert.equal(source.ELECTRON_RUN_AS_NODE, '1')
})

test('PTY session owns one shell, contains events, and is fully reclaimed', async () => {
  const pty = new FakePty()
  const spawnCalls = []
  const events = []
  const session = new DesktopTerminalSession({
    cwd: 'C:\\Users\\alice',
    platform: 'win32',
    environment: { Path: 'C:\\Windows\\System32', SystemRoot: 'C:\\Windows' },
    pathEntries: ['C:\\Managed Git\\cmd'],
    exists: () => false,
    loadPty: async () => ({ spawn: (...args) => { spawnCalls.push(args); return pty } }),
    emit: (kind, payload) => events.push([kind, payload]),
  })

  const started = await session.start({ cols: 100, rows: 32 })
  assert.equal(started.label, 'Windows PowerShell')
  assert.equal(started.cwd, 'C:\\Users\\alice')
  assert.equal(spawnCalls.length, 1)
  assert.deepEqual(spawnCalls[0].slice(0, 2), ['powershell.exe', ['-NoLogo']])
  assert.deepEqual(spawnCalls[0][2], {
    name: 'xterm-256color',
    cols: 100,
    rows: 32,
    cwd: 'C:\\Users\\alice',
    env: {
      Path: 'C:\\Managed Git\\cmd;C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    useConpty: true,
  })

  assert.deepEqual(await session.start({ cols: 80, rows: 24 }), started)
  session.write('echo ready\r')
  session.resize({ cols: 140, rows: 50 })
  assert.deepEqual(pty.writes, ['echo ready\r'])
  assert.deepEqual(pty.resizes, [[140, 50]])

  pty.emit('data', 'ready\r\n')
  assert.deepEqual(events, [['output', 'ready\r\n']])
  pty.emit('exit', { exitCode: 0, signal: 0 })
  assert.deepEqual(events.at(-1), ['exit', { exitCode: 0, signal: 0 }])
  assert.equal(session.active, false)

  await session.start({ cols: 80, rows: 24 })
  assert.equal(spawnCalls.length, 2)
  session.dispose()
  assert.equal(pty.killed, 1)
  assert.equal(session.active, false)
})

test('PTY load and spawn failures become terminal errors instead of unhandled process failures', async () => {
  const events = []
  const session = new DesktopTerminalSession({
    cwd: 'C:\\Users\\alice',
    platform: 'win32',
    environment: {},
    loadPty: async () => { throw new Error('native module unavailable') },
    emit: (kind, payload) => events.push([kind, payload]),
  })
  await assert.rejects(session.start(), /native module unavailable/u)
  assert.equal(events[0][0], 'error')
  assert.equal(events[0][1].code, 'terminal-start-failed')
  assert.equal(session.active, false)
})

test('terminal initializes PTY in parallel with lazy PATH verification and shares concurrent starts', async () => {
  let resolvePaths
  const paths = new Promise(resolve => { resolvePaths = resolve })
  let loads = 0
  let probes = 0
  const spawns = []
  const session = new DesktopTerminalSession({
    cwd: 'C:\\workspace', platform: 'win32', environment: { Path: 'C:\\Windows' },
    resolvePathEntries: () => { probes += 1; return paths },
    loadPty: async () => { loads += 1; return { spawn: (...args) => { spawns.push(args); return new FakePty() } } },
  })
  assert.equal(probes, 0)
  const first = session.start()
  const second = session.start()
  assert.equal(loads, 1)
  assert.equal(probes, 1)
  assert.equal(spawns.length, 0)
  assert.equal(session.resize({ cols: 140, rows: 35 }), false)
  resolvePaths(['C:\\Verified Git\\cmd'])
  await Promise.all([first, second])
  assert.equal(spawns.length, 1)
  assert.equal(spawns[0][2].env.Path, 'C:\\Verified Git\\cmd;C:\\Windows')
  assert.equal(spawns[0][2].cols, 140)
  assert.equal(spawns[0][2].rows, 35)
  session.dispose()
})

test('closing a terminal while PATH inspection is pending never creates a late shell', async () => {
  let resolvePaths
  let spawns = 0
  const session = new DesktopTerminalSession({
    cwd: 'C:\\workspace', platform: 'win32', environment: {},
    resolvePathEntries: () => new Promise(resolve => { resolvePaths = resolve }),
    loadPty: async () => ({ spawn: () => { spawns += 1; return new FakePty() } }),
  })
  const starting = session.start()
  session.dispose()
  resolvePaths([])
  await assert.rejects(starting, /disposed/u)
  assert.equal(spawns, 0)
})

test('restart supersedes a pending load and a stale failure cannot kill the replacement shell', async () => {
  let failFirst
  const pty = new FakePty()
  let loads = 0
  const session = new DesktopTerminalSession({
    cwd: 'C:\\workspace', platform: 'win32', environment: {},
    loadPty: () => ++loads === 1 ? new Promise((_resolve, reject) => { failFirst = reject })
      : Promise.resolve({ spawn: () => pty }),
  })
  const starting = session.start()
  const failed = assert.rejects(starting, /obsolete load/u)
  const restarting = session.restart()
  assert.equal(loads, 2, 'restart must begin a fresh generation instead of sharing the stalled first load')
  await restarting
  failFirst(new Error('obsolete load'))
  await failed
  assert.equal(session.active, true)
  assert.equal(pty.killed, 0)
  session.dispose()
})

test('a superseded load cannot create an extra shell after restart succeeds', async () => {
  let finishFirst
  let loads = 0
  let spawns = 0
  const pty = new FakePty()
  const module = { spawn: () => { spawns += 1; return pty } }
  const events = []
  const session = new DesktopTerminalSession({
    cwd: 'C:\\workspace', platform: 'win32', environment: {},
    loadPty: () => ++loads === 1 ? new Promise(resolve => { finishFirst = resolve }) : Promise.resolve(module),
    emit: (...event) => events.push(event),
  })
  const starting = session.start()
  const superseded = assert.rejects(starting, /superseded/u)
  const restarted = session.restart()
  assert.equal(loads, 2)
  await restarted
  finishFirst(module)
  await superseded
  assert.equal(spawns, 1)
  assert.equal(session.active, true)
  assert.deepEqual(events, [], 'a superseded startup must not report an error into the replacement view')
  session.dispose()
})
