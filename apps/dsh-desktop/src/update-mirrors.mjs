import { performance } from 'node:perf_hooks'

const PROBE_BYTES = 64 * 1024

// GitHub is the only built-in transport. Administrators may opt into an
// HTTPS proxy through DSH_DESKTOP_UPDATE_MIRRORS, but Desktop never promotes
// an unowned third-party mirror as the default path.
export const DEFAULT_UPDATE_MIRRORS = Object.freeze([])

export const OFFICIAL_UPDATE_SOURCE = Object.freeze({
  id: 'github',
  label: 'GitHub 官方',
  prefix: undefined,
})

export const UPDATE_DOWNLOAD_ROUTES = Object.freeze(['auto', 'cdn', 'github'])
export const DEFAULT_UPDATE_DOWNLOAD_ROUTE = 'auto'
const UPDATE_DOWNLOAD_ROUTE_SET = new Set(UPDATE_DOWNLOAD_ROUTES)
const CHINA_TIMEZONES = new Set(['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi', 'PRC'])

export function normalizeUpdateDownloadRoute(value, fallback = DEFAULT_UPDATE_DOWNLOAD_ROUTE) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (UPDATE_DOWNLOAD_ROUTE_SET.has(candidate)) return candidate
  const normalizedFallback = typeof fallback === 'string' ? fallback.trim().toLowerCase() : ''
  return UPDATE_DOWNLOAD_ROUTE_SET.has(normalizedFallback) ? normalizedFallback : DEFAULT_UPDATE_DOWNLOAD_ROUTE
}

export function assertUpdateDownloadRoute(value) {
  const route = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!UPDATE_DOWNLOAD_ROUTE_SET.has(route)) {
    throw new TypeError(`invalid update download route: ${JSON.stringify(value)}`)
  }
  return route
}

export function detectChinaRegion({ timeZone, locale } = {}) {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions()
    const tz = typeof timeZone === 'string' ? timeZone : resolved.timeZone
    if (typeof tz === 'string' && CHINA_TIMEZONES.has(tz)) return true
    const loc = typeof locale === 'string' ? locale : resolved.locale
    if (typeof loc === 'string' && /^zh(?:[-_](?:hans[-_])?cn)\b/iu.test(loc)) return true
  } catch {
    // Fall back safely when Intl options are unavailable.
  }
  return false
}

function normalizedMirror(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    url.hash = ''
    url.search = ''
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    if (/\/releases\/$/iu.test(url.pathname)) {
      return Object.freeze({
        id: url.hostname,
        label: `CDN 加速 ${url.hostname}`,
        prefix: url.href,
        mode: 'release-path',
      })
    }
    return Object.freeze({
      id: url.hostname,
      label: `备用线路 ${url.hostname}`,
      prefix: url.href,
    })
  } catch {
    return undefined
  }
}

export function parseUpdateMirrors(value, defaults = DEFAULT_UPDATE_MIRRORS) {
  if (value == null || String(value).trim() === '') return [...defaults]
  const setting = String(value).trim().toLowerCase()
  if (setting === 'off' || setting === 'official' || setting === 'none') return []
  const seen = new Set()
  return String(value)
    .split(/[;,\s]+/)
    .map(normalizedMirror)
    .filter((mirror) => {
      if (!mirror || seen.has(mirror.prefix)) return false
      seen.add(mirror.prefix)
      return true
    })
}

function isPublicGitHubReleaseAsset(url) {
  return url.protocol === 'https:'
    && url.hostname === 'github.com'
    && /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+/.test(url.pathname)
}

export function rewriteGitHubReleaseUrl(value, source) {
  const original = value instanceof URL ? new URL(value.href) : new URL(value)
  if (!source?.prefix || !isPublicGitHubReleaseAsset(original)) return original
  if (source.mode === 'release-path' || /\/releases\/$/iu.test(source.prefix)) {
    const match = /^\/[^/]+\/[^/]+\/releases\/download\/([^/]+\/.+)$/.exec(original.pathname)
    if (match) return new URL(`${source.prefix}${match[1]}`)
  }
  return new URL(`${source.prefix}${original.href}`)
}

function isHtmlResponse(response) {
  const contentType = response?.headers?.get?.('content-type') || ''
  return /(?:text\/html|application\/xhtml\+xml)/i.test(contentType)
}

