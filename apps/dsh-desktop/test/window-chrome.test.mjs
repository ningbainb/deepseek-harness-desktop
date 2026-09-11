import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWindowChrome,
  createWindowChromeScript,
  decorateDesktopRuntimeUrl,
  getWindowChromeTheme,
  installWindowChrome,
  WINDOW_CHROME_CSS,
  WINDOW_CHROME_HEIGHT,
  normalizeWindowChromeTheme,
  observeWindowChromeDocument,
  setWindowChromeTheme,
  windowChromeBrowserOptions,
} from '../src/window-chrome.mjs'

function chromeObserverFixture() {
  let callback, queries = 0, disconnected = false
  const listeners = new Map(), marked = [], themeCalls = [], rootCalls = []
  const document = { documentElement: {}, candidates: [], querySelectorAll() { queries++; return this.candidates } }
  const chrome = { isConnected: true }
  const window = {
    MutationObserver: class {
      constructor(next) { callback = next }
      observe(_target, options) {
        for (const attribute of ['class', 'style', 'role', 'aria-modal', 'open', 'data-dsh-desktop-theme']) {
          assert.ok(options.attributeFilter.includes(attribute))
        }
      }
      disconnect() { disconnected = true }
    },
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: key => listeners.delete(key),
  }
  const node = (matches = true, children = []) => ({ nodeType: 1, isConnected: true, ownerDocument: document, matched: matches,
    firstElementChild: children[0], matches() { return this.matched }, querySelectorAll: () => children.filter(child => child.matched) })
  // Exercise the exact serialized function, without closures from its module.
  const install = new Function(`return (${observeWindowChromeDocument.toString()})`)()
  const start = () => install({ document, window, chrome, syncTheme: () => themeCalls.push(1),
    markViewportRoot: () => rootCalls.push(1), markModalLayer: element => marked.push(element) })
  return { document, chrome, listeners, marked, themeCalls, rootCalls, node, start,
    mutate: records => callback(records), state: () => ({ queries, disconnected }) }
}

test('window chrome indexes initial and added dialogs without full history queries on style updates', () => {
  const f = chromeObserverFixture(), initial = f.node()
  f.document.candidates.push(initial)
  const dispose = f.start()
  assert.deepEqual(f.marked, [initial])
  for (let i = 0; i < 100; i++) f.mutate([{ type: 'attributes', attributeName: 'class', target: f.node(false) }])
  assert.equal(f.state().queries, 1)
  assert.equal(f.themeCalls.length, 101)
  assert.equal(f.rootCalls.length, 101)
  const nested = f.node(), direct = f.node(), parent = f.node(false, [nested])
  f.mutate([{ type: 'childList', addedNodes: [parent, direct, { nodeType: 3 }] }])
  assert.deepEqual(f.marked.slice(-3), [initial, nested, direct])
  assert.equal(f.state().queries, 1)
  dispose()
})

test('window chrome tracks dynamic modal attributes and drops removed or adopted dialogs', () => {
  const f = chromeObserverFixture(), candidate = f.node(false)
  const dispose = f.start()
  f.mutate([{ type: 'childList', addedNodes: [candidate] }])
  assert.equal(f.marked.length, 0)
  for (const attributeName of ['role', 'aria-modal', 'open']) {
    candidate.matched = true
    f.mutate([{ type: 'attributes', attributeName, target: candidate }])
    assert.equal(f.marked.at(-1), candidate)
    candidate.matched = false
    const count = f.marked.length
    f.mutate([{ type: 'attributes', attributeName, target: candidate }])
    assert.equal(f.marked.length, count)
  }
  candidate.matched = true
  f.mutate([{ type: 'childList', addedNodes: [candidate] }])
  candidate.isConnected = false
  let count = f.marked.length
  f.mutate([{ type: 'childList', addedNodes: [] }])
  assert.equal(f.marked.length, count)
  candidate.isConnected = true
  f.mutate([{ type: 'childList', addedNodes: [candidate] }])
  candidate.ownerDocument = {}
  count = f.marked.length
  f.mutate([{ type: 'childList', addedNodes: [] }])
  assert.equal(f.marked.length, count)
  dispose()
})

test('window chrome observer releases replaced roots and final navigation, but survives page cache suspension', () => {
  for (const reason of ['removed', 'navigation', 'dispose']) {
    const f = chromeObserverFixture(), dispose = f.start()
    f.listeners.get('pagehide')({ persisted: true })
    assert.equal(f.state().disconnected, false)
    if (reason === 'removed') { f.chrome.isConnected = false; f.mutate([]) }
    if (reason === 'navigation') f.listeners.get('pagehide')({ persisted: false })
    if (reason === 'dispose') dispose()
    const count = f.themeCalls.length
    f.mutate([{ type: 'childList', addedNodes: [f.node()] }])
    assert.equal(f.themeCalls.length, count)
    assert.equal(f.state().disconnected, true)
    assert.equal(f.listeners.size, 0)
    dispose()
  }
})

