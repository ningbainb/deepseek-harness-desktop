import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { createDesktopShutdownLifecycle } from '../src/electron-app.mjs'
import { createDesktopInstallPreparation } from '../src/install-preparation.mjs'
import { DesktopUpdateController, UPDATE_INSTALL_PREPARATION_TIMEOUT_MS, UPDATE_INSTALL_LAUNCH_TIMEOUT_MS } from '../src/updater.mjs'

const tick = () => new Promise(resolve => setImmediate(resolve))
function updateController(f, launch = () => {}) {
  const updater = new EventEmitter()
  updater.quitAndInstall = launch
  const timers = []
  const controller = new DesktopUpdateController({
    updater, enabled: true, currentVersion: '3.3.0', getWindow: () => undefined,
    ...f.hooks,
    setTimeoutFn: (callback, delay) => {
      const timer = { callback, delay, cleared: false, unref() {} }
      timers.push(timer)
      return timer
    },
    clearTimeoutFn: timer => { timer.cleared = true },
    setIntervalFn: () => ({}), clearIntervalFn: () => {},
  })
  controller.start()
  updater.emit('update-downloaded', { version: '3.4.0' })
  return { updater, controller, timers }
}

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function fixture(overrides = {}) {
  const calls = []
  let quitting = false
  let preparing = false
  const lifecycle = createDesktopShutdownLifecycle({
    prepareStop: async () => { calls.push('quiesce') },
    saveState: async () => { calls.push('save') },
    stopRuntime: async () => { calls.push('stop') },
    resumeOperations: async () => { calls.push('resume') },
    startRuntime: async () => { calls.push('start') },
    disposeResources: async () => { calls.push('dispose') },
    ...overrides.lifecycle,
  })
  const hooks = createDesktopInstallPreparation({
    lifecycle,
    isQuitRequested: () => quitting,
    setPreparing: value => { preparing = value; calls.push(`preparing:${value}`) },
    recordInstallRequested: async () => { calls.push('receipt') },
    finishPreparation: async () => { calls.push('drain') },
    ...overrides.hooks,
  })
  return { calls, lifecycle, hooks, quit: () => { quitting = true }, get preparing() { return preparing } }
}

test('installer failure restores Runtime after reversible preparation, not disposal', async () => {
  const f = fixture()
  await f.hooks.beforeInstall()
  assert.equal(f.preparing, true)
  assert.equal(f.lifecycle.runtimeStopped, true)
  assert.equal(await f.hooks.onInstallFailure(new Error('launch failed')), true)
  assert.equal(f.preparing, false)
  assert.equal(f.lifecycle.runtimeStopped, false)
  assert.equal(f.lifecycle.operationsQuiesced, false)
  assert.deepEqual(f.calls, ['receipt', 'preparing:true', 'quiesce', 'save', 'stop', 'drain', 'preparing:false', 'resume', 'start'])
})

test('actual quit suppresses installer recovery and future preparation', async () => {
  const f = fixture()
  await f.hooks.beforeInstall()
  f.quit()
  await f.lifecycle.shutdown()
  assert.equal(await f.hooks.onInstallFailure(new Error('late failure')), false)
  await assert.rejects(f.hooks.beforeInstall(), /cancelled/u)
  assert.equal(f.calls.includes('start'), false)
  assert.equal(f.lifecycle.resourcesDisposed, true)
})

test('receipt timeout invalidates late preparation without restarting a healthy Runtime', async () => {
  const receipt = deferred()
  const entered = deferred()
  const f = fixture({ hooks: { recordInstallRequested: () => { entered.resolve(); return receipt.promise } } })
  const pending = f.hooks.beforeInstall()
  const cancelled = assert.rejects(pending, /cancelled/u)
  await entered.promise
  assert.equal(await f.hooks.onInstallFailure(new Error('prepare timeout')), true)
  receipt.resolve()
  await cancelled
  assert.deepEqual(f.calls, [])
})

