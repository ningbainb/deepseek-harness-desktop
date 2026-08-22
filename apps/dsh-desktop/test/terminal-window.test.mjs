import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  DESKTOP_TERMINAL_PARTITION,
  TERMINAL_IPC_CHANNELS,
  createDesktopTerminalPanel,
} from '../src/terminal-window.mjs'

class FakeWebContents extends EventEmitter {
  sent = []
  scripts = []
  destroyed = false
  session = {
    setPermissionCheckHandler: (handler) => { this.permissionCheckHandler = handler },
    setPermissionRequestHandler: (handler) => { this.permissionRequestHandler = handler },
  }
  setWindowOpenHandler(handler) { this.windowOpenHandler = handler }
  send(channel, payload) { this.sent.push([channel, payload]) }
  isDestroyed() { return this.destroyed }
  async loadFile(path, options) { this.loadedFile = path; this.loadOptions = options }
  async executeJavaScript(script) { this.scripts.push(script) }
  focus() { this.focused = true }
  close() { this.destroyed = true }
}

class FakeWebContentsView {
  static instances = []
  visible = []
  bounds = []
  colors = []

  constructor(options) {
    this.options = options
    this.webContents = new FakeWebContents()
    FakeWebContentsView.instances.push(this)
  }

  setVisible(value) { this.visible.push(value) }
  setBounds(value) { this.bounds.push(value) }
  setBackgroundColor(value) { this.colors.push(value) }
}

class FakeParentWindow extends EventEmitter {
  destroyed = false
  children = []
  contentBounds = { x: 40, y: 30, width: 1000, height: 700 }
  contentView = {
    addChildView: (view) => { this.children.push(view) },
    removeChildView: (view) => { this.children = this.children.filter((candidate) => candidate !== view) },
  }
  isDestroyed() { return this.destroyed }
  getContentBounds() { return this.contentBounds }
}

function createIpcMain() {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
    on: (channel, handler) => listeners.set(channel, handler),
    removeListener: (channel, handler) => {
      if (listeners.get(channel) === handler) listeners.delete(channel)
    },
  }
}

