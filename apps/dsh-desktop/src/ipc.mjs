const ACTIONS = new Set(['retry', 'repair', 'open-logs', 'exit'])
const HELP_ACTIONS = new Set(['community', 'feedback', 'project', 'updates'])
const WINDOW_CHROME_THEMES = new Set(['light', 'dark'])
const UPDATE_PHASES = new Set(['idle', 'checking', 'downloading', 'current', 'ready', 'unavailable', 'error'])

export function normalizeWindowChromeTheme(value) {
  if (typeof value !== 'string' || !WINDOW_CHROME_THEMES.has(value)) {
    throw new TypeError(`invalid window chrome theme: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeDesktopAction(value) {
  if (typeof value !== 'string' || !ACTIONS.has(value)) {
    throw new TypeError(`invalid desktop action: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeHelpAction(value) {
  if (typeof value !== 'string' || !HELP_ACTIONS.has(value)) {
    throw new TypeError(`invalid Help action: ${JSON.stringify(value)}`)
  }
  return value
}

export function publicRuntimeStatus(status) {
  const state = typeof status?.state === 'string' ? status.state : 'stopped'
  return {
    state,
    error: typeof status?.error === 'string' ? status.error.slice(0, 4_000) : undefined,
    url: state === 'ready' && typeof status?.url === 'string' ? status.url : undefined,
    restartAttempt: Number.isInteger(status?.restartAttempt) ? status.restartAttempt : 0,
  }
}

export function publicUpdateStatus(status) {
  const phase = UPDATE_PHASES.has(status?.phase) ? status.phase : 'idle'
  const boundedText = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : undefined
  const percent = Number(status?.percent)
  return {
    phase,
    currentVersion: boundedText(status?.currentVersion, 64),
    version: boundedText(status?.version, 64),
    releaseName: boundedText(status?.releaseName, 240),
    releaseNotes: boundedText(status?.releaseNotes, 7_000),
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined,
    message: boundedText(status?.message, 1_000),
    visible: status?.visible === true,
  }
}

export function registerDesktopIpc({
  ipcMain,
  controller,
  getWindow,
  metadata,
  version,
  platform,
  ensureProfile,
  openLogs,
  exitApp,
  handleHelpAction,
  setWindowChromeTheme,
  getUpdateController,
}) {
  const channels = [
    'desktop:info',
    'desktop:status',
    'desktop:action',
    'desktop:help-action',
    'desktop:window-chrome-theme',
    'desktop:update-status',
    'desktop:update-check',
    'desktop:update-install',
  ]
  for (const channel of channels) ipcMain.removeHandler(channel)
  ipcMain.handle('desktop:info', () => ({
    appId: metadata.appId,
    productName: metadata.productName,
    version,
    platform,
  }))
  ipcMain.handle('desktop:status', () => publicRuntimeStatus(controller.status))
  ipcMain.handle('desktop:action', async (_event, rawAction) => {
    const action = normalizeDesktopAction(rawAction)
    if (action === 'retry') return controller.restart()
    if (action === 'repair') {
      await controller.stop()
      await ensureProfile()
      return controller.start()
    }
    if (action === 'open-logs') return openLogs()
    exitApp()
    return undefined
  })
  ipcMain.handle('desktop:window-chrome-theme', (event, rawTheme) => {
    const theme = normalizeWindowChromeTheme(rawTheme)
    return setWindowChromeTheme?.(event.sender, theme)
  })
  ipcMain.handle('desktop:help-action', (_event, rawAction) => {
    const action = normalizeHelpAction(rawAction)
    return handleHelpAction(action)
  })
  ipcMain.handle('desktop:update-status', () => publicUpdateStatus(getUpdateController?.()?.getStatus?.()))
  ipcMain.handle('desktop:update-check', () => getUpdateController?.()?.check?.({ manual: true }))
  ipcMain.handle('desktop:update-install', () => getUpdateController?.()?.install?.())
  const publishStatus = (status) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send('desktop:status', publicRuntimeStatus(status))
  }
  controller.on('status', publishStatus)
  return () => {
    controller.off('status', publishStatus)
    for (const channel of channels) ipcMain.removeHandler(channel)
  }
}