test('duplicate failure notifications share one recovery', async () => {
  const resumed = deferred()
  const entered = deferred()
  const f = fixture({ lifecycle: { resumeOperations: () => { entered.resolve(); return resumed.promise } } })
  await f.hooks.beforeInstall()
  const first = f.hooks.onInstallFailure(new Error('first'))
  await entered.promise
  const second = f.hooks.onInstallFailure(new Error('duplicate'))
  assert.equal(first, second)
  resumed.resolve()
  assert.equal(await first, true)
  assert.equal(f.calls.filter(call => call === 'start').length, 1)
  assert.equal(await f.hooks.onInstallFailure(new Error('late duplicate')), true)
  assert.equal(f.calls.filter(call => call === 'start').length, 1)
})

test('quit during operation resume prevents Runtime from being started', async () => {
  const resumed = deferred()
  const entered = deferred()
  const f = fixture({ lifecycle: { resumeOperations: () => { entered.resolve(); return resumed.promise } } })
  await f.hooks.beforeInstall()
  const recovery = f.hooks.onInstallFailure(new Error('launch failed'))
  await entered.promise
  f.quit()
  const shutdown = f.lifecycle.shutdown()
  resumed.resolve()
  assert.equal(await recovery, false)
  await shutdown
  assert.equal(f.calls.includes('start'), false)
  assert.equal(f.lifecycle.operationsQuiesced, true)
  assert.equal(f.lifecycle.resourcesDisposed, true)
})

test('quit during Runtime start waits then stops that Runtime before disposing', async () => {
  const started = deferred()
  const entered = deferred()
  const f = fixture({ lifecycle: { startRuntime: () => { entered.resolve(); return started.promise } } })
  await f.hooks.beforeInstall()
  const recovery = f.hooks.onInstallFailure(new Error('launch failed'))
  await entered.promise
  f.quit()
  const shutdown = f.lifecycle.shutdown()
  await Promise.resolve()
  assert.equal(f.calls.includes('dispose'), false)
  started.resolve()
  assert.equal(await recovery, false)
  await shutdown
  assert.equal(f.calls.filter(call => call === 'stop').length, 2)
  assert.equal(f.calls.at(-1), 'dispose')
  assert.equal(f.lifecycle.runtimeStopped, true)
})

test('a failed attempt can be followed by another preparation and recovery', async () => {
  const f = fixture()
  for (let iteration = 0; iteration < 2; iteration++) {
    await f.hooks.beforeInstall()
    assert.equal(await f.hooks.onInstallFailure(new Error('launch failed')), true)
  }
  assert.equal(f.calls.filter(call => call === 'stop').length, 2)
  assert.equal(f.calls.filter(call => call === 'start').length, 2)
})

test('real update controller and Desktop hooks recover from synchronous installer launch failure', async () => {
  const f = fixture()
  const { controller } = updateController(f, () => { throw new Error('installer unavailable') })
  try {
    assert.equal(await controller.install(), false)
    assert.equal(controller.getStatus().phase, 'error')
    assert.equal(f.lifecycle.runtimeStopped, false)
    assert.equal(f.preparing, false)
    assert.equal(f.calls.filter(call => call === 'start').length, 1)
  } finally { controller.dispose() }
})

test('real update controller launch timeout restores the Desktop without disposing it', async () => {
  const f = fixture()
  const { controller, timers } = updateController(f)
  try {
    assert.equal(await controller.install(), true)
    timers.find(timer => timer.delay === UPDATE_INSTALL_LAUNCH_TIMEOUT_MS).callback()
    await tick()
    assert.equal(controller.getStatus().phase, 'error')
    assert.equal(f.lifecycle.runtimeStopped, false)
    assert.equal(f.lifecycle.resourcesDisposed, false)
  } finally { controller.dispose() }
})

