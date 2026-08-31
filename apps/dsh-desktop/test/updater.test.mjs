import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  DesktopUpdateController,
  UPDATE_INSTALL_LAUNCH_TIMEOUT_MS,
  UPDATE_INSTALL_PREPARATION_TIMEOUT_MS,
  formatUpdateDetails,
  normalizeReleaseNotes,
} from '../src/updater.mjs'
import {
  requestsDisableUpdates,
  resolveDesktopProxyConfiguration,
} from '../src/electron-app.mjs'

const tick = () => new Promise((resolve) => setImmediate(resolve))

class FakeUpdater extends EventEmitter {
  checks = 0
  downloads = 0
  installs = 0

  async checkForUpdates() {
    this.checks += 1
  }

  async downloadUpdate() {
    this.downloads += 1
  }

  quitAndInstall() {
    this.installs += 1
  }
}

function createHarness({
  enabled = true,
  currentVersion = '1.0.0',
  updateChannel,
  beforeInstall,
  onInstallFailure,
  downloadRouter,
  log,
  getWindow,
  setTimeoutFn = () => ({ unref() {} }),
  clearTimeoutFn = () => {},
  installPreparationTimeoutMs = UPDATE_INSTALL_PREPARATION_TIMEOUT_MS,
} = {}) {
  const updater = new FakeUpdater()
  const progress = []
  const logs = []
  const states = []
  let beforeInstallCalls = 0
  const controller = new DesktopUpdateController({
    updater,
    enabled,
    currentVersion,
    updateChannel,
    getWindow: getWindow ?? (() => ({
      isDestroyed: () => false,
      setProgressBar: (value) => progress.push(value),
    })),
    log: log ?? ((line) => logs.push(line)),
    beforeInstall: async () => {
      beforeInstallCalls += 1
      await beforeInstall?.()
    },
    onInstallFailure,
    downloadRouter,
    setTimeoutFn,
    installPreparationTimeoutMs,
    setIntervalFn: () => ({ unref() {} }),
    clearTimeoutFn,
    clearIntervalFn: () => {},
  })
  controller.on('status', (status) => states.push(status))
  controller.start()
  return { controller, updater, progress, logs, states, beforeInstallCalls: () => beforeInstallCalls }
}

test('updater selects beta metadata only when the persisted channel is beta', () => {
  const stable = createHarness()
  assert.equal(stable.controller.getChannel(), 'stable')
  assert.equal(stable.updater.channel, 'latest')
  assert.equal(stable.updater.allowPrerelease, false)
  assert.equal(stable.updater.allowDowngrade, false)
  stable.controller.dispose()

  const beta = createHarness({ updateChannel: 'beta' })
  assert.equal(beta.controller.getChannel(), 'beta')
  assert.equal(beta.updater.channel, 'beta')
  assert.equal(beta.updater.allowPrerelease, true)
  assert.equal(beta.updater.allowDowngrade, false)
  beta.controller.dispose()
})
test('stable ignores beta metadata and never downloads a lower Stable release after beta', async () => {
  const stable = createHarness()
  await stable.controller.check()
  stable.updater.emit('update-available', { version: '1.1.0-beta.1', releaseNotes: 'Beta.' })
  await tick()
  assert.equal(stable.updater.downloads, 0)
  assert.ok(stable.logs.some((line) => line.includes('channel-mismatch')))
  stable.controller.dispose()

  const switched = createHarness({ currentVersion: '1.1.0-beta.2', updateChannel: 'stable' })
  await switched.controller.check()
  switched.updater.emit('update-available', { version: '1.0.0', releaseNotes: 'Stable.' })
  await tick()
  assert.equal(switched.updater.downloads, 0)
  assert.ok(switched.logs.some((line) => line.includes('downgrade')))
  switched.controller.dispose()
})
test('download failover publishes the active source and suppresses intermediate errors', async () => {
  let retrying = true
  let updater
  const downloadRouter = {
    shouldDeferError: () => retrying,
    async downloadUpdate(_info, { onSource }) {
      onSource({ label: '国内镜像 fast.example' })
      updater.emit('error', new Error('mirror connection reset'))
      await tick()
      retrying = false
      onSource({ label: 'GitHub 官方' })
      return ['downloaded.exe']
    },
  }
  const harness = createHarness({ downloadRouter })
  updater = harness.updater

  await harness.controller.check()
  updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()
  await tick()

  assert.equal(harness.controller.getStatus().phase, 'downloading')
  assert.equal(harness.controller.getStatus().source, 'GitHub 官方')
  assert.ok(harness.logs.some((line) => line.includes('retrying another source')))
  updater.emit('update-downloaded', { version: '1.1.0' })
  await tick()
  assert.equal(harness.controller.getStatus().phase, 'ready')
})

