import semver from 'semver'

import { packagePathSegments } from '../profile.mjs'

export const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const REGISTRY_VERSION_PATTERN = /^[0-9a-z][0-9a-z._+~-]*$/iu

export function registryManifestUrl(name, version = 'latest') {
  packagePathSegments(name)
  if (typeof version !== 'string' || !REGISTRY_VERSION_PATTERN.test(version)) {
    throw new TypeError(`invalid package version: ${JSON.stringify(version)}`)
  }
  return `${NPM_REGISTRY_ORIGIN}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
}

export class PluginRegistry {
  constructor({
    fetchImpl = fetch,
    timeoutMs = 10_000,
    cacheTtlMs = 5 * 60_000,
    concurrency = 4,
    now = Date.now,
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('registry fetch implementation is required')
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      throw new TypeError('registry timeout must be between 1 and 60000ms')
    }
    if (!Number.isInteger(cacheTtlMs) || cacheTtlMs < 0 || cacheTtlMs > 60 * 60_000) {
      throw new TypeError('registry cache TTL is invalid')
    }
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      throw new TypeError('registry concurrency must be between 1 and 8')
    }
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.cacheTtlMs = cacheTtlMs
    this.concurrency = concurrency
    this.now = now
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
    this.cache = new Map()
    this.inFlight = new Map()
  }

  fetchManifest(name, version = 'latest') {
    const url = registryManifestUrl(name, version)
    const key = `${name}@${version}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt >= this.now()) return Promise.resolve(cached.manifest)
    if (this.inFlight.has(key)) return this.inFlight.get(key)
    const operation = this.#fetch({ key, name, url })
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, operation)
    return operation
  }

  async #fetch({ key, name, url }) {
    const controller = new AbortController()
    const timer = this.schedule(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response?.ok) throw new Error(`registry request failed with HTTP ${String(response?.status ?? 'unknown')}`)
      const manifest = await response.json()
      if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('registry returned an invalid package manifest')
      }
      if (manifest.name !== name) throw new Error('registry package identity does not match the request')
      if (typeof manifest.version !== 'string' || semver.valid(manifest.version) === null) {
        throw new Error('registry returned an invalid package version')
      }
      const frozen = Object.freeze(manifest)
      this.cache.set(key, { manifest: frozen, expiresAt: this.now() + this.cacheTtlMs })
      return frozen
    } finally {
      this.cancelSchedule(timer)
    }
  }

  async check(names) {
    if (!Array.isArray(names)) throw new TypeError('registry package names must be an array')
    const results = new Array(names.length)
    let cursor = 0
    const worker = async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= names.length) return
        const name = names[index]
        try {
          results[index] = { name, manifest: await this.fetchManifest(name) }
        } catch {
          results[index] = { name, error: 'unavailable' }
        }
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(this.concurrency, names.length) },
      () => worker(),
    ))
    return results
  }
}
