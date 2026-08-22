import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'

import {
  applyUpdateSurface,
  createDesktopUpdateTriggerGuardScript,
  createUpdateSurfaceScript,
  installUpdateSurface,
  UPDATE_SURFACE_CSS,
} from '../src/update-surface.mjs'

test('update surface is an accessible Harness-themed dialog driven by desktop update state', () => {
  const script = createUpdateSurfaceScript()
  assert.match(UPDATE_SURFACE_CSS, /--dsw-alias-bg-base/u)
  assert.match(UPDATE_SURFACE_CSS, /--dsw-alias-button-info-fill/u)
  assert.match(UPDATE_SURFACE_CSS, /backdrop-filter: blur\(10px\)/u)
  assert.match(script, /role', 'dialog'/)
  assert.match(script, /aria-modal', 'true'/)
  assert.match(script, /getUpdateStatus/)
  assert.match(script, /onUpdateStatus/)
  assert.match(script, /installUpdate/)
  assert.match(script, /updates\.channel\.manage/)
  assert.match(script, /getUpdateChannel/)
  assert.match(script, /setUpdateChannel/)
  assert.match(script, /稳定版 Stable/)
  assert.match(script, /切换到稳定通道不会自动降级/)
  assert.match(script, /前往 GitHub 下载/)
  assert.match(script, /加入用户群/)
  assert.match(script, /稍后更新/)
  assert.match(script, /如果 GitHub 下载速度较慢，可以加入用户交流群/)
  assert.match(script, /helpAction\('downloads'\)/)
  assert.match(script, /helpAction\('community'\)/)
  assert.match(script, /重启并安装/)
  assert.match(script, /正在启动更新程序/)
  assert.match(script, /下载源.*value\.source/u)
  assert.match(script, /checkForUpdates\(\)\.catch\(\(\) => \{\}\)/u)
  assert.match(script, /installUpdate\(\)\.catch\(\(\) => \{\}\)\.finally/u)
})

test('desktop owns the sidebar download trigger across plugin replacement', async () => {
  const script = createDesktopUpdateTriggerGuardScript()
  let clickListener
  let checks = 0
  let prevented = false
  let propagationStopped = false
  let immediatePropagationStopped = false

  class FakeElement {
    constructor(attributes = {}) {
      this.attributes = new Map(Object.entries(attributes))
    }

    closest(selector) {
      if (selector.includes('#dsh-desktop-update-surface') && !selector.includes('button')) return null
      return selector.includes('button') ? this : null
    }

    getAttribute(name) { return this.attributes.get(name) ?? null }
    setAttribute(name, value) { this.attributes.set(name, String(value)) }
  }

  class FakeMutationObserver {
    constructor(callback) { this.callback = callback }
    observe() {}
    disconnect() {}
  }

  const document = {
    documentElement: new FakeElement(),
    querySelectorAll: () => [],
    addEventListener: (name, listener, capture) => {
      if (name === 'click' && capture === true) clickListener = listener
    },
    removeEventListener: () => {},
  }
  const window = {
    dshDesktop: {
      checkForUpdates: async () => { checks += 1 },
    },
  }
  vm.runInNewContext(script, { document, Element: FakeElement, MutationObserver: FakeMutationObserver, window })
  assert.equal(typeof clickListener, 'function')

  // Simulate a newly installed plugin replacing and re-rendering the old
  // trigger after the Desktop guard was already mounted.
  const replacement = new FakeElement({
    'data-dsh-update-entry': 'plugin',
    'aria-label': '检查插件更新',
  })
  clickListener({
    target: replacement,
    preventDefault: () => { prevented = true },
    stopPropagation: () => { propagationStopped = true },
    stopImmediatePropagation: () => { immediatePropagationStopped = true },
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(checks, 1)
  assert.equal(prevented, true)
  assert.equal(propagationStopped, true)
  assert.equal(immediatePropagationStopped, true)
  assert.equal(replacement.getAttribute('data-dsh-desktop-update-trigger'), 'true')
  assert.equal(replacement.getAttribute('aria-label'), '检查桌面版更新')
  assert.equal(replacement.getAttribute('title'), '检查桌面版更新')
})

test('update surface applies CSS before mounting and follows navigation', async () => {
  const calls = []
  const listeners = new Map()
  const webContents = {
    isDestroyed: () => false,
    insertCSS: async (css, options) => calls.push(['css', css, options]),
    executeJavaScript: async (script, userGesture) => {
      calls.push(['script', script, userGesture])
      return true
    },
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
  }
  assert.equal(await applyUpdateSurface({ webContents }), true)
  assert.deepEqual(calls.map((entry) => entry[0]), ['css', 'script', 'script'])
  assert.deepEqual(calls[0][2], { cssOrigin: 'author' })
  assert.equal(calls[1][2], true)
  assert.equal(calls[2][2], true)

  const dispose = installUpdateSurface({ browserWindow: { webContents } })
  assert.equal(typeof listeners.get('did-finish-load'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
})
