import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  DesktopTrayLifecycle,
  normalizeTrayTaskStatus,
  restoreDesktopWindow,
} from '../src/tray-lifecycle.mjs'

const tick = () => new Promise((resolve) => setImmediate(resolve))

class FakeTray extends EventEmitter {
  static created = []

  constructor(icon) {
    super()
    this.icon = icon
    this.destroyed = false
    FakeTray.created.push(this)
  }

  setToolTip(value) { this.tooltip = value }
  setContextMenu(menu) { this.menu = menu }
  destroy() { this.destroyed = true }
}

function createHarness({ Tray = FakeTray, icon = { isEmpty: () => false }, getTaskStatus } = {}) {
  const templates = []
  const calls = []
  const window = {
    minimized: true,
    restored: 0,
    shown: 0,
    focused: 0,
    isDestroyed: () => false,
    isMinimized() { return this.minimized },
    restore() { this.restored += 1; this.minimized = false },
    show() { this.shown += 1 },
    focus() { this.focused += 1 },
  }
  const lifecycle = new DesktopTrayLifecycle({
    Tray,
    Menu: {
      buildFromTemplate: (template) => {
        templates.push(template)
        return template
      },
    },
    nativeImage: { createEmpty: () => ({ isEmpty: () => false, fallback: true }) },
    icon,
    getWindow: () => window,
    openExtensions: () => calls.push('extensions'),
    openTaskStatus: () => calls.push('task-status'),
    checkForUpdates: (options) => calls.push(['updates', options]),
    requestQuit: () => calls.push('quit'),
    getTaskStatus: getTaskStatus ?? (() => ({ active: 1, queued: 2 })),
    log: (line) => calls.push(['log', line]),
  })
  return { lifecycle, templates, calls, window }
}

test('task status labels stay bounded and use a safe no-task fallback', () => {
  assert.equal(normalizeTrayTaskStatus(), '暂无后台任务 / No background tasks')
  assert.equal(normalizeTrayTaskStatus({ active: 2, queued: 3 }), '运行中 2，排队 3 / Active 2, queued 3')
  assert.equal(normalizeTrayTaskStatus(' one\n two '), 'one  two')
  assert.ok(normalizeTrayTaskStatus('a'.repeat(500)).length <= 180)
})

test('tray provides all background actions, restores on click/double-click, and remains main-process only', async () => {
  FakeTray.created = []
  const { lifecycle, templates, calls, window } = createHarness()
  assert.equal(lifecycle.ensure(), true)
  assert.equal(lifecycle.available, true)
  const tray = FakeTray.created.at(-1)
  assert.equal(tray.tooltip, 'DeepSeek Harness Desktop')
  await tick()

  const template = templates.at(-1)
  assert.deepEqual(
    template.filter((entry) => entry.type !== 'separator').map((entry) => entry.label),
    [
      '打开 / Open',
      '任务状态 / Task status: 运行中 1，排队 2 / Active 1, queued 2',
      '扩展坞 / Extension Dock',
      '检查更新 / Check for Updates',
      '退出 / Quit',
    ],
  )
  template[0].click()
  tray.emit('double-click')
  template[1].click()
  template[3].click()
  template[4].click()
  template[6].click()
  await tick()
  assert.equal(window.restored, 1)
  assert.equal(window.shown, 2)
  assert.equal(window.focused, 2)
  assert.deepEqual(calls, [
    'task-status',
    'extensions',
    ['updates', { manual: true }],
    'quit',
  ])
  assert.equal(lifecycle.dispose(), true)
  assert.equal(tray.destroyed, true)
  assert.equal(lifecycle.available, false)
})

test('tray falls back to a valid native image and failures never abort desktop startup', () => {
  FakeTray.created = []
  const { lifecycle } = createHarness({ icon: { isEmpty: () => true } })
  assert.equal(lifecycle.ensure(), true)
  assert.equal(FakeTray.created.at(-1).icon.fallback, true)

  const attempted = []
  class FallbackTray extends FakeTray {
    constructor(icon) {
      attempted.push(icon)
      if (!icon.fallback) throw new Error('preferred icon unsupported')
      super(icon)
    }
  }
  const retry = createHarness({ Tray: FallbackTray, icon: { isEmpty: () => false, preferred: true } })
  assert.equal(retry.lifecycle.ensure(), true)
  assert.equal(attempted.length, 2)
  assert.equal(attempted.at(-1).fallback, true)

  const diagnostics = []
  class FailingTray {
    constructor() { throw new Error('shell tray unavailable') }
  }
  const failed = new DesktopTrayLifecycle({
    Tray: FailingTray,
    Menu: { buildFromTemplate: () => [] },
    icon: { isEmpty: () => false },
    getWindow: () => undefined,
    log: (line) => diagnostics.push(line),
  })
  assert.doesNotThrow(() => failed.ensure())
  assert.equal(failed.available, false)
  assert.ok(diagnostics.some((line) => line.includes('shell tray unavailable')))
})

test('failed tray initialization disposes its native icon instead of leaking an unreachable entry', () => {
  FakeTray.created = []
  class FailedInitializationTray extends FakeTray {
    setToolTip() { throw new Error('tooltip initialization failed') }
  }
  const { lifecycle } = createHarness({ Tray: FailedInitializationTray })
  assert.equal(lifecycle.ensure(), false)
  assert.equal(lifecycle.available, false)
  assert.equal(FakeTray.created.length, 2)
  assert.ok(FakeTray.created.every(tray => tray.destroyed))
})

test('restore helper treats absent or destroyed windows as a safe no-op', () => {
  assert.equal(restoreDesktopWindow(undefined), false)
  assert.equal(restoreDesktopWindow({ isDestroyed: () => true }), false)
})
