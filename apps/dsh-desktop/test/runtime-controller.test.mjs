import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV,
  isDesktopWorkspaceFileOpenToken,
} from '@linxin666/dsh-desktop-compat/workspace-file-open-policy'
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  DshRuntimeController,
  computeRestartDelay,
  createRuntimeInvocation,
  formatRuntimeExit,
  forceKillChildProcessTree,
  parseDshReadyUrl,
  probeHttpReady,
  terminateChildProcessTree,
  validateLoopbackUrl,
} from '../src/runtime-controller.mjs'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))

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

test('Windows runtime wrapper avoids the PowerShell WindowStyle crash and preserves its console host', () => {
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
  assert.deepEqual(invocation.args.slice(0, 4), [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
  ])
  assert.equal(invocation.args.includes('-WindowStyle'), false)
  assert.equal(invocation.args.includes('Hidden'), false)
  const script = Buffer.from(invocation.args[4], 'base64').toString('utf16le')
  assert.match(script, /DeepSeek''s Harness/u)
  assert.match(script, /'--expose-internals'/u)
  assert.match(script, /'--require' '[^']*windows-console-preload\.cjs'/u)
  assert.match(script, /'--profile' 'desktop'/u)
  assert.match(script, /'--port' '0'/u)
  assert.match(script, /'--no-open'/u)
  assert.match(script, /ForEach-Object \{ \[Console\]::Out\.WriteLine\(\$_\) \}/u)
  assert.match(script, /exit \$LASTEXITCODE/u)
})

test('non-Windows runtime launch remains a direct argv spawn', () => {
  const invocation = createRuntimeInvocation({
    platform: 'linux',
    executable: '/opt/deepseek-harness',
    cliPath: '/opt/dsh/bin.js',
    preferredPort: 43_125,
  })
  assert.deepEqual(invocation, {
    executable: '/opt/deepseek-harness',
    args: ['--expose-internals', '/opt/dsh/bin.js', '--profile', 'desktop', '--port', '43125', '--no-open'],
  })
  assert.equal(invocation.args.filter((argument) => argument === '--no-open').length, 1)
})

test('runtime invocation passes only validated main-process patch overlays after the selected profile', () => {
  const invocation = createRuntimeInvocation({
    executable: 'node',
    cliPath: 'dsh-bin.js',
    profileName: 'free-session-001',
    patchFiles: ['C:\\isolated-home\\.desktop-free-full-user-overlay.yml'],
    platform: 'linux',
  })
  const profileAt = invocation.args.indexOf('--profile')
  const patchAt = invocation.args.indexOf('--patch')
  assert.ok(patchAt > profileAt)
  assert.equal(invocation.args[patchAt + 1], 'C:\\isolated-home\\.desktop-free-full-user-overlay.yml')
  assert.throws(
    () => createRuntimeInvocation({
      executable: 'node',
      cliPath: 'dsh-bin.js',
      patchFiles: ['unsafe\npath'],
      platform: 'linux',
    }),
    /patch file path is invalid/u,
  )
})

