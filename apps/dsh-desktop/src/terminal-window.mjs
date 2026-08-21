import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { installEditContextMenu } from './menu.mjs'
import { DesktopTerminalSession } from './terminal-session.mjs'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PANEL_HEIGHT = 420
const MIN_PANEL_HEIGHT = 260
const MIN_PARENT_REMAINDER = 140

export const DESKTOP_TERMINAL_PARTITION = 'dsh-desktop-terminal'
export const TERMINAL_PRELOAD_PATH = join(SOURCE_DIR, 'preload-terminal.cjs')
export const TERMINAL_HTML_PATH = join(SOURCE_DIR, 'ui', 'terminal.html')

export const TERMINAL_IPC_CHANNELS = Object.freeze({
  START: 'dsh:terminal:start',
  WRITE: 'dsh:terminal:write',
  RESIZE: 'dsh:terminal:resize',
  RESTART: 'dsh:terminal:restart',
  CLOSE: 'dsh:terminal:close',
  OUTPUT: 'dsh:terminal:output',
  EXITED: 'dsh:terminal:exited',
  ERROR: 'dsh:terminal:error',
})

function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark'
}

function terminalPanelBounds(browserWindow) {
  const content = browserWindow.getContentBounds()
  const height = Math.max(1, Math.min(
    DEFAULT_PANEL_HEIGHT,
    Math.max(MIN_PANEL_HEIGHT, content.height - MIN_PARENT_REMAINDER),
    content.height,
  ))
  return Object.freeze({ x: 0, y: Math.max(0, content.height - height), width: Math.max(1, content.width), height })
}

function installTerminalNavigationPolicy(webContents) {
  webContents.on?.('will-navigate', (event) => event.preventDefault())
  webContents.on?.('will-attach-webview', (event) => event.preventDefault())
  webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }))
  webContents.session?.setPermissionCheckHandler?.(() => false)
  webContents.session?.setPermissionRequestHandler?.((_contents, _permission, callback) => callback(false))
}

function registerTerminalIpc({ ipcMain, webContents, session, close, onError }) {
  const handlerChannels = [
    TERMINAL_IPC_CHANNELS.START,
    TERMINAL_IPC_CHANNELS.RESTART,
    TERMINAL_IPC_CHANNELS.CLOSE,
  ]
  for (const channel of handlerChannels) ipcMain.removeHandler(channel)

  let disposed = false
  const assertSender = (event) => {
    if (disposed || webContents.isDestroyed?.() || event?.sender !== webContents) {
      throw new Error('terminal action is unavailable')
    }
  }
  const report = (error) => {
    try { onError(error) } catch {}
    if (!webContents.isDestroyed?.()) {
      webContents.send(TERMINAL_IPC_CHANNELS.ERROR, { code: 'terminal-action-failed' })
    }
  }

  ipcMain.handle(TERMINAL_IPC_CHANNELS.START, async (event, size) => {
    assertSender(event)
    return session.start(size)
  })
  ipcMain.handle(TERMINAL_IPC_CHANNELS.RESTART, async (event, size) => {
    assertSender(event)
    return session.restart(size)
  })
  ipcMain.handle(TERMINAL_IPC_CHANNELS.CLOSE, async (event) => {
    assertSender(event)
    close()
    return true
  })

  const onWrite = (event, data) => {
    if (disposed || event?.sender !== webContents || webContents.isDestroyed?.()) return
    try { session.write(data) } catch (error) { report(error) }
  }
  const onResize = (event, size) => {
    if (disposed || event?.sender !== webContents || webContents.isDestroyed?.()) return
    try { session.resize(size) } catch (error) { report(error) }
  }
  ipcMain.on(TERMINAL_IPC_CHANNELS.WRITE, onWrite)
  ipcMain.on(TERMINAL_IPC_CHANNELS.RESIZE, onResize)

  return () => {
    if (disposed) return
    disposed = true
    for (const channel of handlerChannels) ipcMain.removeHandler(channel)
    ipcMain.removeListener(TERMINAL_IPC_CHANNELS.WRITE, onWrite)
    ipcMain.removeListener(TERMINAL_IPC_CHANNELS.RESIZE, onResize)
  }
}

