import { EventEmitter } from 'node:events'

export const UPDATE_STARTUP_DELAY_MS = 15_000
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

const MAX_RELEASE_NOTES_LENGTH = 7_000

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

function normalizeNoteText(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '- ')
    .replace(/<\/(?:h[1-6]|li|ul|ol|div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeReleaseNotes(releaseNotes) {
  const notes = Array.isArray(releaseNotes)
    ? releaseNotes.map((entry) => {
      const version = entry?.version ? `版本 / Version ${entry.version}` : ''
      return [version, normalizeNoteText(entry?.note)].filter(Boolean).join('\n')
    }).filter(Boolean).join('\n\n')
    : normalizeNoteText(releaseNotes)
  if (!notes) return '未提供此版本的发行说明。\nNo release notes were provided for this version.'
  if (notes.length <= MAX_RELEASE_NOTES_LENGTH) return notes
  return `${notes.slice(0, MAX_RELEASE_NOTES_LENGTH - 48).trimEnd()}\n\n发行说明已截断。 / Release notes truncated.`
}

export function formatUpdateDetails(info, currentVersion) {
  const header = [
    `当前版本 / Current version: ${currentVersion}`,
    `新版本 / New version: ${info?.version || 'unknown'}`,
    info?.releaseName ? `发行 / Release: ${normalizeNoteText(info.releaseName)}` : '',
    info?.releaseDate ? `发布时间 / Published: ${new Date(info.releaseDate).toLocaleString()}` : '',
  ].filter(Boolean)
  return `${header.join('\n')}\n\n更新内容 / What's new\n${normalizeReleaseNotes(info?.releaseNotes)}`
}

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown update error')
}

export class DesktopUpdateController extends EventEmitter {
  constructor({
    updater,
    getWindow,
    currentVersion,
    enabled,
    log = () => {},
    beforeInstall = async () => {},
    setTimeoutFn = setTimeout,
    setIntervalFn = setInterval,
    clearTimeoutFn = clearTimeout,
    clearIntervalFn = clearInterval,
  }) {
    super()
    this.updater = updater
    this.getWindow = getWindow
    this.currentVersion = currentVersion
    this.enabled = Boolean(enabled && updater)
    this.log = log
    this.beforeInstall = beforeInstall
    this.setTimeoutFn = setTimeoutFn
    this.setIntervalFn = setIntervalFn
    this.clearTimeoutFn = clearTimeoutFn
    this.clearIntervalFn = clearIntervalFn
    this.checking = false
    this.downloading = false
    this.manualCheck = false
    this.started = false
    this.startupTimer = undefined
    this.intervalTimer = undefined
    this.listeners = []
    this.status = Object.freeze({ phase: 'idle', currentVersion, visible: false })
  }

  start() {
    if (!this.enabled || this.started) return
    this.started = true
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.allowPrerelease = false
    this.updater.fullChangelog = false
    this.#listen('update-available', (info) => void this.#handleAvailable(info))
    this.#listen('update-not-available', () => void this.#handleNotAvailable())
    this.#listen('download-progress', (progress) => this.#handleProgress(progress))
    this.#listen('update-downloaded', (info) => void this.#handleDownloaded(info))
    this.#listen('error', (error) => void this.#handleError(error))
    this.startupTimer = this.setTimeoutFn(() => void this.check(), UPDATE_STARTUP_DELAY_MS)
    this.intervalTimer = this.setIntervalFn(() => void this.check(), UPDATE_CHECK_INTERVAL_MS)
    this.startupTimer?.unref?.()
    this.intervalTimer?.unref?.()
  }

  dispose() {
    if (this.startupTimer) this.clearTimeoutFn(this.startupTimer)
    if (this.intervalTimer) this.clearIntervalFn(this.intervalTimer)
    for (const [event, listener] of this.listeners) this.updater?.removeListener(event, listener)
    this.listeners = []
    this.started = false
    this.#setProgress(-1)
  }

  async check({ manual = false } = {}) {
    if (!this.enabled) {
      if (manual) this.#publish({ phase: 'unavailable', visible: true })
      return false
    }
    if (this.checking || this.downloading) {
      if (manual) this.#publish({ ...this.status, visible: true })
      return false
    }
    this.checking = true
    this.manualCheck = manual
    this.#publish({ phase: 'checking', visible: manual })
    this.log(`[updater] checking from ${this.currentVersion}`)
    try {
      await this.updater.checkForUpdates()
      return true
    } catch (error) {
      if (this.checking) await this.#handleError(error)
      return false
    }
  }

  #listen(event, listener) {
    this.updater.on(event, listener)
    this.listeners.push([event, listener])
  }

  async #handleAvailable(info) {
    if (this.downloading) return
    this.checking = false
    this.manualCheck = false
    this.log(`[updater] version ${info?.version || 'unknown'} is available`)
    this.downloading = true
    this.#publish({
      phase: 'downloading',
      version: info?.version,
      releaseName: normalizeNoteText(info?.releaseName),
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
      percent: 0,
      visible: false,
    })
    this.#setProgress(0)
    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      if (this.downloading) await this.#handleError(error, true)
    }
  }

  async #handleNotAvailable() {
    const manual = this.manualCheck
    this.checking = false
    this.manualCheck = false
    this.log(`[updater] ${this.currentVersion} is up to date`)
    this.#publish({ phase: 'current', visible: manual })
  }

  #handleProgress(progress) {
    const percent = Number(progress?.percent)
    if (!Number.isFinite(percent)) return
    const bounded = Math.max(0, Math.min(100, percent))
    this.#publish({ ...this.status, phase: 'downloading', percent: bounded })
    this.#setProgress(bounded / 100)
  }

  async #handleDownloaded(info) {
    this.downloading = false
    this.#setProgress(-1)
    this.log(`[updater] version ${info?.version || 'unknown'} downloaded`)
    this.#publish({
      ...this.status,
      phase: 'ready',
      version: info?.version || this.status.version,
      visible: true,
    })
  }

  async install() {
    if (!this.enabled || this.status.phase !== 'ready') return false
    try {
      await this.beforeInstall()
      this.updater.quitAndInstall(false, true)
      return true
    } catch (error) {
      await this.#handleError(error, true)
      return false
    }
  }

  async #handleError(error, forceVisible = false) {
    const shouldShow = forceVisible || this.manualCheck || this.downloading
    this.checking = false
    this.manualCheck = false
    this.downloading = false
    this.#setProgress(-1)
    const message = asErrorMessage(error)
    this.log(`[updater] ${message}`)
    this.#publish({ phase: 'error', message, visible: shouldShow })
  }

  getStatus() {
    return { ...this.status }
  }

  #publish(status) {
    this.status = Object.freeze({ currentVersion: this.currentVersion, ...status })
    this.emit('status', this.getStatus())
  }

  #setProgress(value) {
    const window = this.getWindow?.()
    if (window && !window.isDestroyed?.()) window.setProgressBar?.(value)
  }

}

export async function loadElectronAutoUpdater() {
  const electronUpdater = await import('electron-updater')
  return electronUpdater.autoUpdater || electronUpdater.default?.autoUpdater
}