test('runtime launch accepts a validated session profile without changing the desktop default', () => {
  assert.deepEqual(createRuntimeInvocation({
    platform: 'linux',
    executable: '/opt/deepseek-harness',
    cliPath: '/opt/dsh/bin.js',
    profileName: 'free-session-001',
  }), {
    executable: '/opt/deepseek-harness',
    args: ['--expose-internals', '/opt/dsh/bin.js', '--profile', 'free-session-001', '--port', '0', '--no-open'],
  })
  for (const profileName of ['', '../desktop', 'desktop/profile', 'desktop profile', 'x'.repeat(65)]) {
    assert.throws(
      () => createRuntimeInvocation({
        platform: 'linux',
        executable: '/opt/deepseek-harness',
        cliPath: '/opt/dsh/bin.js',
        profileName,
      }),
      /runtime profile name/u,
    )
  }
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

test('Windows preload attaches the GUI-subsystem runtime to its hidden parent console', {
  skip: process.platform !== 'win32',
}, () => {
  const electronExecutable = desktopRequire('electron')
  const preloadPath = fileURLToPath(new URL('../src/windows-console-preload.cjs', import.meta.url))
  const probe = [
    'const koffi = require("koffi")',
    'const kernel32 = koffi.load("kernel32.dll")',
    'const getConsoleProcessList = kernel32.func("__stdcall", "GetConsoleProcessList", "uint32", ["uint32*", "uint32"])',
    'process.stdout.write(String(getConsoleProcessList(Buffer.alloc(16), 4)))',
  ].join(';')
  const environment = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  const detached = spawnSync(electronExecutable, ['-e', probe], {
    encoding: 'utf8',
    env: environment,
    windowsHide: true,
  })
  const attached = spawnSync(electronExecutable, ['--require', preloadPath, '-e', probe], {
    encoding: 'utf8',
    env: environment,
    windowsHide: true,
  })

  assert.equal(detached.status, 0, detached.stderr)
  assert.equal(detached.stdout, '0')
  assert.equal(attached.status, 0, attached.stderr)
  assert.ok(Number.parseInt(attached.stdout, 10) > 0, attached.stdout)
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
  const profileName = 'free-session-001'
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    profileName,
    spawnProcess: (_executable, arguments_, options) => {
      childArguments = arguments_
      childEnvironment = options.env
      return child
    },
    logStore: { append: async (line) => logLines.push(line) },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
    pathEntries: ['C:\\desktop-runtime-bin'],
    environmentProvider: () => ({
      QQBOT_APPID: 'desktop-app',
      QQBOT_SECRET: 'runtime-only',
      // This is the exact additional environment supplied by the confirmed
      // primary Runtime launch path. It must survive the
      // controller's child-environment construction rather than merely being
      // recorded in Desktop state.
      DSH_PERMISSION_MODE: 'danger-full-access',
    }),
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
  assert.equal(childEnvironment.DSH_PROFILE, profileName)
  assert.equal(childEnvironment.DSH_SKIN_PROFILE, profileName)
  assert.equal(childArguments[childArguments.indexOf('--profile') + 1], profileName)
  assert.equal(childArguments[childArguments.indexOf('--port') + 1], '43124')
  assert.deepEqual(readyPorts, [43_125])
  assert.equal(
    childEnvironment.DSH_SKINS_DIR,
    join('C:\\isolated-home', 'profiles', profileName, 'node_modules', '@linxin666'),
  )
  assert.equal(childEnvironment.QQBOT_APPID, 'desktop-app')
  assert.equal(childEnvironment.QQBOT_SECRET, 'runtime-only')
  assert.equal(childEnvironment.DSH_PERMISSION_MODE, 'danger-full-access')
  assert.equal(isDesktopWorkspaceFileOpenToken(childEnvironment[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV]), true)
  assert.equal(controller.getWorkspaceFileOpenToken(), childEnvironment[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV])
  assert.equal(logLines.some((line) => line.includes(childEnvironment[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV])), false)
  assert.ok(childEnvironment.PATH.startsWith(`C:\\desktop-runtime-bin${process.platform === 'win32' ? ';' : ':'}`))

  await controller.stop()
  assert.equal(controller.status.state, 'stopped')
  assert.equal(controller.getWorkspaceFileOpenToken(), undefined)
  assert.equal(child.killed, true)
})

test('forceStop reclaims a partially started child without waiting for normal shutdown', async () => {
  const child = new FakeChild()
  let terminated = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\same-home',
    spawnProcess: () => child,
    terminateProcessTree: async target => {
      terminated += 1
      target.kill('SIGKILL')
    },
    startupTimeoutMs: 2_000,
    platform: 'linux',
  })

  const starting = controller.start()
  await controller.forceStop()
  await assert.rejects(starting, /cancelled by force stop/u)
  assert.equal(controller.status.state, 'stopped')
  assert.equal(terminated, 1)
  assert.equal(child.killed, true)
})