test('terminal is a sandboxed child panel and never creates a BrowserWindow', async () => {
  FakeWebContentsView.instances = []
  const parent = new FakeParentWindow()
  const ipcMain = createIpcMain()
  const calls = []
  const session = {
    start: async (size) => { calls.push(['start', size]); return { label: 'PowerShell 7', cwd: 'C:\\workspace' } },
    write: (data) => calls.push(['write', data]),
    resize: (size) => calls.push(['resize', size]),
    restart: async (size) => { calls.push(['restart', size]); return { label: 'PowerShell 7', cwd: 'C:\\workspace' } },
    dispose: () => calls.push(['dispose']),
  }
  let disposed = 0
  const result = await createDesktopTerminalPanel({
    WebContentsView: FakeWebContentsView,
    browserWindow: parent,
    ipcMain,
    cwd: 'C:\\workspace',
    theme: 'dark',
    sessionFactory: ({ emit }) => {
      session.emit = emit
      return session
    },
    installContextMenu: () => () => calls.push(['menu-dispose']),
    onDidDispose: () => { disposed += 1 },
  })
  const view = result.view
  const { webContents } = view
  const preferences = view.options.webPreferences

  assert.equal(FakeWebContentsView.instances.length, 1)
  assert.deepEqual(parent.children, [view])
  assert.equal(preferences.partition, DESKTOP_TERMINAL_PARTITION)
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.sandbox, true)
  assert.equal(preferences.nodeIntegration, false)
  assert.equal(preferences.nodeIntegrationInSubFrames, false)
  assert.equal(preferences.nodeIntegrationInWorker, false)
  assert.equal(preferences.webSecurity, true)
  assert.equal(preferences.webviewTag, false)
  assert.match(preferences.preload, /preload-terminal\.cjs$/u)
  assert.match(webContents.loadedFile, /ui[\\/]terminal\.html$/u)
  assert.deepEqual(webContents.loadOptions.query, { theme: 'dark', embedded: '1' })
  assert.deepEqual(view.visible, [false, true])
  assert.deepEqual(view.bounds.at(-1), { x: 0, y: 280, width: 1000, height: 420 })
  assert.deepEqual(webContents.windowOpenHandler(), { action: 'deny' })
  assert.equal(webContents.permissionCheckHandler(), false)
  let permission
  webContents.permissionRequestHandler(undefined, 'clipboard-read', (value) => { permission = value })
  assert.equal(permission, false)

  parent.contentBounds = { x: 20, y: 10, width: 760, height: 540 }
  parent.emit('resize')
  assert.deepEqual(view.bounds.at(-1), { x: 0, y: 140, width: 760, height: 400 })

  const sender = webContents
  assert.deepEqual(
    await ipcMain.handlers.get(TERMINAL_IPC_CHANNELS.START)({ sender }, { cols: 100, rows: 30 }),
    { label: 'PowerShell 7', cwd: 'C:\\workspace' },
  )
  ipcMain.listeners.get(TERMINAL_IPC_CHANNELS.WRITE)({ sender }, 'git --version\r')
  ipcMain.listeners.get(TERMINAL_IPC_CHANNELS.RESIZE)({ sender }, { cols: 120, rows: 40 })
  assert.deepEqual(calls.slice(0, 3), [
    ['start', { cols: 100, rows: 30 }],
    ['write', 'git --version\r'],
    ['resize', { cols: 120, rows: 40 }],
  ])

  session.emit('output', 'git version 2.55.0\r\n')
  session.emit('exit', { exitCode: 0, signal: 0 })
  assert.deepEqual(webContents.sent, [
    [TERMINAL_IPC_CHANNELS.OUTPUT, 'git version 2.55.0\r\n'],
    [TERMINAL_IPC_CHANNELS.EXITED, { exitCode: 0, signal: 0 }],
  ])

  result.setTheme('light')
  assert.equal(view.colors.at(-1), '#f7f9fb')
  assert.match(webContents.scripts.at(-1), /light/u)

  await assert.rejects(
    ipcMain.handlers.get(TERMINAL_IPC_CHANNELS.START)({ sender: {} }, { cols: 80, rows: 24 }),
    /terminal action is unavailable/u,
  )
  ipcMain.listeners.get(TERMINAL_IPC_CHANNELS.WRITE)({ sender: {} }, 'whoami\r')
  assert.equal(calls.some((entry) => entry[0] === 'write' && entry[1] === 'whoami\r'), false)

  await ipcMain.handlers.get(TERMINAL_IPC_CHANNELS.CLOSE)({ sender })
  assert.equal(result.disposed, true)
  assert.equal(disposed, 1)
  assert.equal(parent.children.length, 0)
  assert.equal(webContents.destroyed, true)
  assert.equal(ipcMain.handlers.size, 0)
  assert.equal(ipcMain.listeners.size, 0)
  assert.deepEqual(calls.slice(-2), [['dispose'], ['menu-dispose']])
})

test('terminal panel removes itself after a failed local page load', async () => {
  class FailingView extends FakeWebContentsView {
    constructor(options) {
      super(options)
      this.webContents.loadFile = async () => { throw new Error('load failed') }
    }
  }
  const parent = new FakeParentWindow()
  const ipcMain = createIpcMain()
  let disposed = 0
  await assert.rejects(createDesktopTerminalPanel({
    WebContentsView: FailingView,
    browserWindow: parent,
    ipcMain,
    cwd: 'C:\\workspace',
    sessionFactory: () => ({ dispose: () => { disposed += 1 } }),
    installContextMenu: () => () => {},
  }), /load failed/u)
  assert.equal(disposed, 1)
  assert.equal(parent.children.length, 0)
  assert.equal(ipcMain.handlers.size, 0)
  assert.equal(ipcMain.listeners.size, 0)
})
