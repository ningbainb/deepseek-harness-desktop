import assert from 'node:assert/strict'
import test from 'node:test'
import { createConnection } from 'node:net'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { DshRuntimeController } from '../src/runtime-controller.mjs'
import { createRuntimeShutdownControl, consumeRuntimeShutdownControl, listenRuntimeShutdownControl, requestRuntimeShutdown, RUNTIME_SHUTDOWN_CONTROL_ENV } from '../src/runtime-shutdown-control.mjs'

test('private shutdown capability is unique per child and consumed before environment inheritance', () => {
  const first = createRuntimeShutdownControl()
  const second = createRuntimeShutdownControl()
  assert.notEqual(first.path, second.path)
  assert.notEqual(first.token, second.token)
  const environment = { [RUNTIME_SHUTDOWN_CONTROL_ENV]: JSON.stringify(first), KEEP: 'normal' }
  assert.deepEqual(consumeRuntimeShutdownControl(environment), first)
  assert.deepEqual(environment, { KEEP: 'normal' })
  for (const value of ['invalid', JSON.stringify({ ...first, path: 'C:/user/data' }), JSON.stringify({ ...first, token: 'short' }),
    JSON.stringify({ ...first, path: `${first.path}\n` }), JSON.stringify({ ...first, token: `${first.token}\n` })]) {
    const invalid = { [RUNTIME_SHUTDOWN_CONTROL_ENV]: value }
    assert.throws(() => consumeRuntimeShutdownControl(invalid), /Invalid Desktop shutdown control/)
    assert.deepEqual(invalid, {})
  }
})

test('authenticated stop waits for cleanup, refuses other capabilities and is single use', async () => {
  const control = createRuntimeShutdownControl()
  let stopCount = 0
  let release
  const cleanup = new Promise(resolve => { release = resolve })
  const dispose = await listenRuntimeShutdownControl(control, async () => { stopCount += 1; await cleanup })
  try {
    assert.equal(await requestRuntimeShutdown({ ...control, token: '0'.repeat(64) }), false)
    assert.equal(stopCount, 0)
    let completed = false
    const pending = requestRuntimeShutdown(control).then(value => { completed = true; return value })
    while (!stopCount) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(completed, false)
    release()
    assert.equal(await pending, true)
    assert.equal(stopCount, 1)
    assert.equal(await requestRuntimeShutdown(control), false)
  } finally { release(); dispose() }
})

test('failed, missing and hung control servers do not acknowledge a graceful shutdown', async () => {
  const absent = createRuntimeShutdownControl()
  assert.equal(await requestRuntimeShutdown(absent, 50), false)
  for (const shutdown of [() => { throw new Error('cleanup failed') }, () => new Promise(() => {})]) {
    const control = createRuntimeShutdownControl()
    const dispose = await listenRuntimeShutdownControl(control, shutdown)
    try { assert.equal(await requestRuntimeShutdown(control, 100), false) } finally { dispose() }
  }
})

test('overlong and arbitrary commands are rejected without invoking cleanup', async () => {
  const control = createRuntimeShutdownControl()
  let calls = 0
  const dispose = await listenRuntimeShutdownControl(control, () => { calls += 1 })
  try {
    for (const command of ['x'.repeat(100), `run ${control.token}\n`, `stop ${control.token}\nextra`, `stop ${control.token}\n\n`]) {
      await new Promise((resolve, reject) => {
        const socket = createConnection(control.path)
        socket.once('connect', () => socket.end(command))
        socket.once('error', reject)
        socket.once('close', resolve)
      })
      assert.equal(calls, 0)
    }
    assert.equal(await requestRuntimeShutdown(control), true)
    assert.equal(calls, 1)
  } finally { dispose() }
})

test('Windows controller requests its own child cleanup and retains legacy force fallback', { skip: process.platform !== 'win32' }, async () => {
  for (const available of [true, false]) {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null })
    let environment, stopCalls = 0, fallbackCalls = 0
    const logs = []
    const exit = () => { child.exitCode = 0; child.emit('exit', 0, null) }
    const controller = new DshRuntimeController({
      cliPath: 'C:/fixture/node_modules/@deepseek-ai/dsh/lib/bin.js', cwd: process.cwd(), dshHome: 'C:/fixture/home',
      platform: 'win32', probeReady: async () => {}, logStore: { append: async line => logs.push(line) },
      spawnProcess: (_executable, args, options) => {
        environment = { ...options.env }
        assert.equal(args.join(' ').includes(environment[RUNTIME_SHUTDOWN_CONTROL_ENV]), false)
        return child
      },
      terminateProcessTree: async () => { fallbackCalls += 1; exit() },
    })
    let dispose = () => {}
    try {
      const ready = controller.start()
      child.stdout.write('dsh web: http://127.0.0.1:43125\n')
      await ready
      const control = consumeRuntimeShutdownControl(environment)
      assert.ok(control)
      if (available) dispose = await listenRuntimeShutdownControl(control, () => {
        stopCalls += 1
        // A real launcher/wrapper exits after its cleanup acknowledgement.
        setTimeout(exit, 20)
      })
      await controller.stop()
      assert.equal(controller.status.state, 'stopped')
      assert.equal(stopCalls, available ? 1 : 0)
      assert.equal(fallbackCalls, available ? 0 : 1)
      assert.equal(JSON.stringify(logs).includes(control.token), false)
      assert.equal(JSON.stringify(controller.status).includes(control.token), false)
      assert.ok(logs.some(line => line.includes(available ? 'graceful shutdown acknowledged' : 'process-tree fallback')))
    } finally { dispose() }
  }
})

test('completed cleanup acknowledges before the child exits despite a surviving interval', async () => {
  const control = createRuntimeShutdownControl()
  const moduleUrl = new URL('../src/runtime-shutdown-control.mjs', import.meta.url).href
  const script = `import { consumeRuntimeShutdownControl, listenRuntimeShutdownControl } from ${JSON.stringify(moduleUrl)};
    await listenRuntimeShutdownControl(consumeRuntimeShutdownControl(), async () => {}, { onStopped: () => process.exit(0) });
    setInterval(() => {}, 1000);
    process.stdout.write('ready');`
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, [RUNTIME_SHUTDOWN_CONTROL_ENV]: JSON.stringify(control) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let timer
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  try {
    await Promise.race([
      new Promise(resolve => child.stdout.once('data', resolve)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('control fixture startup timeout')), 5000) }),
      exited.then(() => { throw new Error('control fixture exited before readiness') }),
    ])
    clearTimeout(timer)
    assert.equal(await requestRuntimeShutdown(control), true)
    const outcome = await Promise.race([
      exited,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('completed cleanup left the child alive')), 3000) }),
    ])
    assert.deepEqual(outcome, { code: 0, signal: null })
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null) child.kill()
    await exited
  }
})