test('controller rejects an invalid runtime profile name before spawning', () => {
  for (const profileName of ['', '../desktop', 'desktop/profile', 'desktop profile', 'x'.repeat(65)]) {
    assert.throws(
      () => new DshRuntimeController({
        cliPath: 'dsh-bin.js',
        cwd: process.cwd(),
        dshHome: 'C:\\isolated-home',
        profileName,
      }),
      /runtime profile name/u,
    )
  }
})

test('runtime capability is redacted from child logs, errors, status, and line observers', async () => {
  const child = new FakeChild()
  const token = 'r'.repeat(43)
  const diagnostics = []
  const observedLines = []
  const observedStatuses = []
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    platform: 'linux',
    spawnProcess: () => child,
    logStore: { append: async (line) => diagnostics.push(line) },
    workspaceFileOpenTokenFactory: () => token,
    startupTimeoutMs: 2_000,
  })
  controller.on('line', (entry) => observedLines.push(entry))
  controller.on('status', (status) => observedStatuses.push(status))

  const ready = controller.start()
  child.stdout.write(`runtime stdout token=${token}\n`)
  child.stderr.write(`runtime stderr token=${token}\n`)
  child.emit('error', new Error(`runtime child failure token=${token}`))
  await assert.rejects(ready, /runtime child failure/u)
  await new Promise((resolve) => setImmediate(resolve))

  // Stdio can still flush after the capability field is cleared during failed
  // startup. The per-child redactor must cover that race too.
  assert.equal(controller.getWorkspaceFileOpenToken(), undefined)
  child.stderr.write(`late runtime stderr token=${token}\n`)
  await new Promise((resolve) => setImmediate(resolve))

  assert.ok(diagnostics.some((line) => line.includes('runtime stdout token=[redacted]')))
  assert.ok(diagnostics.some((line) => line.includes('runtime stderr token=[redacted]')))
  assert.ok(diagnostics.some((line) => line.includes('runtime child failure token=[redacted]')))
  assert.ok(diagnostics.some((line) => line.includes('late runtime stderr token=[redacted]')))
  assert.equal(diagnostics.some((line) => line.includes(token)), false)
  assert.equal(observedLines.some((entry) => entry.line.includes(token)), false)
  assert.equal(JSON.stringify(observedStatuses).includes(token), false)
  assert.ok(observedStatuses.some((status) => status.error?.includes('[redacted]')))
})

test('runtime restarts mint a fresh workspace-file capability and expose only the current ready token', async () => {
  const children = [new FakeChild(), new FakeChild()]
  const environments = []
  const tokens = ['a'.repeat(43), 'b'.repeat(43)]
  let spawnIndex = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    platform: 'linux',
    spawnProcess: (_executable, _arguments, options) => {
      environments.push(options.env)
      return children[spawnIndex++]
    },
    workspaceFileOpenTokenFactory: () => tokens.shift(),
    logStore: { append: async () => {} },
    probeReady: async () => {},
  })

  const firstReady = controller.start()
  assert.equal(controller.getWorkspaceFileOpenToken(), undefined)
  children[0].stdout.write('dsh web: http://127.0.0.1:43125\n')
  await firstReady
  assert.equal(controller.getWorkspaceFileOpenToken(), 'a'.repeat(43))

  await controller.stop()
  assert.equal(controller.getWorkspaceFileOpenToken(), undefined)
  const secondReady = controller.start()
  children[1].stdout.write('dsh web: http://127.0.0.1:43126\n')
  await secondReady
  assert.equal(controller.getWorkspaceFileOpenToken(), 'b'.repeat(43))
  assert.notEqual(
    environments[0][DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV],
    environments[1][DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV],
  )
  await controller.stop()
})

test('runtime fails closed before spawn when a workspace-file capability is invalid', async () => {
  let spawnCalls = 0
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    platform: 'linux',
    spawnProcess: () => {
      spawnCalls += 1
      return new FakeChild()
    },
    workspaceFileOpenTokenFactory: () => 'not-a-runtime-secret',
    logStore: { append: async () => {} },
  })
  await assert.rejects(controller.start(), /workspace file open token factory returned an invalid token/u)
  assert.equal(spawnCalls, 0)
  assert.equal(controller.getWorkspaceFileOpenToken(), undefined)
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