/**
 * Attach the terminal as a child view inside an existing Desktop window.
 * This creates no BrowserWindow and therefore no second taskbar item or
 * terminal popup; the PTY renderer stays isolated from the DSH Web renderer.
 */
export async function createDesktopTerminalPanel({
  WebContentsView,
  browserWindow,
  ipcMain,
  Menu,
  cwd,
  environment = process.env,
  pathEntries = [],
  platform = process.platform,
  theme: rawTheme = 'dark',
  loadPty = () => import('node-pty'),
  sessionFactory = (options) => new DesktopTerminalSession(options),
  installContextMenu = installEditContextMenu,
  onError = () => {},
  onDidDispose = () => {},
} = {}) {
  if (typeof WebContentsView !== 'function') throw new TypeError('terminal WebContentsView constructor is required')
  if (!browserWindow || browserWindow.isDestroyed?.() || !browserWindow.contentView) {
    throw new TypeError('terminal parent window is required')
  }
  if (!ipcMain || typeof ipcMain.handle !== 'function' || typeof ipcMain.on !== 'function') {
    throw new TypeError('terminal ipcMain is required')
  }
  if (typeof sessionFactory !== 'function') throw new TypeError('terminal session factory must be a function')
  if (typeof onError !== 'function') throw new TypeError('terminal error reporter must be a function')
  if (typeof onDidDispose !== 'function') throw new TypeError('terminal dispose callback must be a function')

  const theme = normalizeTheme(rawTheme)
  const view = new WebContentsView({
    webPreferences: {
      preload: TERMINAL_PRELOAD_PATH,
      partition: DESKTOP_TERMINAL_PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      spellcheck: false,
      webviewTag: false,
    },
  })
  const { webContents } = view
  view.setBackgroundColor?.(theme === 'dark' ? '#071118' : '#f7f9fb')
  view.setVisible?.(false)
  browserWindow.contentView.addChildView(view)
  installTerminalNavigationPolicy(webContents)
  const removeContextMenu = installContextMenu({ webContents, Menu })
  const send = (channel, payload) => {
    if (!webContents.isDestroyed?.()) webContents.send(channel, payload)
  }
  const session = sessionFactory({
    cwd,
    platform,
    environment,
    pathEntries,
    loadPty,
    emit: (kind, payload) => {
      if (kind === 'output') send(TERMINAL_IPC_CHANNELS.OUTPUT, payload)
      else if (kind === 'exit') send(TERMINAL_IPC_CHANNELS.EXITED, payload)
      else send(TERMINAL_IPC_CHANNELS.ERROR, payload)
    },
  })

  let disposed = false
  let unregisterIpc = () => {}
  const layout = () => {
    if (!disposed && !browserWindow.isDestroyed?.()) view.setBounds(terminalPanelBounds(browserWindow))
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    browserWindow.removeListener?.('resize', layout)
    browserWindow.removeListener?.('closed', dispose)
    unregisterIpc()
    session.dispose()
    removeContextMenu?.()
    try { browserWindow.contentView.removeChildView(view) } catch {}
    if (!webContents.isDestroyed?.()) webContents.close?.({ waitForBeforeUnload: false })
    try { onDidDispose() } catch {}
  }
  unregisterIpc = registerTerminalIpc({ ipcMain, webContents, session, close: dispose, onError })
  browserWindow.on?.('resize', layout)
  browserWindow.once?.('closed', dispose)
  layout()

  try {
    await webContents.loadFile(TERMINAL_HTML_PATH, { query: { theme, embedded: '1' } })
  } catch (error) {
    dispose()
    throw error
  }
  if (disposed || browserWindow.isDestroyed?.()) throw new Error('terminal parent window closed before the panel loaded')
  view.setVisible?.(true)
  webContents.focus?.()

  const setTheme = (value) => {
    if (disposed || webContents.isDestroyed?.()) return
    const nextTheme = normalizeTheme(value)
    view.setBackgroundColor?.(nextTheme === 'dark' ? '#071118' : '#f7f9fb')
    const script = `document.documentElement.dataset.dshDesktopTheme = ${JSON.stringify(nextTheme)}`
    void webContents.executeJavaScript?.(script).catch?.(() => {})
  }

  return Object.freeze({
    view,
    webContents,
    get disposed() { return disposed },
    dispose,
    setTheme,
  })
}
