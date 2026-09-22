import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const UPDATE_CHECK_SUCCESS_INTERVAL_MS = 6 * 60 * 60 * 1000
export const UPDATE_CHECK_OFFLINE_RETRY_MS = 60 * 60 * 1000

const NETWORK_BACKOFF_MS = Object.freeze([
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
])
const SERVICE_BACKOFF_MS = Object.freeze([
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
])
const LOCAL_BACKOFF_MS = Object.freeze([24 * 60 * 60 * 1000])
const CHANNELS = new Set(['stable', 'beta'])
const FAILURE_TYPES = new Set([
  'network',
  'timeout',
  'http',
  'rate_limit',
  'metadata',
  'checksum',
  'signature',
  'permission',
  'file_busy',
  'disk_full',
  'prepare_timeout',
  'launch_timeout',
  'cancelled',
  'unknown',
])

function timestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function defaultState(channel) {
  return Object.freeze({
    schemaVersion: 1,
    channel,
    consecutiveFailures: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextAutomaticCheckAt: 0,
    lastFailureType: null,
    lastDeferralReason: null,
  })
}

export function normalizeUpdateCheckState(value, channel = 'stable') {
  const safeChannel = CHANNELS.has(channel) ? channel : 'stable'
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.schemaVersion !== 1
    || value.channel !== safeChannel
  ) return defaultState(safeChannel)
  const failures = Number.isSafeInteger(value.consecutiveFailures)
    ? Math.max(0, Math.min(100, value.consecutiveFailures))
    : 0
  const failureType = FAILURE_TYPES.has(value.lastFailureType) ? value.lastFailureType : null
  return Object.freeze({
    schemaVersion: 1,
    channel: safeChannel,
    consecutiveFailures: failures,
    lastAttemptAt: timestamp(value.lastAttemptAt) ?? null,
    lastSuccessAt: timestamp(value.lastSuccessAt) ?? null,
    nextAutomaticCheckAt: timestamp(value.nextAutomaticCheckAt) ?? 0,
    lastFailureType: failureType,
    lastDeferralReason: value.lastDeferralReason === 'offline' ? 'offline' : null,
  })
}

function backoffFor(errorType, consecutiveFailures) {
  const schedule = ['network', 'timeout', 'cancelled'].includes(errorType)
    ? NETWORK_BACKOFF_MS
    : ['http', 'rate_limit', 'metadata', 'checksum', 'signature', 'unknown'].includes(errorType)
      ? SERVICE_BACKOFF_MS
      : LOCAL_BACKOFF_MS
  return schedule[Math.min(Math.max(1, consecutiveFailures), schedule.length) - 1]
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const suffix = `${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`
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
    await rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await rm(path, { force: true }).catch(() => {})
      await rename(backup, path).catch(() => {})
    }
    throw error
  }
}

/**
 * Desktop-owned automatic update cadence. The file contains only bounded
 * timestamps, a release channel and fixed error categories. Manual checks are
 * deliberately handled by the controller and never blocked by this store.
 */
export class DesktopUpdateCheckStore {
  constructor({ path, now = Date.now, random = Math.random } = {}) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('update check state path is required')
    if (typeof now !== 'function') throw new TypeError('update check clock is required')
    if (typeof random !== 'function') throw new TypeError('update check random source is required')
    this.path = path
    this.now = now
    this.random = random
    this.writeQueue = Promise.resolve()
  }

  async load(channel = 'stable') {
    try {
      return normalizeUpdateCheckState(JSON.parse(await readFile(this.path, 'utf8')), channel)
    } catch {
      return normalizeUpdateCheckState(undefined, channel)
    }
  }

  async shouldCheck(channel = 'stable') {
    const state = await this.load(channel)
    return this.now() >= state.nextAutomaticCheckAt
  }

  recordAttempt(channel = 'stable') {
    return this.#update(channel, (state, now) => ({
      ...state,
      lastAttemptAt: now,
      nextAutomaticCheckAt: now + UPDATE_CHECK_SUCCESS_INTERVAL_MS,
      lastDeferralReason: null,
    }))
  }

  recordSuccess(channel = 'stable') {
    return this.#update(channel, (state, now) => ({
      ...state,
      consecutiveFailures: 0,
      lastSuccessAt: now,
      nextAutomaticCheckAt: now + UPDATE_CHECK_SUCCESS_INTERVAL_MS,
      lastFailureType: null,
      lastDeferralReason: null,
    }))
  }

  recordFailure(channel = 'stable', errorType = 'unknown') {
    const safeType = FAILURE_TYPES.has(errorType) ? errorType : 'unknown'
    return this.#update(channel, (state, now) => {
      const consecutiveFailures = Math.min(100, state.consecutiveFailures + 1)
      const base = backoffFor(safeType, consecutiveFailures)
      const jitter = Math.floor(base * 0.15 * Math.max(0, Math.min(1, Number(this.random()) || 0)))
      return {
        ...state,
        consecutiveFailures,
        nextAutomaticCheckAt: now + base + jitter,
        lastFailureType: safeType,
        lastDeferralReason: null,
      }
    })
  }

  deferOffline(channel = 'stable') {
    return this.#update(channel, (state, now) => ({
      ...state,
      nextAutomaticCheckAt: Math.max(state.nextAutomaticCheckAt, now + UPDATE_CHECK_OFFLINE_RETRY_MS),
      lastDeferralReason: 'offline',
    }))
  }

  #update(channel, transform) {
    const safeChannel = CHANNELS.has(channel) ? channel : 'stable'
    const operation = this.writeQueue.then(async () => {
      const current = await this.load(safeChannel)
      const next = normalizeUpdateCheckState(transform(current, this.now()), safeChannel)
      await atomicWrite(this.path, `${JSON.stringify(next, null, 2)}\n`)
      return next
    })
    this.writeQueue = operation.catch(() => {})
    return operation
  }
}