for (const stage of ['stop', 'drain']) {
  test(`preparation timeout during ${stage} recovers once and cancels late installer launch`, async () => {
    const entered = deferred()
    const pending = deferred()
    const waitForStage = () => { entered.resolve(); return pending.promise }
    let stopCount = 0
    const f = fixture(stage === 'stop' ? {
      lifecycle: { stopRuntime: () => { stopCount += 1; return waitForStage() } },
    } : { hooks: { finishPreparation: waitForStage } })
    let launches = 0
    const { controller, timers } = updateController(f, () => { launches += 1 })
    let installation
    try {
      installation = controller.install()
      await entered.promise
      timers.find(timer => timer.delay === UPDATE_INSTALL_PREPARATION_TIMEOUT_MS).callback()
      await tick()
      if (stage === 'stop') assert.equal(f.calls.includes('start'), false)
      pending.resolve()
      assert.equal(await installation, false)
      await tick()
      assert.equal(launches, 0)
      assert.equal(f.calls.filter(call => call === 'start').length, 1)
      if (stage === 'stop') assert.equal(stopCount, 1)
      assert.equal(f.preparing, false)
      assert.equal(f.lifecycle.runtimeStopped, false)
      assert.equal(f.lifecycle.operationsQuiesced, false)
      assert.equal(f.lifecycle.resourcesDisposed, false)
      assert.equal(controller.getStatus().phase, 'error')
    } finally {
      pending.resolve()
      await installation
      controller.dispose()
    }
  })
}

test('late timed-out preparation cannot cancel the next attempts deadline', async () => {
  const receipts = [deferred(), deferred()]
  const entered = [deferred(), deferred()]
  let receiptIndex = 0
  const f = fixture({ hooks: { recordInstallRequested: () => {
    const index = receiptIndex++
    entered[index].resolve()
    return receipts[index].promise
  } } })
  const { controller, timers, updater } = updateController(f)
  let second
  try {
    const first = controller.install()
    await entered[0].promise
    timers.find(timer => timer.delay === UPDATE_INSTALL_PREPARATION_TIMEOUT_MS).callback()
    assert.equal(await first, false)
    updater.emit('update-downloaded', { version: '3.4.0' })
    second = controller.install()
    await entered[1].promise
    const deadline = timers.filter(timer => timer.delay === UPDATE_INSTALL_PREPARATION_TIMEOUT_MS).at(-1)
    receipts[0].resolve()
    await tick()
    assert.equal(deadline.cleared, false, 'old preparation cleared the new attempt deadline')
    deadline.callback()
    assert.equal(await second, false)
  } finally {
    receipts.forEach(receipt => receipt.resolve())
    await second
    controller.dispose()
  }
})

for (const result of ['resolve', 'reject']) {
  test(`late preparation ${result} cannot launch or fail a newer install attempt`, async () => {
    const operations = [deferred(), deferred()]
    const entered = [deferred(), deferred()]
    let index = 0
    let launches = 0
    const { controller, updater, timers } = updateController({ hooks: {
      beforeInstall: () => { const current = index++; entered[current].resolve(); return operations[current].promise },
      onInstallFailure: async () => {},
    } }, () => { launches += 1 })
    let first
    let second
    try {
      first = controller.install()
      await entered[0].promise
      updater.emit('error', new Error('old install failed'))
      await tick()
      updater.emit('update-downloaded', { version: '3.4.0' })
      second = controller.install()
      await entered[1].promise
      const deadline = timers.filter(timer => timer.delay === UPDATE_INSTALL_PREPARATION_TIMEOUT_MS).at(-1)
      operations[0][result](new Error('late old result'))
      assert.equal(await first, false)
      assert.equal(launches, 0)
      assert.equal(controller.getStatus().phase, 'installing')
      assert.equal(deadline.cleared, false)
      operations[1].resolve()
      assert.equal(await second, true)
      assert.equal(launches, 1)
    } finally {
      operations.forEach(operation => operation.resolve())
      await Promise.all([first, second])
      controller.dispose()
    }
  })
}
