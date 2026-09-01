const MAX_TASK_STATUS_LENGTH = 180

function asText(value, fallback) {
  if (typeof value !== 'string') return fallback
  const text = value.replace(/[\r\n\t]+/gu, ' ').trim()
  return text.length > 0 ? text.slice(0, MAX_TASK_STATUS_LENGTH) : fallback
}

export function normalizeTrayTaskStatus(value) {
  if (typeof value === 'string') return asText(value, '暂无后台任务 / No background tasks')
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '暂无后台任务 / No background tasks'
  }
  if (typeof value.label === 'string') return asText(value.label, '暂无后台任务 / No background tasks')
  const active = Number.isInteger(value.active) && value.active >= 0 ? value.active : 0
  const queued = Number.isInteger(value.queued) && value.queued >= 0 ? value.queued : 0
  if (active === 0 && queued === 0) return '暂无后台任务 / No background tasks'
  return `运行中 ${active}，排队 ${queued} / Active ${active}, queued ${queued}`
}

/** Restore a hidden/minimized main window without exposing it to a renderer. */
export function restoreDesktopWindow(window) {
  if (!window || window.isDestroyed?.() === true) return false
  try {
    if (window.isMinimized?.()) window.restore()
    window.show?.()
    window.focus?.()
    return true
  } catch {
    return false
  }
}

/** Keep the last macOS window available for Dock activation without changing Windows close semantics. */
export function preserveDarwinMainWindowOnClose({
  platform = process.platform,
  window,
  event,
  explicitQuit = false,
} = {}) {
  if (platform !== 'darwin' || explicitQuit || !window || window.isDestroyed?.() === true) return false
  if (typeof window.hide !== 'function' || typeof event?.preventDefault !== 'function') return false
  try {
    window.hide()
    event.preventDefault()
    return true
  } catch {
    return false
  }
}

/** Restore the retained main window only for the native macOS activate lifecycle. */
export function restoreDarwinMainWindowOnActivate({
  platform = process.platform,
  window,
} = {}) {
  return platform === 'darwin' && restoreDesktopWindow(window)
}

export function shouldQuitWhenAllWindowsClosed(platform = process.platform) {
  return platform !== 'darwin'
}

function fallbackIcon(nativeImage) {
  try {
    const icon = nativeImage?.createEmpty?.()
    return icon && icon.isEmpty?.() !== true ? icon : undefined
  } catch {
    return undefined
  }
}

/**
 * Main-process tray manager. The Electron constructor and Menu adapter are
 * injected so failures are non-fatal and all behavior can be unit tested with
 * fake Tray/Menu implementations.
 */
export class DesktopTrayLifecycle {
  constructor({
    Tray,
    Menu,
    nativeImage,
    icon,
    getWindow,
    openExtensions = () => {},
    openTaskStatus = () => {},
    checkForUpdates = () => {},
    requestQuit = () => {},
    getTaskStatus = () => undefined,
    productName = 'DeepSeek Harness Desktop',
    log = () => {},
  } = {}) {
    if (typeof Tray !== 'function') throw new TypeError('Tray constructor is required')
    if (!Menu || typeof Menu.buildFromTemplate !== 'function') throw new TypeError('Menu.buildFromTemplate is required')
    if (typeof getWindow !== 'function') throw new TypeError('getWindow is required')
    this.Tray = Tray
    this.Menu = Menu
    this.nativeImage = nativeImage
    this.icon = icon
    this.getWindow = getWindow
    this.openExtensions = openExtensions
    this.openTaskStatus = openTaskStatus
    this.checkForUpdates = checkForUpdates
    this.requestQuit = requestQuit
    this.getTaskStatus = getTaskStatus
    this.productName = asText(productName, 'DeepSeek Harness Desktop')
    this.log = log
    this.tray = undefined
    this.lastTaskStatus = normalizeTrayTaskStatus()
    this.onRestore = () => { restoreDesktopWindow(this.getWindow()) }
  }

  get available() {
    return Boolean(this.tray)
  }

  #report(error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      void Promise.resolve(this.log(`[tray] ${message}`)).catch(() => {})
    } catch {
      // Tray diagnostics cannot change application startup or quit behavior.
    }
  }

  #run(operation) {
    void Promise.resolve()
      .then(operation)
      .catch((error) => this.#report(error))
  }

  #buildMenu() {
    const action = (operation) => () => this.#run(operation)
    return [
      { label: '打开 / Open', click: action(() => restoreDesktopWindow(this.getWindow())) },
      {
        label: `任务状态 / Task status: ${this.lastTaskStatus}`,
        click: action(() => this.openTaskStatus()),
      },
      { type: 'separator' },
      { label: '扩展坞 / Extension Dock', click: action(() => this.openExtensions()) },
      { label: '检查更新 / Check for Updates', click: action(() => this.checkForUpdates({ manual: true })) },
      { type: 'separator' },
      { label: '退出 / Quit', click: action(() => this.requestQuit()) },
    ]
  }

  #applyMenu() {
    if (!this.tray) return false
    try {
      this.tray.setContextMenu?.(this.Menu.buildFromTemplate(this.#buildMenu()))
      return true
    } catch (error) {
      this.#report(error)
      return false
    }
  }

  /** Try to create the tray; a platform/icon failure safely leaves it absent. */
  ensure() {
    if (this.tray) return true
    const preferredIcon = this.icon?.isEmpty?.() === true ? undefined : this.icon
    const fallback = fallbackIcon(this.nativeImage)
    const icons = [preferredIcon, fallback].filter((icon, index, values) => icon && values.indexOf(icon) === index)
    if (icons.length === 0) {
      this.#report(new Error('tray icon unavailable; background mode disabled for this session'))
      return false
    }
    let lastError
    for (const icon of icons) {
      try {
        const tray = new this.Tray(icon)
        tray.setToolTip?.(this.productName)
        tray.on?.('double-click', this.onRestore)
        tray.on?.('click', this.onRestore)
        this.tray = tray
        this.#applyMenu()
        void this.refresh()
        return true
      } catch (error) {
        lastError = error
      }
    }
    this.#report(lastError ?? new Error('tray construction failed'))
    return false
  }

  async refresh() {
    if (!this.tray) return false
    try {
      this.lastTaskStatus = normalizeTrayTaskStatus(await this.getTaskStatus())
    } catch (error) {
      this.#report(error)
      this.lastTaskStatus = normalizeTrayTaskStatus()
    }
    return this.#applyMenu()
  }

  dispose() {
    const tray = this.tray
    this.tray = undefined
    if (!tray) return false
    try {
      tray.removeListener?.('double-click', this.onRestore)
      tray.removeListener?.('click', this.onRestore)
      tray.destroy?.()
      return true
    } catch (error) {
      this.#report(error)
      return false
    }
  }
}