test('window chrome uses a native overlay with a compact caption area', () => {
  assert.equal(WINDOW_CHROME_HEIGHT, 32)
  assert.deepEqual(windowChromeBrowserOptions(), {
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#071117',
      symbolColor: '#d9edf4',
      height: 32,
    },
  })
  assert.match(WINDOW_CHROME_CSS, /-webkit-app-region: drag/)
  assert.match(WINDOW_CHROME_CSS, /box-sizing: border-box/)
  assert.match(WINDOW_CHROME_CSS, /padding-top: var\(--dsh-desktop-window-chrome-height\)/)
  assert.match(WINDOW_CHROME_CSS, /body > #root/)
  assert.match(WINDOW_CHROME_CSS, /height: calc\(100vh - var\(--dsh-desktop-window-chrome-height\)\)/)
  assert.match(WINDOW_CHROME_CSS, /data-dsh-frame/)
  assert.match(WINDOW_CHROME_CSS, /data-skin-chrome="titlebar"/)
  assert.match(WINDOW_CHROME_CSS, /data-dsh-desktop-chrome-theme="light"/)
  assert.match(WINDOW_CHROME_CSS, /--dsh-desktop-chrome-bg: #071117/)
  assert.match(WINDOW_CHROME_CSS, /--dsh-desktop-chrome-bg: #f7f8fa/)
  assert.doesNotMatch(WINDOW_CHROME_CSS, /--dsh-desktop-chrome-bg: rgba\(/)
  assert.match(WINDOW_CHROME_CSS, /dsh-desktop-modal-layer/)
  assert.doesNotMatch(WINDOW_CHROME_CSS, /backdrop-filter: blur\(26px\)/)
  assert.doesNotMatch(WINDOW_CHROME_CSS, /dsh-desktop-window-chrome::before/)
  assert.doesNotMatch(WINDOW_CHROME_CSS, /dsh-window-chrome-icon/)
  assert.match(WINDOW_CHROME_CSS, /dsh-window-chrome-menus/)
  assert.match(WINDOW_CHROME_CSS, /-webkit-app-region: no-drag/)
})

test('native sidebar fullscreen reserves the caption without rewriting docked tab geometry', () => {
  const rule = WINDOW_CHROME_CSS.match(/html\[data-dsh-desktop-window-chrome="true"\] \[data-sidebar-right-panel="fullscreen"\] \{([^}]+)\}/u)?.[1]
  assert.ok(rule)
  assert.match(rule, /top: var\(--dsh-desktop-window-chrome-height\) !important/u)
  assert.match(rule, /height: calc\(100vh - var\(--dsh-desktop-window-chrome-height\)\) !important/u)
  assert.doesNotMatch(rule, /transform|z-index|pointer-events/u)
})

test('window chrome script keeps child-window caption areas visually quiet', () => {
  const script = createWindowChromeScript({
    iconDataUrl: 'data:image/png;base64,application-icon',
  })
  assert.match(script, /"showHelpMenu":false/)
  assert.match(script, /"showToolsMenu":false/)
  assert.doesNotMatch(script, /document\.createElement\('img'\)/)
  assert.doesNotMatch(script, /dsh-window-chrome-icon/)
  assert.match(script, /MutationObserver/)
  assert.match(script, /setWindowChromeTheme/)
  assert.match(script, /Promise\.resolve[\s\S]*?\.catch\(\(\) => \{\}\)/u)
  assert.match(script, /dsh-desktop-modal-layer/)
  assert.doesNotMatch(script, /LOCAL SURFACE|dsh-window-chrome-title|dsh-window-chrome-context/)
})

test('main window chrome exposes accessible Tools and Help dropdowns with fixed actions', () => {
  const script = createWindowChromeScript({ showHelpMenu: true, showToolsMenu: true })
  assert.match(script, /"showHelpMenu":true/)
  assert.match(script, /"showToolsMenu":true/)
  assert.match(script, /工具 \/ Tools/)
  assert.match(script, /扩展坞 \/ Extension Dock/)
  assert.match(script, /action: 'extensions'/)
  assert.match(script, /内置终端 \/ Built-in Terminal/)
  assert.match(script, /action: 'terminal'/)
  assert.match(script, /Ctrl\+Alt\+T/)
  assert.match(script, /window\.dshDesktop\.toolAction/)
  assert.match(script, /帮助 \/ Help/)
  for (const [label, action] of [
    ['加入社群', 'community'],
    ['提交建议', 'feedback'],
    ['GitHub 项目', 'project'],
    ['隐私政策', 'privacy'],
    ['导出诊断日志', 'export-diagnostics'],
    ['检查更新', 'updates'],
  ]) {
    assert.match(script, new RegExp(label))
    assert.match(script, new RegExp(`action: '${action}'`))
  }
  assert.match(script, /window\.dshDesktop\.helpAction/)
  assert.match(script, /event\.key === 'Escape'/)
  assert.match(script, /document\.addEventListener\('pointerdown'/)
})

test('window chrome theme validation and native overlay are bounded', () => {
  assert.equal(normalizeWindowChromeTheme('light'), 'light')
  assert.equal(normalizeWindowChromeTheme('dark'), 'dark')
  assert.throws(() => normalizeWindowChromeTheme('transparent'), /window chrome theme/)
  const calls = []
  const browserWindow = { setTitleBarOverlay: (options) => calls.push(options) }
  assert.equal(setWindowChromeTheme(browserWindow, 'light'), 'light')
  assert.deepEqual(calls, [{ color: '#f7f8fa', symbolColor: '#1f2937', height: 32 }])
})

test('window chrome applies CSS before mounting the main-window Help surface', async () => {
  const calls = []
  const webContents = {
    isDestroyed: () => false,
    insertCSS: async (css, options) => calls.push(['css', css, options]),
    executeJavaScript: async (script, userGesture) => {
      calls.push(['script', script, userGesture])
      return true
    },
  }
  assert.equal(await applyWindowChrome({
    webContents,
    iconDataUrl: 'data:image/png;base64,icon',
    showHelpMenu: true,
    showToolsMenu: true,
  }), true)
  assert.equal(calls[0][0], 'css')
  assert.deepEqual(calls[0][2], { cssOrigin: 'author' })
  assert.equal(calls[1][0], 'script')
  assert.equal(calls[1][2], true)
  assert.match(calls[1][1], /"showHelpMenu":true/)
  assert.match(calls[1][1], /"showToolsMenu":true/)
})

test('window chrome follows page navigations and can be detached', () => {
  const listeners = new Map()
  const webContents = {
    getURL: () => 'file:///startup.html',
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
  }
  const dispose = installWindowChrome({
    browserWindow: { webContents },
    iconDataUrl: 'data:image/png;base64,icon',
  })
  assert.equal(typeof listeners.get('did-finish-load'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
})

test('window chrome browser options accept an initial theme for light-only windows', () => {
  assert.deepEqual(windowChromeBrowserOptions('light'), {
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f7f8fa',
      symbolColor: '#1f2937',
      height: 32,
    },
  })
  assert.throws(() => windowChromeBrowserOptions('transparent'), /window chrome theme/)
})

test('desktop runtime URLs carry the hidden-title-bar geometry contract', () => {
  const decorated = decorateDesktopRuntimeUrl(
    'http://127.0.0.1:43125/?preview=1&dsh-desktop-mode=compatibility#session',
    { platform: 'WIN32' },
  )
  const url = new URL(decorated)
  assert.equal(url.searchParams.get('preview'), '1')
  assert.equal(url.searchParams.get('dsh-desktop-mode'), 'advanced')
  assert.equal(url.searchParams.get('dsh-desktop-platform'), 'win32')
  assert.equal(url.hash, '#session')
  assert.throws(() => decorateDesktopRuntimeUrl(''), /runtime URL/)
  assert.throws(() => decorateDesktopRuntimeUrl('http://127.0.0.1:43125', { platform: '' }), /platform/)
})

test('window chrome script respects a page-declared theme hint', () => {
  const script = createWindowChromeScript({})
  assert.match(script, /dataset\.dshDesktopTheme/)
})

test('window chrome re-applies the tracked overlay theme after a restore', () => {
  const overlays = []
  const listeners = new Map()
  const browserWindow = {
    isDestroyed: () => false,
    setTitleBarOverlay: (options) => overlays.push(options),
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
    webContents: {
      on: () => {},
      removeListener: () => {},
    },
  }
  assert.equal(getWindowChromeTheme(browserWindow), 'dark')
  setWindowChromeTheme(browserWindow, 'light')
  assert.equal(getWindowChromeTheme(browserWindow), 'light')
  const dispose = installWindowChrome({ browserWindow, iconDataUrl: 'data:image/png;base64,icon' })
  assert.equal(typeof listeners.get('restore'), 'function')
  overlays.length = 0
  listeners.get('restore')()
  assert.deepEqual(overlays, [{ color: '#f7f8fa', symbolColor: '#1f2937', height: 32 }])
  dispose()
  assert.equal(listeners.has('restore'), false)
})
