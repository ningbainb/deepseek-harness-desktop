import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWindowChrome,
  createWindowChromeScript,
  getWindowChromeTheme,
  installWindowChrome,
  WINDOW_CHROME_CSS,
  WINDOW_CHROME_HEIGHT,
  normalizeWindowChromeTheme,
  setWindowChromeTheme,
  windowChromeBrowserOptions,
} from '../src/window-chrome.mjs'

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