test('release notes are converted to safe readable text', () => {
  assert.equal(
    normalizeReleaseNotes('<h2>Highlights</h2><p>Fix &amp; polish</p><ul><li>Fast</li></ul>'),
    'Highlights\nFix & polish\n- Fast',
  )
  const details = formatUpdateDetails({
    version: '1.1.0',
    releaseName: 'Stable release',
    releaseDate: '2026-08-14T00:00:00.000Z',
    releaseNotes: [{ version: '1.1.0', note: '# Changes\n- Faster updates' }],
  }, '1.0.0')
  assert.match(details, /当前版本 \/ Current version: 1\.0\.0/)
  assert.match(details, /新版本 \/ New version: 1\.1\.0/)
  assert.match(details, /更新内容 \/ What's new/)
  assert.match(details, /版本 \/ Version 1\.1\.0\nChanges\n- Faster updates/)
})

test('available update starts downloading in the background without prompting', async () => {
  const harness = createHarness()
  await harness.controller.check()
  harness.updater.emit('update-available', {
    version: '1.1.0',
    releaseName: 'Taskbar icon and updater',
    releaseNotes: 'Complete release notes.',
  })
  await tick()
  assert.equal(harness.updater.downloads, 1)
  assert.deepEqual(harness.controller.getStatus(), {
    phase: 'downloading',
    currentVersion: '1.0.0',
    version: '1.1.0',
    releaseName: 'Taskbar icon and updater',
    releaseNotes: 'Complete release notes.',
    percent: 0,
    visible: false,
  })
})

test('manual check during a background download reveals the current progress', async () => {
  const harness = createHarness()
  await harness.controller.check()
  harness.updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()
  harness.updater.emit('download-progress', { percent: 42.5 })
  assert.equal(await harness.controller.check({ manual: true }), false)
  assert.equal(harness.updater.checks, 1)
  assert.equal(harness.controller.getStatus().visible, true)
  assert.equal(harness.controller.getStatus().percent, 42.5)
})

test('downloaded update waits for an explicit renderer install action', async () => {
  const harness = createHarness()
  await harness.controller.check()
  harness.updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()
  assert.equal(harness.updater.downloads, 1)
  harness.updater.emit('download-progress', { percent: 42.5 })
  harness.updater.emit('update-downloaded', { version: '1.1.0' })
  await tick()
  assert.ok(harness.progress.includes(0.425))
  assert.equal(harness.controller.getStatus().phase, 'ready')
  assert.equal(harness.controller.getStatus().visible, true)
  assert.equal(harness.beforeInstallCalls(), 0)
  assert.equal(harness.updater.installs, 0)

  assert.equal(await harness.controller.install(), true)
  assert.equal(harness.beforeInstallCalls(), 1)
  assert.equal(harness.updater.installs, 1)
  harness.controller.dispose()
})

test('taskbar progress failures cannot interrupt update downloads', async () => {
  const harness = createHarness({
    getWindow: () => ({
      isDestroyed: () => false,
      setProgressBar: () => { throw new Error('taskbar window closed') },
    }),
  })

  await harness.controller.check()
  harness.updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()

  assert.equal(harness.updater.downloads, 1)
  assert.equal(harness.controller.getStatus().phase, 'downloading')
  assert.ok(harness.logs.some((line) => line.includes('taskbar progress failed: taskbar window closed')))
})

test('update observer failures cannot change controller results or block later observers', async () => {
  const harness = createHarness()
  const observed = []
  harness.controller.on('status', () => { throw new Error('renderer update send failed') })
  harness.controller.on('status', (status) => observed.push(status.phase))

  assert.equal(await harness.controller.check({ manual: true }), true)
  assert.equal(harness.controller.getStatus().phase, 'checking')
  harness.updater.emit('update-not-available')
  await tick()

  assert.equal(harness.controller.getStatus().phase, 'current')
  assert.deepEqual(observed, ['checking', 'current'])
  assert.ok(harness.logs.some((line) => line.includes('status observer failed: renderer update send failed')))
})

test('update diagnostics cannot take ownership of the update state machine', async () => {
  const harness = createHarness({
    log: () => { throw new Error('log destination unavailable') },
  })

  assert.equal(await harness.controller.check({ manual: true }), true)
  harness.updater.emit('update-not-available')
  await tick()

  assert.equal(harness.controller.getStatus().phase, 'current')
  assert.equal(harness.controller.getStatus().visible, true)
})

test('asynchronous update observer rejections become diagnostics', async () => {
  const harness = createHarness()
  harness.controller.on('status', async () => {
    throw new Error('async renderer update send failed')
  })

  assert.equal(await harness.controller.check(), true)
  await tick()

  assert.equal(harness.controller.getStatus().phase, 'checking')
  assert.ok(harness.logs.some((line) => line.includes('status observer failed: async renderer update send failed')))
})

test('concurrent install requests share one shutdown and installer launch', async () => {
  let releaseInstall
  const installBarrier = new Promise((resolve) => { releaseInstall = resolve })
  const harness = createHarness({ beforeInstall: () => installBarrier })
  await harness.controller.check()
  harness.updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()
  harness.updater.emit('update-downloaded', { version: '1.1.0' })
  await tick()

  const first = harness.controller.install()
  const second = harness.controller.install()
  assert.equal(await second, false)
  assert.equal(harness.controller.getStatus().phase, 'installing')
  assert.equal(harness.beforeInstallCalls(), 1)

  releaseInstall()
  assert.equal(await first, true)
  assert.equal(harness.updater.installs, 1)
  harness.controller.dispose()
})

test('an updater error during install invokes runtime recovery exactly once', async () => {
  let recoveries = 0
  const harness = createHarness({
    onInstallFailure: async () => { recoveries += 1 },
  })
  await harness.controller.check()
  harness.updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()
  harness.updater.emit('update-downloaded', { version: '1.1.0' })
  await tick()

  assert.equal(await harness.controller.install(), true)
  harness.updater.emit('error', new Error('installer launch failed'))
  await tick()
  harness.updater.emit('error', new Error('duplicate updater error'))
  await tick()

  assert.equal(recoveries, 1)
  assert.equal(harness.controller.getStatus().phase, 'error')
  assert.match(harness.controller.getStatus().message, /duplicate updater error/)
  harness.controller.dispose()
})

test('installer launch timeout restores the runtime instead of leaving a stopped shell', async () => {
  const timers = []
  let recoveries = 0
  const harness = createHarness({
    onInstallFailure: async () => { recoveries += 1 },
    setTimeoutFn: (callback, delay) => {
      const timer = { callback, delay, unref() {} }
      timers.push(timer)
      return timer
    },
  })
  await harness.controller.check()
  harness.updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()
  harness.updater.emit('update-downloaded', { version: '1.1.0' })
  await tick()
  assert.equal(await harness.controller.install(), true)

  const launchTimer = timers.find((timer) => timer.delay === UPDATE_INSTALL_LAUNCH_TIMEOUT_MS)
  assert.ok(launchTimer)
  launchTimer.callback()
  await tick()

  assert.equal(recoveries, 1)
  assert.equal(harness.controller.getStatus().phase, 'error')
  assert.match(harness.controller.getStatus().message, /launch timeout/)
  harness.controller.dispose()
})

test('manual no-update result is visible while automatic errors stay hidden', async () => {
  const harness = createHarness()
  await harness.controller.check({ manual: true })
  harness.updater.emit('update-not-available')
  await tick()
  assert.equal(harness.controller.getStatus().phase, 'current')
  assert.equal(harness.controller.getStatus().visible, true)

  await harness.controller.check()
  harness.updater.emit('error', new Error('network unavailable'))
  await tick()
  assert.equal(harness.controller.getStatus().phase, 'error')
  assert.equal(harness.controller.getStatus().visible, false)
  assert.ok(harness.logs.some((line) => line.includes('network unavailable')))
})

test('manual update errors are visible and clear taskbar progress', async () => {
  const harness = createHarness()
  await harness.controller.check({ manual: true })
  harness.updater.emit('error', new Error('metadata missing'))
  await tick()
  assert.equal(harness.controller.getStatus().phase, 'error')
  assert.equal(harness.controller.getStatus().visible, true)
  assert.match(harness.controller.getStatus().message, /metadata missing/)
  assert.equal(harness.progress.at(-1), -1)
})

test('manual checks explain when updates are unavailable in development', async () => {
  const harness = createHarness({ enabled: false })
  assert.equal(await harness.controller.check({ manual: true }), false)
  assert.deepEqual(harness.controller.getStatus(), {
    phase: 'unavailable',
    currentVersion: '1.0.0',
    visible: true,
  })
})

test('hung install preparation exits with a bounded error and recovery callback', async () => {
  let recoveries = 0
  const harness = createHarness({
    beforeInstall: () => new Promise(() => {}),
    onInstallFailure: async () => { recoveries += 1 },
    installPreparationTimeoutMs: 10,
    setTimeoutFn: (callback, delay) => {
      const timer = { id: setTimeout(callback, delay), delay, unref() {} }
      return timer
    },
    clearTimeoutFn: (timer) => clearTimeout(timer.id),
  })

  await harness.controller.check()
  harness.updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Ready.' })
  await tick()
  harness.updater.emit('update-downloaded', { version: '1.1.0' })
  await tick()

  assert.equal(await harness.controller.install(), false)
  assert.equal(harness.updater.installs, 0)
  assert.equal(recoveries, 1)
  assert.equal(harness.controller.getStatus().phase, 'error')
  assert.match(harness.controller.getStatus().message, /update preparation did not finish before the timeout \(10ms\)/u)
  harness.controller.dispose()
})

test('requestsDisableUpdates recognizes CLI flags and environment variables', () => {
  assert.equal(requestsDisableUpdates([], { DSH_DESKTOP_DISABLE_UPDATES: '1' }), true)
  assert.equal(requestsDisableUpdates(['--disable-updater']), true)
  assert.equal(requestsDisableUpdates(['--DISABLE-UPDATES']), true)
  assert.equal(requestsDisableUpdates(['--no-updater']), true)
  assert.equal(requestsDisableUpdates(['--no-update']), true)
  assert.equal(requestsDisableUpdates(['--other-flag']), false)
  assert.equal(requestsDisableUpdates([]), false)
})

test('resolveDesktopProxyConfiguration extracts proxy rules from argv and environment', () => {
  assert.deepEqual(resolveDesktopProxyConfiguration(['--proxy-server=http://127.0.0.1:7890']), {
    proxyRules: 'http://127.0.0.1:7890',
  })
  assert.deepEqual(resolveDesktopProxyConfiguration([], {
    HTTP_PROXY: 'http://proxy.corp:8080',
    NO_PROXY: 'localhost,127.0.0.1',
  }), {
    proxyRules: 'http=http://proxy.corp:8080;https=http://proxy.corp:8080',
    proxyBypassRules: 'localhost,127.0.0.1',
  })
  assert.equal(resolveDesktopProxyConfiguration([], {}), undefined)
})
