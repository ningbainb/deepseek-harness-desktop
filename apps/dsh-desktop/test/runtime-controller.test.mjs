import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  DESKTOP_PROFILE_NAME,
  DshRuntimeController,
  computeRestartDelay,
  createRuntimeInvocation,
  formatRuntimeExit,
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

test('hidden Windows runtime wrapper gives terminal descendants an inherited hidden console', () => {
  const invocation = createRuntimeInvocation({
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    executable: "C:\\Program Files\\DeepSeek's Harness\\DeepSeek Harness Desktop.exe",
    cliPath: 'C:\\Program Files\\DeepSeek Harness\\resources\\app.asar.unpacked\\dsh\\bin.js',
  })

  assert.equal(
    invocation.executable,
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  )
  assert.deepEqual(invocation.args.slice(0, 6), [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-EncodedCommand',
  ])
  const script = Buffer.from(invocation.args[6], 'base64').toString('utf16le')
  assert.match(script, /DeepSeek''s Harness/u)
  assert.match(script, /'--expose-internals'/u)
  assert.match(script, /'--profile' 'desktop'/u)
  assert.match(script, /'--port' '0'/u)
  assert.match(script, /ForEach-Object \{ \[Console\]::Out\.WriteLine\(\$_\) \}/u)
  assert.match(script, /exit \$LASTEXITCODE/u)
})

test('non-Windows runtime launch remains a direct argv spawn', () => {
  assert.deepEqual(createRuntimeInvocation({
    platform: 'linux',
    executable: '/opt/deepseek-harness',
    cliPath: '/opt/dsh/bin.js',
    preferredPort: 43_125,
  }), {
    executable: '/opt/deepseek-harness',
    args: ['--expose-internals', '/opt/dsh/bin.js', '--profile', 'desktop', '--port', '43125'],
  })
})

test('hidden Windows runtime wrapper preserves runtime output and exit status', {
  skip: process.platform !== 'win32',
}, () => {
  const invocation = createRuntimeInvocation({
    executable: process.execPath,
    cliPath: fileURLToPath(new URL('./fixtures/runtime-child.mjs', import.meta.url)),
  })
  const result = spawnSync(invocation.executable, invocation.args, {
    encoding: 'utf8',
    env: { ...process.env, DSH_TEST_RUNTIME_EXIT_CODE: '23' },
    timeout: 10_000,
    windowsHide: true,
  })

  assert.equal(result.status, 23, result.stderr)
  assert.match(result.stdout, /dsh web: http:\/\/127\.0\.0\.1:43125/u)
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
  let childArguments
  let childEnvironment
  const readyPorts = []
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: (_executable, arguments_, options) => {
      childArguments = arguments_
      childEnvironment = options.env
      return child
    },
    logStore: { append: async (line) => logLines.push(line) },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
    pathEntries: ['C:\\desktop-runtime-bin'],
    environmentProvider: () => ({ QQBOT_APPID: 'desktop-app', QQBOT_SECRET: 'runtime-only' }),
    platform: 'linux',
    preferredPort: 43_124,
    onReadyPort: (port) => readyPorts.push(port),
  })
  controller.on('status', (status) => states.push(status.state))

  const ready = controller.start()
  child.stdout.write('booting\r\ndsh web: http://127.0.0.1:43125 (LAN: http://10.0.0.2:43125)\r\n')
  assert.equal(await ready, 'http://127.0.0.1:43125/')
  assert.equal(controller.status.state, 'ready')
  assert.deepEqual(states.slice(0, 2), ['starting', 'ready'])
  assert.ok(logLines.some((line) => line.includes('booting')))
  assert.equal(childEnvironment.DSH_PROFILE, DESKTOP_PROFILE_NAME)
  assert.equal(childEnvironment.DSH_SKIN_PROFILE, DESKTOP_PROFILE_NAME)
  assert.equal(childArguments[childArguments.indexOf('--profile') + 1], DESKTOP_PROFILE_NAME)
  assert.equal(childArguments[childArguments.indexOf('--port') + 1], '43124')
  assert.deepEqual(readyPorts, [43_125])
  assert.equal(
    childEnvironment.DSH_SKINS_DIR,
    join('C:\\isolated-home', 'profiles', DESKTOP_PROFILE_NAME, 'node_modules', '@linxin666'),
  )
  assert.equal(childEnvironment.QQBOT_APPID, 'desktop-app')
  assert.equal(childEnvironment.QQBOT_SECRET, 'runtime-only')
  assert.ok(childEnvironment.PATH.startsWith(`C:\\desktop-runtime-bin${process.platform === 'win32' ? ';' : ':'}`))

  await controller.stop()
  assert.equal(controller.status.state, 'stopped')
  assert.equal(child.killed, true)
})

