import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyNavigation, installNavigationPolicy, isOAuthPopupBootstrap } from '../src/navigation-policy.mjs'

test('navigation policy keeps the renderer on the active DSH origin', () => {
  const runtimeOrigin = 'http://127.0.0.1:43125'
  assert.equal(classifyNavigation('http://127.0.0.1:43125/session/1', runtimeOrigin), 'allow')
  assert.equal(classifyNavigation('https://github.com/example/repo', runtimeOrigin), 'external')
  assert.equal(classifyNavigation('http://127.0.0.1:43126', runtimeOrigin), 'deny')
  assert.equal(classifyNavigation('file:///C:/Windows/System32/calc.exe', runtimeOrigin), 'deny')
  assert.equal(classifyNavigation('javascript:alert(1)', runtimeOrigin), 'deny')
  assert.equal(classifyNavigation('not a url', runtimeOrigin), 'deny')
})

test('loopback Runtime navigation stays inside Electron and never opens the system browser', () => {
  const handlers = new Map()
  const opened = []
  let windowOpenHandler
  const webContents = {
    on: (event, handler) => handlers.set(event, handler),
    setWindowOpenHandler: (handler) => { windowOpenHandler = handler },
  }
  installNavigationPolicy({
    webContents,
    getRuntimeOrigin: () => 'http://127.0.0.1:43125',
    openExternal: (url) => { opened.push(url) },
  })

  const sameOrigin = { prevented: false, preventDefault() { this.prevented = true } }
  handlers.get('will-navigate')(sameOrigin, 'http://127.0.0.1:43125/session/1')
  assert.equal(sameOrigin.prevented, false)
  assert.deepEqual(windowOpenHandler({ url: 'http://127.0.0.1:43125/' }), { action: 'deny' })
  assert.deepEqual(windowOpenHandler({ url: 'http://127.0.0.1:43126/' }), { action: 'deny' })
  assert.deepEqual(opened, [])
})

test('renderer-owned HTTPS navigation and popups are denied without opening the system browser', () => {
  const handlers = new Map()
  const opened = []
  let windowOpenHandler
  const webContents = {
    on: (event, handler) => handlers.set(event, handler),
    setWindowOpenHandler: (handler) => { windowOpenHandler = handler },
  }
  installNavigationPolicy({
    webContents,
    getRuntimeOrigin: () => 'http://127.0.0.1:43125',
    openExternal: (url) => { opened.push(url) },
  })

  const navigation = { prevented: false, preventDefault() { this.prevented = true } }
  handlers.get('will-navigate')(navigation, 'https://example.com/web')
  assert.equal(navigation.prevented, true)
  assert.deepEqual(windowOpenHandler({ url: 'https://example.com/popup' }), { action: 'deny' })
  assert.deepEqual(opened, [])
})

test('navigation policy hands the Codex OAuth bootstrap to the system browser', async () => {
  const handlers = new Map()
  let windowOpenHandler
  const opened = []
  const webContents = {
    on: (event, handler) => handlers.set(event, handler),
    setWindowOpenHandler: (handler) => { windowOpenHandler = handler },
  }
  installNavigationPolicy({
    webContents,
    getRuntimeOrigin: () => 'http://127.0.0.1:43125',
    openExternal: (url) => { opened.push(url) },
  })

  assert.equal(isOAuthPopupBootstrap('about:blank'), true)
  assert.equal(isOAuthPopupBootstrap('javascript:about:blank'), false)
  assert.deepEqual(windowOpenHandler({ url: 'about:blank' }), {
    action: 'allow',
    overrideBrowserWindowOptions: {
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    },
  })

  const popupHandlers = new Map()
  let popupOpenHandler
  let closed = false
  const popup = {
    close: () => { closed = true },
    isDestroyed: () => false,
    webContents: {
      on: (event, handler) => popupHandlers.set(event, handler),
      setWindowOpenHandler: (handler) => { popupOpenHandler = handler },
    },
  }
  handlers.get('did-create-window')(popup, { url: 'about:blank' })
  const event = { prevented: false, preventDefault() { this.prevented = true } }
  popupHandlers.get('will-navigate')(event, 'https://auth.openai.com/oauth/authorize')
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(event.prevented, true)
  assert.deepEqual(opened, ['https://auth.openai.com/oauth/authorize'])
  assert.equal(closed, true)
  assert.deepEqual(popupOpenHandler({ url: 'javascript:alert(1)' }), { action: 'deny' })
})

test('navigation policy does not call the external browser for ordinary renderer popups', async () => {
  const errors = []
  let windowOpenHandler
  const webContents = {
    on: () => {},
    setWindowOpenHandler: (handler) => { windowOpenHandler = handler },
  }
  installNavigationPolicy({
    webContents,
    getRuntimeOrigin: () => undefined,
    openExternal: async () => { throw new Error('browser unavailable') },
    onError: (error) => errors.push(error.message),
  })

  assert.deepEqual(windowOpenHandler({ url: 'https://example.com' }), { action: 'deny' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(errors, [])
})
