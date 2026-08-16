import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  DesktopUpdateController,
  formatUpdateDetails,
  normalizeReleaseNotes,
} from '../src/updater.mjs'

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

function createHarness({ responses = [], enabled = true } = {}) {
  const updater = new FakeUpdater()
  const progress = []
  const logs = []
  const states = []
  let beforeInstallCalls = 0
  const controller = new DesktopUpdateController({
    updater,
    enabled,
    currentVersion: '1.0.0',
    getWindow: () => ({
      isDestroyed: () => false,
      setProgressBar: (value) => progress.push(value),
    }),
    log: (line) => logs.push(line),
    beforeInstall: async () => { beforeInstallCalls += 1 },
    setTimeoutFn: () => ({ unref() {} }),
    setIntervalFn: () => ({ unref() {} }),
    clearTimeoutFn: () => {},
    clearIntervalFn: () => {},
  })
  controller.on('status', (status) => states.push(status))
  controller.start()
  return { controller, updater, progress, logs, states, beforeInstallCalls: () => beforeInstallCalls }
}

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