test('large Windows runtime exit codes are rendered as actionable diagnostics', () => {
  assert.equal(
    formatRuntimeExit(4_294_930_438, null, { platform: 'win32' }),
    'runtime exited unexpectedly with Windows code 0xFFFF7006 (signed -36858)',
  )
  assert.equal(
    formatRuntimeExit(null, 'SIGTERM', { platform: 'linux' }),
    'runtime exited unexpectedly from signal SIGTERM',
  )
})

test('identical runtime crashes stop automatic restart after one retry', async () => {
  const children = [new FakeChild(), new FakeChild()]
  const scheduled = []
  const cancelled = new Set()
  let spawns = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    autoRestart: true,
    spawnProcess: () => children[spawns++],
    logStore: { append: async () => {} },
    probeReady: async () => {},
    schedule: (callback, delay) => {
      const timer = { callback, delay }
      scheduled.push(timer)
      return timer
    },
    cancelSchedule: (timer) => cancelled.add(timer),
    startupTimeoutMs: 2_000,
  })

  const firstReady = controller.start()
  children[0].stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await firstReady
  children[0].exitCode = 4_294_930_438
  children[0].emit('exit', 4_294_930_438, null)
  assert.equal(controller.status.state, 'restarting')

  const firstRestart = scheduled.find((timer) => timer.delay === 500 && !cancelled.has(timer))
  assert.ok(firstRestart)
  firstRestart.callback()
  await new Promise((resolve) => setImmediate(resolve))
  children[1].stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(controller.status.state, 'ready')

  children[1].exitCode = 4_294_930_438
  children[1].emit('exit', 4_294_930_438, null)
  assert.equal(controller.status.state, 'crashed')
  assert.equal(controller.status.restartBlocked, 'repeated-crash')
  assert.match(controller.status.error, /automatic restart stopped/iu)
  assert.match(controller.status.error, /0xFFFF7006/u)
  assert.equal(spawns, 2)
  assert.equal(scheduled.filter((timer) => timer.delay === 1_500 && !cancelled.has(timer)).length, 0)
})

test('a stable runtime resets the repeated-crash circuit', async () => {
  const children = [new FakeChild(), new FakeChild()]
  const scheduled = []
  let now = 0
  let spawns = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    autoRestart: true,
    spawnProcess: () => children[spawns++],
    logStore: { append: async () => {} },
    probeReady: async () => {},
    now: () => now,
    schedule: (callback, delay) => {
      const timer = { callback, delay }
      scheduled.push(timer)
      return timer
    },
    cancelSchedule: () => {},
    startupTimeoutMs: 2_000,
  })

  const firstReady = controller.start()
  children[0].stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await firstReady
  children[0].exitCode = 1
  children[0].emit('exit', 1, null)
  scheduled.find((timer) => timer.delay === 500).callback()
  await new Promise((resolve) => setImmediate(resolve))
  children[1].stdout.write('dsh web: http://127.0.0.1:43125\r\n')
  await new Promise((resolve) => setImmediate(resolve))

  now = 60_000
  children[1].exitCode = 1
  children[1].emit('exit', 1, null)
  assert.equal(controller.status.state, 'restarting')
  assert.equal(controller.status.restartBlocked, undefined)
  assert.equal(scheduled.some((timer) => timer.delay === 1_500), true)
})