test('POSIX shutdown signals the runtime process group, not just the direct child', async () => {
  const signals = []
  const child = {
    pid: 43125,
    exitCode: null,
    kill: (signal) => signals.push({ direct: signal }),
  }
  await terminateChildProcessTree(child, {
    platform: 'darwin',
    processKill: (pid, signal) => signals.push({ pid, signal }),
  })
  // The negated pid is the whole group: the runtime plus everything it spawned.
  assert.deepEqual(signals, [{ pid: -43125, signal: 'SIGTERM' }])
})

test('POSIX shutdown falls back to the direct child when the group cannot be signalled', async () => {
  for (const code of ['ESRCH', 'EPERM']) {
    const signals = []
    const child = {
      pid: 43125,
      exitCode: null,
      kill: (signal) => signals.push({ direct: signal }),
    }
    await terminateChildProcessTree(child, {
      platform: 'darwin',
      processKill: () => {
        const error = new Error(code)
        error.code = code
        throw error
      },
    })
    // A group that cannot be signalled must never become no signal at all.
    assert.deepEqual(signals, [{ direct: 'SIGTERM' }], `fallback for ${code}`)
  }
})

test('POSIX shutdown propagates unexpected process-kill failures instead of swallowing them', () => {
  const child = { pid: 43125, exitCode: null, kill: () => {} }
  // Only ESRCH and EPERM mean "no group to signal". Anything else is a real
  // fault and must surface, not be mistaken for a completed shutdown. The throw
  // is synchronous because the POSIX branch never awaits anything.
  assert.throws(
    () => terminateChildProcessTree(child, {
      platform: 'darwin',
      processKill: () => {
        const error = new Error('EINVAL')
        error.code = 'EINVAL'
        throw error
      },
    }),
    /EINVAL/,
  )
})

test('force kill surfaces an unexpected errno rather than reporting a completed kill', () => {
  const seen = []
  assert.throws(() => forceKillChildProcessTree(
    { pid: 43125, exitCode: null, kill: (signal) => seen.push(signal) },
    {
      platform: 'darwin',
      processKill: () => {
        const error = new Error('EINVAL')
        error.code = 'EINVAL'
        throw error
      },
    },
  ), /EINVAL/)
  // The direct kill is the controller's fallback, not this function's: the
  // caller has to decide whether an unexpected errno is recoverable.
  assert.deepEqual(seen, [])
})

test('a failing force kill is contained: the controller logs it and still kills the child', async () => {
  const diagnostics = []
  const child = new FakeChild()
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: '/isolated-home',
    platform: 'darwin',
    spawnProcess: () => child,
    logStore: { append: async (line) => { diagnostics.push(line) } },
    probeReady: async () => {},
    // The graceful path fails, so the escalation runs; the escalation then
    // throws the way an unexpected errno would.
    terminateProcessTree: async () => { throw new Error('group shutdown unavailable') },
    forceTerminateProcessTree: () => {
      const error = new Error('EINVAL')
      error.code = 'EINVAL'
      throw error
    },
  })
  const ready = controller.start()
  child.stdout.write('dsh web: http://127.0.0.1:43125\n')
  await ready
  // A throwing escalation must not reject stop(): timers and catch blocks are
  // the only callers, and an escape there would take down the app.
  await controller.stop()
  assert.equal(child.killed, true)
  assert.ok(
    diagnostics.some((line) => line.includes('force kill failed') && line.includes('EINVAL')),
    `expected a contained force-kill diagnostic, saw ${JSON.stringify(diagnostics)}`,
  )
})

