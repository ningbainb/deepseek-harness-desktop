import semver from 'semver'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

export const UPDATE_CHANNELS = Object.freeze(['stable', 'beta'])
export const DEFAULT_UPDATE_CHANNEL = 'stable'

const UPDATE_CHANNEL_SET = new Set(UPDATE_CHANNELS)

function normalizedText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** Normalise persisted or externally supplied channel state without opting existing users into beta. */
export function normalizeUpdateChannel(value, fallback = DEFAULT_UPDATE_CHANNEL) {
  const candidate = normalizedText(value)
  if (UPDATE_CHANNEL_SET.has(candidate)) return candidate
  const normalizedFallback = normalizedText(fallback)
  return UPDATE_CHANNEL_SET.has(normalizedFallback) ? normalizedFallback : DEFAULT_UPDATE_CHANNEL
}

export function updaterChannelFor(channel) {
  return normalizeUpdateChannel(channel) === 'beta' ? 'beta' : 'latest'
}

export function updateChannelConfiguration(channel) {
  const normalized = normalizeUpdateChannel(channel)
  return Object.freeze({
    channel: normalized,
    updaterChannel: updaterChannelFor(normalized),
    allowPrerelease: normalized === 'beta',
    // Changing metadata channels must never turn a lower Stable release into an automatic downgrade.
    allowDowngrade: false,
  })
}

function parsedVersion(value) {
  return typeof value === 'string' ? semver.parse(value.trim()) : null
}

export function isPrereleaseVersion(value) {
  return Boolean(parsedVersion(value)?.prerelease.length > 0)
}

/**
 * Existing users keep their persisted/malformed-preference Stable default.
 * Only the first launch of a prerelease installer with no prior Desktop state
 * is seeded onto the Beta feed. The separate state check matters because every
 * 2.x installation predates update-channel-preferences.json.
 */
export function initialUpdateChannel({ hasPersistedPreference = true, hasExistingDesktopState = true, appVersion } = {}) {
  return hasPersistedPreference === false && hasExistingDesktopState === false && isPrereleaseVersion(appVersion)
    ? 'beta'
    : DEFAULT_UPDATE_CHANNEL
}

/**
 * State files that prove a user has used a Desktop release before the new
 * update-channel preference was introduced. These are inspected by path only;
 * no user settings, task data, or recovery contents are read here.
 */
export function desktopStateMarkers({ userData, desktopProfileDir } = {}) {
  const markers = []
  if (typeof userData === 'string' && userData.trim()) {
    markers.push(
      join(userData, 'window-state.json'),
      join(userData, 'desktop-preferences.json'),
      join(userData, 'settings-window-state.json'),
      join(userData, 'runtime-support-state.json'),
      join(userData, 'plugin-recovery', 'state.json'),
    )
  }
  if (typeof desktopProfileDir === 'string' && desktopProfileDir.trim()) {
    markers.push(
      join(desktopProfileDir, 'package.json'),
      join(desktopProfileDir, 'state', 'task-board', 'tasks-v2.json'),
      join(desktopProfileDir, 'state', 'task-board', 'tasks-v3.json'),
      join(desktopProfileDir, '.dsh-desktop-runtime.json'),
    )
  }
  return Object.freeze(markers)
}

async function pathExistsConservatively(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    // An inaccessible or otherwise unexpected marker must be treated as an
    // existing installation. Falling back to Stable is safer than silently
    // opting an existing user into a prerelease feed.
    return error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR'
  }
}

/** Determine whether durable pre-3.0 Desktop state already exists without reading its contents. */
export async function hasExistingDesktopState({ userData, desktopProfileDir, pathExists = pathExistsConservatively } = {}) {
  const markers = desktopStateMarkers({ userData, desktopProfileDir })
  const results = await Promise.all(markers.map((path) => pathExists(path)))
  return results.some(Boolean)
}

/** Decide whether a discovered artifact is compatible with the selected channel and installed version. */
export function evaluateUpdateForChannel({ currentVersion, candidateVersion, channel } = {}) {
  const current = parsedVersion(currentVersion)
  const candidate = parsedVersion(candidateVersion)
  if (candidate === null) return Object.freeze({ accepted: false, reason: 'invalid-version' })

  const normalizedChannel = normalizeUpdateChannel(channel)
  if (normalizedChannel === 'stable' && candidate.prerelease.length > 0) {
    return Object.freeze({ accepted: false, reason: 'channel-mismatch' })
  }
  if (current === null) return Object.freeze({ accepted: true, reason: 'newer' })

  const comparison = semver.compare(candidate, current)
  if (comparison < 0) return Object.freeze({ accepted: false, reason: 'downgrade' })
  if (comparison === 0) return Object.freeze({ accepted: false, reason: 'not-newer' })
  return Object.freeze({ accepted: true, reason: 'newer' })
}

/**
 * Small state holder for Electron settings integration. Callers persist `channel` in their own
 * Desktop state document; omitted or malformed historic state intentionally resolves to Stable.
 */
export class ReleaseChannelState {
  constructor({ currentVersion, channel } = {}) {
    this.currentVersion = currentVersion
    this.channel = normalizeUpdateChannel(channel)
  }

  setChannel(channel) {
    this.channel = normalizeUpdateChannel(channel)
    return updateChannelConfiguration(this.channel)
  }

  configuration() {
    return updateChannelConfiguration(this.channel)
  }

  evaluate(candidateVersion) {
    return evaluateUpdateForChannel({
      currentVersion: this.currentVersion,
      candidateVersion,
      channel: this.channel,
    })
  }
}
