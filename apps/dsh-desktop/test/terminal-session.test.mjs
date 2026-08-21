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
