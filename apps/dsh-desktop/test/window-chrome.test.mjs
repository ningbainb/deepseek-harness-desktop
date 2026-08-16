import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWindowChrome,
  createWindowChromeScript,
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
  assert.match(WINDOW_CHROME_CSS, /data-dsh-desktop-chrome-theme="light"/)
  assert.match(WINDOW_CHROME_CSS, /dsh-desktop-modal-layer/)
  assert.match(WINDOW_CHROME_CSS, /backdrop-filter: blur\(26px\) saturate\(145%\)/)
  assert.match(WINDOW_CHROME_CSS, /dsh-desktop-window-chrome::before/)
  assert.match(WINDOW_CHROME_CSS, /width: 18px/)
  assert.match(WINDOW_CHROME_CSS, /dsh-window-chrome-help/)
  assert.match(WINDOW_CHROME_CSS, /-webkit-app-region: no-drag/)
})

test('window chrome script mounts the application icon without Help in child windows', () => {
  const script = createWindowChromeScript({
    iconDataUrl: 'data:image/png;base64,application-icon',
  })
  assert.match(script, /"showHelpMenu":false/)
  assert.match(script, /document\.createElement\('img'\)/)
  assert.match(script, /icon\.src = data\.iconDataUrl/)
  assert.match(script, /MutationObserver/)
  assert.match(script, /setWindowChromeTheme/)
  assert.match(script, /dsh-desktop-modal-layer/)
  assert.doesNotMatch(script, /LOCAL SURFACE|dsh-window-chrome-title|dsh-window-chrome-context/)
})

test('main window chrome exposes an accessible Help dropdown with fixed actions', () => {
  const script = createWindowChromeScript({ showHelpMenu: true })
  assert.match(script, /"showHelpMenu":true/)
  assert.match(script, /帮助 \/ Help/)
  for (const [label, action] of [
    ['加入社群', 'community'],
    ['提建议', 'feedback'],
    ['GitHub 项目', 'project'],
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
  assert.deepEqual(calls, [{ color: '#eef2f8', symbolColor: '#1f2937', height: 32 }])
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
  }), true)
  assert.equal(calls[0][0], 'css')
  assert.deepEqual(calls[0][2], { cssOrigin: 'author' })
  assert.equal(calls[1][0], 'script')
  assert.equal(calls[1][2], true)
  assert.match(calls[1][1], /"showHelpMenu":true/)
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