test('POSIX shutdown skips the group signal when the child has no usable pid', async () => {
  for (const pid of [undefined, 0, -1, 1.5]) {
    const signals = []
    const child = { pid, exitCode: null, kill: (signal) => signals.push({ direct: signal }) }
    await terminateChildProcessTree(child, {
      platform: 'darwin',
      processKill: () => { throw new Error('process group must not be signalled') },
    })
    assert.deepEqual(signals, [{ direct: 'SIGTERM' }], `pid ${String(pid)}`)
  }
})

test('Windows shutdown never reaches for a POSIX process group', async () => {
  const calls = []
  const child = { pid: 43125, exitCode: null, kill: (signal) => calls.push({ direct: signal }) }
  await terminateChildProcessTree(child, {
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    execFileFn: (executable, args, options, callback) => {
      calls.push({ executable, args })
      callback(null)
    },
    // Reaching for a process group on Windows would be the regression this
    // whole change has to avoid, so the injected kill is a tripwire.
    processKill: () => { throw new Error('taskkill owns the Windows tree') },
  })
  assert.equal(calls.length, 1)
  // The path separator is whatever `path.join` produces on the host, which is
  // why only the executable name is asserted here.
  assert.match(calls[0].executable, /taskkill\.exe$/)
  assert.deepEqual(calls[0].args, ['/PID', '43125', '/T', '/F'])
})

test('force kill escalates to the POSIX process group and keeps the Windows direct kill', () => {
  const posix = []
  forceKillChildProcessTree(
    { pid: 43125, exitCode: null, kill: (signal) => posix.push({ direct: signal }) },
    { platform: 'darwin', processKill: (pid, signal) => posix.push({ pid, signal }) },
  )
  assert.deepEqual(posix, [{ pid: -43125, signal: 'SIGKILL' }])

  const windows = []
  forceKillChildProcessTree(
    { pid: 43125, exitCode: null, kill: (signal) => windows.push({ direct: signal }) },
    { platform: 'win32', processKill: () => { throw new Error('not on Windows') } },
  )
  assert.deepEqual(windows, [{ direct: 'SIGKILL' }])

  const fallback = []
  forceKillChildProcessTree(
    { pid: 43125, exitCode: null, kill: (signal) => fallback.push({ direct: signal }) },
    {
      platform: 'darwin',
      processKill: () => {
        const error = new Error('ESRCH')
        error.code = 'ESRCH'
        throw error
      },
    },
  )
  assert.deepEqual(fallback, [{ direct: 'SIGKILL' }])
})

test('force kill leaves an already exited child alone', () => {
  let touched = false
  forceKillChildProcessTree(
    { pid: 43125, exitCode: 0, kill: () => { touched = true } },
    { platform: 'darwin', processKill: () => { touched = true } },
  )
  forceKillChildProcessTree(undefined, { platform: 'darwin' })
  assert.equal(touched, false)
})

test('runtime child becomes a process-group leader on POSIX but not on Windows', async () => {
  const observed = []
  const run = async (platform) => {
    const child = new FakeChild()
    const controller = new DshRuntimeController({
      cliPath: 'dsh-bin.js',
      cwd: process.cwd(),
      dshHome: platform === 'win32' ? 'C:\\isolated-home' : '/isolated-home',
      platform,
      spawnProcess: (_executable, _arguments, options) => {
        observed.push({ platform, detached: options.detached })
        return child
      },
      logStore: { append: async () => {} },
      probeReady: async () => {},
      // Terminate for real so stop() resolves on the child's exit instead of
      // waiting out the shutdown timeout on every platform under test.
      terminateProcessTree: async (target) => { target.kill() },
    })
    const ready = controller.start()
    child.stdout.write('dsh web: http://127.0.0.1:43125\n')
    await ready
    await controller.stop()
  }
  await run('darwin')
  await run('linux')
  await run('win32')
  assert.deepEqual(observed, [
    { platform: 'darwin', detached: true },
    { platform: 'linux', detached: true },
    // `detached` on Windows means a new console, and `taskkill /T` already
    // walks the tree, so the Windows spawn must stay attached.
    { platform: 'win32', detached: false },
  ])
})
