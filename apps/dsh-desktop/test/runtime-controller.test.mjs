import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  DshRuntimeController,
  computeRestartDelay,
  parseDshReadyUrl,
  probeHttpReady,
  terminateChildProcessTree,
  validateLoopbackUrl,
} from '../src/runtime-controller.mjs'

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.exitCode = null
    this.killed = false
  }

  kill() {
    this.killed = true
    this.exitCode = 0
    queueMicrotask(() => this.emit('exit', 0, 'SIGTERM'))
    return true
  }
}

test('ready parser accepts only the official loopback URL line', () => {
  assert.equal(parseDshReadyUrl('dsh web: http://127.0.0.1:43125'), 'http://127.0.0.1:43125/')
  assert.equal(parseDshReadyUrl('prefix dsh web: http://127.0.0.1:43125'), undefined)
  assert.throws(() => validateLoopbackUrl('https://127.0.0.1:43125'), /loopback HTTP/)
  assert.throws(() => validateLoopbackUrl('http://example.com:43125'), /loopback HTTP/)
  assert.throws(() => validateLoopbackUrl('http://user:pass@127.0.0.1:43125'), /credentials/)
})

test('restart schedule is bounded and exponential', () => {
  assert.equal(computeRestartDelay(0), 500)
  assert.equal(computeRestartDelay(1), 1_500)
  assert.equal(computeRestartDelay(2), 4_500)
  assert.equal(computeRestartDelay(3), undefined)
})

test('Windows shutdown terminates the complete runtime process tree', async () => {
  const calls = []
  const child = {
    pid: 43125,
    exitCode: null,
    kill: (signal) => calls.push({ fallback: signal }),
  }
  await terminateChildProcessTree(child, {
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    execFileFn: (executable, args, options, callback) => {
      calls.push({ executable, args, options })
      callback(null)
    },
  })
  assert.deepEqual(calls, [{
    executable: 'C:\\Windows\\System32\\taskkill.exe',
    args: ['/PID', '43125', '/T', '/F'],
    options: { windowsHide: true, timeout: 5_000 },
  }])
})

test('default startup budget tolerates first-run Windows scanning', () => {
  assert.equal(DEFAULT_STARTUP_TIMEOUT_MS, 120_000)
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
  })
  assert.equal(controller.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS)
})

test('HTTP readiness probe waits through a short bind race', async () => {
  let calls = 0
  await probeHttpReady('http://127.0.0.1:43125/', {
    attempts: 3,
    delayMs: 0,
    schedule: (callback) => callback(),
    fetchImpl: async () => {
      calls += 1
      if (calls < 3) throw new Error('connection refused')
      return { ok: true }
    },
  })
  assert.equal(calls, 3)
})

test('controller reaches ready state from streamed output and stops cleanly', async () => {
  const child = new FakeChild()
  const logLines = []
  const states = []
  let childEnvironment
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: (_executable, _arguments, options) => {
      childEnvironment = options.env
      return child
    },
    logStore: { append: async (line) => logLines.push(line) },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
    pathEntries: ['C:\\desktop-runtime-bin'],
    environmentProvider: () => ({ QQBOT_APPID: 'desktop-app', QQBOT_SECRET: 'runtime-only' }),
  })
  controller.on('status', (status) => states.push(status.state))

  const ready = controller.start()
  child.stdout.write('booting\r\ndsh web: http://127.0.0.1:43125 (LAN: http://10.0.0.2:43125)\r\n')
  assert.equal(await ready, 'http://127.0.0.1:43125/')
  assert.equal(controller.status.state, 'ready')
  assert.deepEqual(states.slice(0, 2), ['starting', 'ready'])
  assert.ok(logLines.some((line) => line.includes('booting')))
  assert.equal(childEnvironment.DSH_PROFILE, 'desktop')
  assert.equal(childEnvironment.DSH_SKIN_PROFILE, 'desktop')
  assert.equal(childEnvironment.QQBOT_APPID, 'desktop-app')
  assert.equal(childEnvironment.QQBOT_SECRET, 'runtime-only')
  assert.ok(childEnvironment.PATH.startsWith(`C:\\desktop-runtime-bin${process.platform === 'win32' ? ';' : ':'}`))

  await controller.stop()
  assert.equal(controller.status.state, 'stopped')
  assert.equal(child.killed, true)
})

test('controller rejects startup when the child exits before readiness', async () => {
  const child = new FakeChild()
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => child,
    logStore: { append: async () => {} },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
  })
  const ready = controller.start()
  child.emit('exit', 1, null)
  await assert.rejects(ready, /before readiness/)
  assert.equal(controller.status.state, 'crashed')
})
