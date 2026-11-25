import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  DEFAULT_UPDATE_CHANNEL,
  UPDATE_CHANNELS,
  normalizeUpdateChannel,
} from './release-channel.mjs'
import {
  DEFAULT_UPDATE_DOWNLOAD_ROUTE,
  UPDATE_DOWNLOAD_ROUTES,
  assertUpdateDownloadRoute,
  normalizeUpdateDownloadRoute,
} from './update-mirrors.mjs'

const UPDATE_CHANNEL_SET = new Set(UPDATE_CHANNELS)
const UPDATE_DOWNLOAD_ROUTE_SET = new Set(UPDATE_DOWNLOAD_ROUTES)

/** Return the conservative Stable default for absent or malformed Desktop state. */
export function normalizeUpdateChannelPreference(input) {
  return Object.freeze({
    channel: normalizeUpdateChannel(input?.channel, DEFAULT_UPDATE_CHANNEL),
  })
}

/** Validate an explicit renderer request instead of silently changing it to Stable. */
export function assertUpdateChannel(value) {
  const channel = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!UPDATE_CHANNEL_SET.has(channel)) {
    throw new TypeError(`invalid update channel: ${JSON.stringify(value)}`)
  }
  return channel
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  let movedExisting = false
  try {
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}

/**
 * Desktop-owned update channel state. This isolated document avoids granting
 * renderer pages access to general preferences and keeps missing 2.x state on
 * the Stable channel by default.
 */
export class DesktopUpdateChannelStore {
  constructor(path) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError('update channel preferences path is required')
    }
    this.path = path
    this.writeQueue = Promise.resolve()
  }

  /**
   * Keep the absence of a preference distinct from malformed historic state.
   * A prerelease installer may seed Beta on a truly fresh install, while every
   * existing or damaged preference stays conservatively on Stable.
   */
  async loadState() {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8'))
      const requested = typeof raw?.channel === 'string' ? raw.channel.trim().toLowerCase() : ''
      return Object.freeze({
        channel: normalizeUpdateChannelPreference(raw).channel,
        exists: true,
        valid: UPDATE_CHANNEL_SET.has(requested),
      })
    } catch (error) {
      return Object.freeze({
        channel: DEFAULT_UPDATE_CHANNEL,
        exists: error?.code !== 'ENOENT',
        valid: false,
      })
    }
  }

  async load() {
    return (await this.loadState()).channel
  }

  async loadDownloadRoute() {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8'))
      return normalizeUpdateDownloadRoute(raw?.downloadRoute, DEFAULT_UPDATE_DOWNLOAD_ROUTE)
    } catch {
      return DEFAULT_UPDATE_DOWNLOAD_ROUTE
    }
  }

  async #readExistingRaw() {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8'))
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    } catch {
      return {}
    }
  }

  save(channel) {
    const normalized = assertUpdateChannel(channel)
    const operation = this.writeQueue.then(async () => {
      const existing = await this.#readExistingRaw()
      const route = typeof existing.downloadRoute === 'string' && UPDATE_DOWNLOAD_ROUTE_SET.has(existing.downloadRoute.trim().toLowerCase())
        ? existing.downloadRoute.trim().toLowerCase()
        : undefined
      await atomicWrite(
        this.path,
        `${JSON.stringify({ schemaVersion: 1, channel: normalized, ...(route ? { downloadRoute: route } : {}) }, null, 2)}\n`,
      )
    })
    this.writeQueue = operation.catch(() => {})
    return operation.then(() => normalized)
  }

  saveDownloadRoute(route) {
    const normalized = assertUpdateDownloadRoute(route)
    const operation = this.writeQueue.then(async () => {
      const existing = await this.#readExistingRaw()
      const channel = normalizeUpdateChannelPreference(existing).channel
      await atomicWrite(
        this.path,
        `${JSON.stringify({ schemaVersion: 1, channel, downloadRoute: normalized }, null, 2)}\n`,
      )
    })
    this.writeQueue = operation.catch(() => {})
    return operation.then(() => normalized)
  }
}