test('runtime readiness does not wait for queued diagnostic log writes', async () => {
  const child = new FakeChild()
  let releaseLog
  const blockedLog = new Promise((resolve) => { releaseLog = resolve })
  let probes = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => child,
    logStore: { append: () => blockedLog },
    probeReady: async () => { probes += 1 },
    startupTimeoutMs: 2_000,
  })

  const ready = controller.start()
  try {
    child.stdout.write('dsh web: http://127.0.0.1:43125\r\n')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(probes, 1)
    assert.equal(await ready, 'http://127.0.0.1:43125/')
  } finally {
    releaseLog()
    await controller.stop()
  }
})

test('runtime observer failures cannot interrupt startup or later observers', async () => {
  const child = new FakeChild()
  const diagnostics = []
  const states = []
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => child,
    logStore: { append: async (line) => diagnostics.push(line) },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
  })
  controller.once('status', () => { throw new Error('renderer status send failed') })
  controller.on('status', (status) => states.push(status.state))
  controller.on('line', () => { throw new Error('line observer failed') })

  const ready = controller.start()
  child.stdout.write('dsh web: http://127.0.0.1:43125\r\n')

  assert.equal(await ready, 'http://127.0.0.1:43125/')
  assert.deepEqual(states.slice(0, 2), ['starting', 'ready'])
  assert.equal(
    diagnostics.filter((line) => line.includes('status observer failed: renderer status send failed')).length,
    1,
  )
  assert.ok(diagnostics.some((line) => line.includes('line observer failed: line observer failed')))
  await controller.stop()
})

test('failed-startup force cleanup does not wait for diagnostic log persistence', async () => {
  const child = new FakeChild()
  let releaseLog
  const blockedLog = new Promise((resolve) => { releaseLog = resolve })
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => child,
    logStore: { append: () => blockedLog },
    terminateProcessTree: async () => { throw new Error('taskkill unavailable') },
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 10_000,
  })

  try {
    const ready = controller.start()
    child.stdout.write('dsh web: http://example.com:43125\r\n')
    await assert.rejects(ready, /loopback HTTP/u)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(child.killed, true)
  } finally {
    releaseLog()
    if (child.exitCode === null) child.kill()
  }
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

test('retry waits for the failed startup process tree to exit before spawning a replacement', async () => {
  const children = [new FakeChild(), new FakeChild()]
  let spawnCalls = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => children[spawnCalls++],
    logStore: { append: async () => {} },
    probeReady: async () => {},
    terminateProcessTree: async (child) => {
      if (child === children[1]) child.kill()
    },
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 10_000,
  })

  let first
  let retry
  try {
    first = controller.start()
    children[0].stdout.write('dsh web: http://example.com:43125\r\n')
    await assert.rejects(first, /loopback HTTP/u)

    retry = controller.start()
    const duplicateRetry = controller.start()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(spawnCalls, 1)

    children[0].exitCode = 1
    children[0].emit('exit', 1, null)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(spawnCalls, 2)

    children[1].stdout.write('dsh web: http://127.0.0.1:43125\r\n')
    assert.equal(await retry, 'http://127.0.0.1:43125/')
    assert.equal(await duplicateRetry, 'http://127.0.0.1:43125/')
    await controller.stop()
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill()
    }
    await Promise.allSettled([first, retry].filter(Boolean))
  }
})