export async function probeUpdateSource(url, {
  fetchFn = globalThis.fetch,
  timeoutMs = 3_000,
  now = () => performance.now(),
} = {}) {
  const startedAt = now()
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), timeoutMs)
  timer.unref?.()
  let reader
  try {
    if (typeof fetchFn !== 'function') throw new Error('update source probe is unavailable')
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream',
        Range: `bytes=0-${PROBE_BYTES - 1}`,
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: abortController.signal,
    })
    if (!response?.ok || ![200, 206].includes(response.status) || isHtmlResponse(response)) {
      throw new Error(`unexpected probe response ${response?.status || 'unknown'}`)
    }
    reader = response.body?.getReader?.()
    let received = 0
    while (reader && received < PROBE_BYTES) {
      const chunk = await reader.read()
      if (chunk.done) break
      received += chunk.value?.byteLength || 0
    }
    await reader?.cancel?.().catch?.(() => {})
    return { ok: true, elapsedMs: Math.max(0, now() - startedAt) }
  } catch (error) {
    await reader?.cancel?.().catch?.(() => {})
    return {
      ok: false,
      elapsedMs: Math.max(0, now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function rankUpdateSources({
  officialUrl,
  mirrors,
  probe,
  route = DEFAULT_UPDATE_DOWNLOAD_ROUTE,
  preferCdn = false,
}) {
  const normalizedRoute = normalizeUpdateDownloadRoute(route)
  const candidates = [
    { ...OFFICIAL_UPDATE_SOURCE, url: new URL(officialUrl) },
    ...(normalizedRoute === 'github'
      ? []
      : mirrors.map((source) => ({ ...source, url: rewriteGitHubReleaseUrl(officialUrl, source) }))),
  ]
  const results = await Promise.all(candidates.map(async (source, index) => {
    try {
      const result = await probe(source.url.href, source)
      return { ...source, probe: result, index }
    } catch (error) {
      return {
        ...source,
        probe: { ok: false, elapsedMs: Number.POSITIVE_INFINITY, error: String(error) },
        index,
      }
    }
  }))
  const [official, ...fallbacks] = results
  fallbacks.sort((left, right) => {
    if (left.probe.ok !== right.probe.ok) return left.probe.ok ? -1 : 1
    if (left.probe.ok && left.probe.elapsedMs !== right.probe.elapsedMs) {
      return left.probe.elapsedMs - right.probe.elapsedMs
    }
    return left.index - right.index
  })
  const healthyFallbacks = fallbacks.filter((item) => item.probe.ok)
  const failedFallbacks = fallbacks.filter((item) => !item.probe.ok)
  if (normalizedRoute === 'cdn' && healthyFallbacks.length > 0) {
    return [...healthyFallbacks, official, ...failedFallbacks]
  }
  if (normalizedRoute === 'auto' && preferCdn && healthyFallbacks.length > 0) {
    if (!official.probe.ok || healthyFallbacks[0].probe.elapsedMs < official.probe.elapsedMs) {
      return [...healthyFallbacks, official, ...failedFallbacks]
    }
  }
  return [official, ...fallbacks]
}

function rewriteResolvedFiles(files, source) {
  return files.map((file) => ({
    ...file,
    url: rewriteGitHubReleaseUrl(file.url, source),
    ...(file.packageInfo ? {
      packageInfo: {
        ...file.packageInfo,
        path: rewriteGitHubReleaseUrl(file.packageInfo.path, source).href,
      },
    } : {}),
  }))
}

export class UpdateDownloadRouter {
  constructor({
    updater,
    mirrors = DEFAULT_UPDATE_MIRRORS,
    probe = (url) => probeUpdateSource(url),
    getDownloadRoute = () => DEFAULT_UPDATE_DOWNLOAD_ROUTE,
    preferCdn = () => detectChinaRegion(),
    log = () => {},
  }) {
    this.updater = updater
    this.mirrors = mirrors
    this.probe = probe
    this.getDownloadRoute = getDownloadRoute
    this.preferCdn = preferCdn
    this.log = log
    this.active = false
    this.attemptIndex = -1
    this.sources = []
  }

  shouldDeferError() {
    return this.active && this.attemptIndex >= 0 && this.attemptIndex < this.sources.length - 1
  }

  async downloadUpdate(info, { onSource = () => {} } = {}) {
    const provider = this.updater?.updateInfoAndProvider?.provider
    if (!provider || typeof provider.resolveFiles !== 'function') {
      onSource(OFFICIAL_UPDATE_SOURCE)
      return this.updater.downloadUpdate()
    }

    const hadOwnResolveFiles = Object.hasOwn(provider, 'resolveFiles')
    const ownResolveFiles = provider.resolveFiles
    const resolveOfficialFiles = provider.resolveFiles.bind(provider)
    const officialFiles = resolveOfficialFiles(info)
    const officialAsset = officialFiles.find((file) => isPublicGitHubReleaseAsset(file.url))
    if (!officialAsset) {
      onSource(OFFICIAL_UPDATE_SOURCE)
      return this.updater.downloadUpdate()
    }

    this.sources = await rankUpdateSources({
      officialUrl: officialAsset.url,
      mirrors: this.mirrors,
      probe: this.probe,
      route: this.getDownloadRoute(),
      preferCdn: Boolean(this.preferCdn()),
    })
    this.active = true
    let lastError
    try {
      for (let index = 0; index < this.sources.length; index += 1) {
        const source = this.sources[index]
        this.attemptIndex = index
        provider.resolveFiles = (nextInfo) => rewriteResolvedFiles(resolveOfficialFiles(nextInfo), source)
        onSource({ ...source, attempt: index + 1, total: this.sources.length })
        this.log(`[updater] download source ${source.label} (${index + 1}/${this.sources.length})`)
        try {
          return await this.updater.downloadUpdate()
        } catch (error) {
          lastError = error
          if (index < this.sources.length - 1) {
            this.log(`[updater] source ${source.label} failed, switching to fallback`)
          }
        }
      }
      throw lastError || new Error('all update download sources failed')
    } finally {
      this.active = false
      this.attemptIndex = -1
      this.sources = []
      if (hadOwnResolveFiles) provider.resolveFiles = ownResolveFiles
      else delete provider.resolveFiles
    }
  }
}
