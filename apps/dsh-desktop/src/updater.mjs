import { EventEmitter } from 'node:events'

import { emitBestEffort } from './best-effort-events.mjs'
import {
  DEFAULT_UPDATE_CHANNEL,
  evaluateUpdateForChannel,
  normalizeUpdateChannel,
  updateChannelConfiguration,
} from './release-channel.mjs'

export const UPDATE_STARTUP_DELAY_MS = 15_000
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
export const UPDATE_INSTALL_LAUNCH_TIMEOUT_MS = 10_000

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
    onInstallFailure = async () => {},
    downloadRouter,
    updateChannel = DEFAULT_UPDATE_CHANNEL,
    installLaunchTimeoutMs = UPDATE_INSTALL_LAUNCH_TIMEOUT_MS,
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
    this.onInstallFailure = onInstallFailure
    this.downloadRouter = downloadRouter
    this.updateChannel = normalizeUpdateChannel(updateChannel)
    this.installLaunchTimeoutMs = installLaunchTimeoutMs
    this.setTimeoutFn = setTimeoutFn
    this.setIntervalFn = setIntervalFn
    this.clearTimeoutFn = clearTimeoutFn
    this.clearIntervalFn = clearIntervalFn
    this.checking = false
    this.downloading = false
    this.installing = false
    this.manualCheck = false
    this.started = false
    this.startupTimer = undefined
    this.intervalTimer = undefined
    this.installTimer = undefined
    this.listeners = []
    this.status = Object.freeze({ phase: 'idle', currentVersion, visible: false })
  }

  start() {
    if (!this.enabled || this.started) return
    this.started = true
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.#configureUpdateChannel()
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
    if (this.installTimer) this.clearTimeoutFn(this.installTimer)
    for (const [event, listener] of this.listeners) this.updater?.removeListener(event, listener)
    this.listeners = []
    this.started = false
    this.installing = false
    this.installTimer = undefined
    this.#setProgress(-1)
  }

  async check({ manual = false } = {}) {
    if (!this.enabled) {
      if (manual) this.#publish({ phase: 'unavailable', visible: true })
      return false
    }
    if (this.checking || this.downloading || this.installing) {
      if (manual) this.#publish({ ...this.status, visible: true })
      return false
    }
    this.checking = true
    this.manualCheck = manual
    this.#publish({ phase: 'checking', visible: manual })
    this.#appendDiagnostic(`[updater] checking from ${this.currentVersion}`)
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
    const decision = evaluateUpdateForChannel({
      currentVersion: this.currentVersion,
      candidateVersion: info?.version,
      channel: this.updateChannel,
    })
    if (!decision.accepted) {
      const manual = this.manualCheck
      this.checking = false
      this.manualCheck = false
      this.#appendDiagnostic(`[updater] ignored ${info?.version || 'unknown'} on ${this.updateChannel}: ${decision.reason}`)
      this.#publish({ phase: 'current', visible: manual })
      return
    }
    this.checking = false
    this.manualCheck = false
    this.#appendDiagnostic(`[updater] version ${info?.version || 'unknown'} is available`)
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
      const onSource = (source) => {
        const label = typeof source?.label === 'string' ? source.label.slice(0, 160) : undefined
        this.#publish({ ...this.status, phase: 'downloading', source: label })
      }
      if (this.downloadRouter) await this.downloadRouter.downloadUpdate(info, { onSource })
      else await this.updater.downloadUpdate()
    } catch (error) {
      if (this.downloading) await this.#handleError(error, true)
    }
  }

  async #handleNotAvailable() {
    const manual = this.manualCheck
    this.checking = false
    this.manualCheck = false
    this.#appendDiagnostic(`[updater] ${this.currentVersion} is up to date`)
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
    this.#appendDiagnostic(`[updater] version ${info?.version || 'unknown'} downloaded`)
    this.#publish({
      ...this.status,
      phase: 'ready',
      version: info?.version || this.status.version,
      visible: true,
    })
  }

  async install() {
    if (!this.enabled || this.status.phase !== 'ready' || this.installing) return false
    this.installing = true
    this.#publish({ ...this.status, phase: 'installing', visible: true })
    try {
      await this.beforeInstall()
      if (!this.installing) return false
      this.updater.quitAndInstall(false, true)
      if (!this.installing) return false
      this.installTimer = this.setTimeoutFn(() => {
        void this.#handleError(new Error('update installer did not start before the launch timeout'), true)
      }, this.installLaunchTimeoutMs)
      this.installTimer?.unref?.()
      return true
    } catch (error) {
      await this.#handleError(error, true)
      return false
    }
  }

  async #handleError(error, forceVisible = false) {
    if (this.downloading && this.downloadRouter?.shouldDeferError?.(error)) {
      this.#appendDiagnostic(`[updater] ${asErrorMessage(error)}; retrying another source`)
      return
    }
    const recoverInstall = this.installing
    this.installing = false
    if (this.installTimer) this.clearTimeoutFn(this.installTimer)
    this.installTimer = undefined
    const shouldShow = forceVisible || recoverInstall || this.manualCheck || this.downloading
    this.checking = false
    this.manualCheck = false
    this.downloading = false
    this.#setProgress(-1)
    const message = asErrorMessage(error)
    this.#appendDiagnostic(`[updater] ${message}`)
    this.#publish({ phase: 'error', message, visible: shouldShow })
    if (recoverInstall) {
      try {
        await this.onInstallFailure(error)
      } catch (recoveryError) {
        this.#appendDiagnostic(`[updater] install recovery failed: ${asErrorMessage(recoveryError)}`)
      }
    }
  }

  getStatus() {
    return { ...this.status }
  }

  getChannel() {
    return this.updateChannel
  }

  setUpdateChannel(channel) {
    this.updateChannel = normalizeUpdateChannel(channel)
    if (this.updater) this.#configureUpdateChannel()
    return updateChannelConfiguration(this.updateChannel)
  }

  #configureUpdateChannel() {
    const configuration = updateChannelConfiguration(this.updateChannel)
    this.updater.channel = configuration.updaterChannel
    this.updater.allowPrerelease = configuration.allowPrerelease
    this.updater.allowDowngrade = configuration.allowDowngrade
  }

  #publish(status) {
    this.status = Object.freeze({ currentVersion: this.currentVersion, ...status })
    emitBestEffort(this, 'status', [this.getStatus()], (error) => {
      this.#appendDiagnostic(`[updater] status observer failed: ${asErrorMessage(error).slice(0, 1_000)}`)
    })
  }

  #appendDiagnostic(line) {
    try {
      const result = this.log(line)
      if (result && typeof result.catch === 'function') void result.catch(() => {})
    } catch {
      // Diagnostics are best-effort and never own update lifecycle progress.
    }
  }

  #setProgress(value) {
    try {
      const window = this.getWindow?.()
      if (window && !window.isDestroyed?.()) window.setProgressBar?.(value)
    } catch (error) {
      this.#appendDiagnostic(`[updater] taskbar progress failed: ${asErrorMessage(error).slice(0, 1_000)}`)
    }
  }

}

export async function loadElectronAutoUpdater() {
  const electronUpdater = await import('electron-updater')
  return electronUpdater.autoUpdater || electronUpdater.default?.autoUpdater
}