test('stop joins an in-flight failed-startup cleanup instead of terminating the tree twice', async () => {
  const child = new FakeChild()
  let spawns = 0
  let terminations = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => {
      spawns += 1
      return child
    },
    logStore: { append: async () => {} },
    terminateProcessTree: async () => { terminations += 1 },
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 10_000,
  })

  let stopped
  let retry
  try {
    const ready = controller.start()
    child.stdout.write('dsh web: http://example.com:43125\r\n')
    await assert.rejects(ready, /loopback HTTP/u)
    await new Promise((resolve) => setImmediate(resolve))

    retry = controller.start()
    stopped = controller.stop()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(terminations, 1)
    assert.equal(controller.status.state, 'stopping')

    child.exitCode = 1
    child.emit('exit', 1, null)
    await stopped
    await assert.rejects(retry, /cancelled because shutdown is in progress/u)
    assert.equal(spawns, 1)
    assert.equal(controller.status.state, 'stopped')
  } finally {
    if (child.exitCode === null) child.kill()
    await Promise.allSettled([stopped, retry].filter(Boolean))
  }
})

test('concurrent stops coalesce and a start during stopping waits for the old child exit', async () => {
  const children = [new FakeChild(), new FakeChild()]
  let spawns = 0
  let terminations = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => children[spawns++],
    logStore: { append: async () => {} },
    probeReady: async () => {},
    terminateProcessTree: async (child) => {
      terminations += 1
      if (child === children[1]) child.kill()
    },
    schedule: (callback, delay) => {
      const timer = setTimeout(callback, delay)
      timer.unref()
      return timer
    },
    cancelSchedule: clearTimeout,
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 10_000,
  })

  const initial = controller.start()
  const initialCancelled = assert.rejects(initial, /startup cancelled by stop/u)
  let firstStop
  let secondStop
  let queuedStart
  try {
    firstStop = controller.stop()
    secondStop = controller.stop()
    queuedStart = controller.start()
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(firstStop, secondStop)
    assert.equal(terminations, 1)
    assert.equal(spawns, 1)
    await initialCancelled

    children[0].exitCode = 0
    children[0].emit('exit', 0, 'SIGTERM')
    await Promise.all([firstStop, secondStop])
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(spawns, 2)

    children[1].stdout.write('dsh web: http://127.0.0.1:43125\r\n')
    assert.equal(await queuedStart, 'http://127.0.0.1:43125/')
    await controller.stop()
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill()
    }
  }
})

test('startup timeout terminates the complete runtime tree with a bounded force fallback', async () => {
  const child = new FakeChild()
  const scheduled = []
  const cancelled = []
  const terminated = []
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => child,
    logStore: { append: async () => {} },
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 500,
    schedule: (callback, delay) => {
      const timer = { callback, delay }
      scheduled.push(timer)
      return timer
    },
    cancelSchedule: (timer) => cancelled.push(timer),
    terminateProcessTree: async (target) => terminated.push(target),
  })

  const ready = controller.start()
  assert.equal(scheduled[0].delay, 2_000)
  scheduled[0].callback()
  await assert.rejects(ready, /did not become ready/u)
  await Promise.resolve()

  assert.deepEqual(terminated, [child])
  assert.equal(scheduled[1].delay, 500)
  assert.equal(child.killed, false)
  scheduled[1].callback()
  assert.equal(child.killed, true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(cancelled.includes(scheduled[1]))
})

test('controller fails preflight without spawning or scheduling an automatic restart', async () => {
  let spawnCalls = 0
  let scheduleCalls = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    autoRestart: true,
    preflight: () => {
      const error = new Error('安装不完整，请重新安装 Desktop')
      error.code = 'DSH_DESKTOP_INSTALLATION_INCOMPLETE'
      throw error
    },
    spawnProcess: () => {
      spawnCalls += 1
      throw new Error('unexpected spawn')
    },
    schedule: () => {
      scheduleCalls += 1
      return 1
    },
  })

  await assert.rejects(controller.start(), /重新安装 Desktop/u)
  assert.equal(controller.status.state, 'crashed')
  assert.equal(spawnCalls, 0)
  assert.equal(scheduleCalls, 0)
})
