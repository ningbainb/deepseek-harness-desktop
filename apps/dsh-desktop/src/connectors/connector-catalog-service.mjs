import { writeJsonAtomic } from '../atomic-write-adapter.mjs'
import { verify as cryptoVerify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULT_FETCH_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/u
const SEMVER_PATTERN = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?$/u
const CATEGORIES = new Set(['office-suite', 'meeting-docs', 'knowledge-notes', 'storage-mail', 'dev-collab', 'other'])
const DRIVER_KINDS = new Set(['cli', 'mcp-remote', 'mcp-stdio', 'skill'])
const AUTH_MODES = new Set(['cli-native', 'oauth2', 'personal-token', 'api-key', 'custom-fields'])
const RISK_LEVELS = new Set(['L0', 'L1', 'L2', 'L3'])
const HEALTH_KINDS = new Set(['cli-command', 'mcp-probe', 'skill-present'])

export class ConnectorCatalogError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ConnectorCatalogError'
    this.code = code
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertLocalizedText(value, label) {
  if (!isPlainObject(value) || typeof value.zh !== 'string' || typeof value.en !== 'string'
    || value.zh.trim().length === 0 || value.en.trim().length === 0) {
    throw new ConnectorCatalogError('INVALID_CATALOG', `${label} must provide non-empty zh and en text`)
  }
}

function assertHttpsUrl(value, label) {
  if (typeof value !== 'string') {
    throw new ConnectorCatalogError('INVALID_CATALOG', `${label} must be an HTTPS URL`)
  }
  let parsed
  try { parsed = new URL(value) } catch {
    throw new ConnectorCatalogError('INVALID_CATALOG', `${label} is not a valid URL`)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new ConnectorCatalogError('INVALID_CATALOG', `${label} must use credential-free HTTPS`)
  }
}

function assertNoShellScriptPayload(value, label) {
  if (!isPlainObject(value)) return
  for (const forbidden of ['script', 'installScript', 'shell', 'postInstallScript', 'inlineScript']) {
    if (forbidden in value) {
      throw new ConnectorCatalogError('UNSAFE_CATALOG_ENTRY', `${label} contains forbidden field "${forbidden}"`)
    }
  }
}

function validateDriver(driver, index, connectorId) {
  const prefix = `connector "${connectorId}" driver[${index}]`
  if (!isPlainObject(driver)) throw new ConnectorCatalogError('INVALID_CATALOG', `${prefix} must be an object`)
  assertNoShellScriptPayload(driver, prefix)
  if (!DRIVER_KINDS.has(driver.kind)) {
    throw new ConnectorCatalogError('INVALID_CATALOG', `${prefix} has unknown kind`)
  }
  if (typeof driver.id !== 'string' || !ID_PATTERN.test(driver.id)) {
    throw new ConnectorCatalogError('INVALID_CATALOG', `${prefix} has invalid id`)
  }
  if (driver.kind === 'mcp-remote') {
    assertHttpsUrl(driver.url, `${prefix}.url`)
    if (driver.remoteTransport !== 'streamable-http' && driver.remoteTransport !== 'sse-legacy') {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${prefix}.remoteTransport is invalid`)
    }
  }
  if (driver.kind === 'cli') {
    if (typeof driver.binary !== 'string' || driver.binary.trim().length === 0 || !isPlainObject(driver.installSource)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${prefix} must declare binary and installSource`)
    }
    assertNoShellScriptPayload(driver.installSource, `${prefix}.installSource`)
  }
  if (driver.kind === 'mcp-stdio') {
    if (typeof driver.command !== 'string' || driver.command.trim().length === 0 || !Array.isArray(driver.args)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${prefix} must declare command and args`)
    }
    if (driver.installSource !== undefined) assertNoShellScriptPayload(driver.installSource, `${prefix}.installSource`)
  }
}

export function validateConnectorCatalog(catalog) {
  if (!isPlainObject(catalog)) {
    throw new ConnectorCatalogError('INVALID_CATALOG', 'catalog must be an object')
  }
  if (catalog.schemaVersion !== 1) {
    throw new ConnectorCatalogError('UNSUPPORTED_SCHEMA', 'connector catalog schemaVersion must equal 1')
  }
  if (typeof catalog.catalogVersion !== 'string' || catalog.catalogVersion.trim().length === 0) {
    throw new ConnectorCatalogError('INVALID_CATALOG', 'catalogVersion is required')
  }
  if (typeof catalog.updatedAt !== 'string' || Number.isNaN(Date.parse(catalog.updatedAt))) {
    throw new ConnectorCatalogError('INVALID_CATALOG', 'updatedAt must be a valid ISO timestamp')
  }
  if (!Array.isArray(catalog.connectors) || catalog.connectors.length === 0) {
    throw new ConnectorCatalogError('INVALID_CATALOG', 'connectors must be a non-empty array')
  }

  const seenIds = new Set()
  for (const entry of catalog.connectors) {
    if (!isPlainObject(entry)) throw new ConnectorCatalogError('INVALID_CATALOG', 'connector entry must be an object')
    assertNoShellScriptPayload(entry, `connector "${String(entry.id ?? '')}"`)
    if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `invalid connector id: ${String(entry.id)}`)
    }
    if (seenIds.has(entry.id)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `duplicate connector id: ${entry.id}`)
    }
    seenIds.add(entry.id)
    assertLocalizedText(entry.name, `${entry.id}.name`)
    assertLocalizedText(entry.summary, `${entry.id}.summary`)
    if (!CATEGORIES.has(entry.category)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${entry.id}.category is invalid`)
    }
    if (typeof entry.minDesktopVersion !== 'string' || !SEMVER_PATTERN.test(entry.minDesktopVersion)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${entry.id}.minDesktopVersion must be SemVer`)
    }
    if (!isPlainObject(entry.officialUrls)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${entry.id}.officialUrls is required`)
    }
    assertHttpsUrl(entry.officialUrls.docs, `${entry.id}.officialUrls.docs`)
    if (entry.officialUrls.repo !== undefined) assertHttpsUrl(entry.officialUrls.repo, `${entry.id}.officialUrls.repo`)
    if (entry.officialUrls.openPlatform !== undefined) assertHttpsUrl(entry.officialUrls.openPlatform, `${entry.id}.officialUrls.openPlatform`)
    if (!Array.isArray(entry.drivers) || entry.drivers.length === 0) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${entry.id}.drivers must be non-empty`)
    }
    entry.drivers.forEach((driver, index) => validateDriver(driver, index, entry.id))
    if (!isPlainObject(entry.auth) || !AUTH_MODES.has(entry.auth.mode) || !isPlainObject(entry.auth.guideSteps)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${entry.id}.auth is invalid`)
    }
    if (entry.auth.quickAuthUrl !== undefined) assertHttpsUrl(entry.auth.quickAuthUrl, `${entry.id}.auth.quickAuthUrl`)
    if (entry.auth.manualUrl !== undefined) assertHttpsUrl(entry.auth.manualUrl, `${entry.id}.auth.manualUrl`)
    if (!isPlainObject(entry.healthCheck) || !HEALTH_KINDS.has(entry.healthCheck.kind)) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${entry.id}.healthCheck is invalid`)
    }
    if (!Array.isArray(entry.riskRules) || entry.riskRules.length === 0
      || entry.riskRules.some(rule => !isPlainObject(rule) || !RISK_LEVELS.has(rule.level))) {
      throw new ConnectorCatalogError('INVALID_CATALOG', `${entry.id}.riskRules is invalid`)
    }
  }
  return catalog
}

export function verifyCatalogSignature(rawBytes, signatureBase64, publicKeyPem) {
  if (!Buffer.isBuffer(rawBytes) && !(rawBytes instanceof Uint8Array)) {
    throw new TypeError('rawBytes must be a Buffer or Uint8Array')
  }
  if (typeof signatureBase64 !== 'string' || signatureBase64.trim().length === 0) return false
  if (typeof publicKeyPem !== 'string' || publicKeyPem.trim().length === 0) return false
  try {
    const signature = Buffer.from(signatureBase64.trim(), 'base64')
    if (signature.length === 0) return false
    return cryptoVerify(null, rawBytes, publicKeyPem, signature)
  } catch {
    return false
  }
}

export function compareSemver(left, right) {
  const a = SEMVER_PATTERN.exec(String(left ?? '').trim())
  const b = SEMVER_PATTERN.exec(String(right ?? '').trim())
  if (!a || !b) return 0
  for (const idx of [1, 2, 3]) {
    const diff = Number(a[idx]) - Number(b[idx])
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  if (a[4] === b[4]) return 0
  if (a[4] === undefined) return 1
  if (b[4] === undefined) return -1
  return a[4].localeCompare(b[4])
}

export function isCompatibleWithDesktop(minDesktopVersion, desktopVersion) {
  if (!desktopVersion || !SEMVER_PATTERN.test(desktopVersion)) return true
  if (!minDesktopVersion || !SEMVER_PATTERN.test(minDesktopVersion)) return true
  return compareSemver(desktopVersion, minDesktopVersion) >= 0
}

function driverSourceSignature(driver) {
  if (driver.kind === 'mcp-remote') return `${driver.kind}:${driver.url}:${driver.remoteTransport}`
  if (driver.kind === 'cli') return `${driver.kind}:${driver.binary}:${JSON.stringify(driver.installSource)}`
  if (driver.kind === 'mcp-stdio') return `${driver.kind}:${driver.command}:${JSON.stringify(driver.installSource ?? null)}`
  return `${driver.kind}:${driver.skillName}:${JSON.stringify(driver.source)}`
}

export function diffConnectorSecurityChanges(previousEntry, nextEntry) {
  if (!previousEntry || !nextEntry) return { requiresUserApproval: false, reasons: [] }
  const reasons = []
  const prevHosts = [previousEntry.auth?.quickAuthUrl, previousEntry.auth?.manualUrl]
    .filter(Boolean).map(value => new URL(value).host)
  const nextHosts = [nextEntry.auth?.quickAuthUrl, nextEntry.auth?.manualUrl]
    .filter(Boolean).map(value => new URL(value).host)
  if (JSON.stringify(prevHosts) !== JSON.stringify(nextHosts)) {
    reasons.push('authorization endpoint host changed')
  }
  const prevSources = (previousEntry.drivers ?? []).map(driverSourceSignature)
  const nextSources = (nextEntry.drivers ?? []).map(driverSourceSignature)
  if (JSON.stringify(prevSources) !== JSON.stringify(nextSources)) {
    reasons.push('connector driver endpoint or package source changed')
  }
  const prevAllowed = new Set((previousEntry.drivers ?? []).flatMap(driver => driver.allowedTools ?? []))
  const nextAllowed = (nextEntry.drivers ?? []).flatMap(driver => driver.allowedTools ?? [])
  if (nextAllowed.some(tool => prevAllowed.size > 0 && !prevAllowed.has(tool))) {
    reasons.push('allowed tool scope expanded')
  }
  return { requiresUserApproval: reasons.length > 0, reasons }
}

async function readBoundedBytes(response, maxBytes) {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) {
      throw new ConnectorCatalogError('RESPONSE_TOO_LARGE', 'catalog response exceeds size cap')
    }
    return buffer
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new ConnectorCatalogError('RESPONSE_TOO_LARGE', 'catalog response exceeds size cap')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, total)
}

export class ConnectorCatalogService {
  constructor({
    cacheDir,
    builtinCatalogPath = new URL('./builtin-catalog.v1.json', import.meta.url),
    desktopVersion = '5.4.0',
  }) {
    if (typeof cacheDir !== 'string' || cacheDir.trim().length === 0) {
      throw new TypeError('cacheDir is required')
    }
    this.cacheDir = cacheDir
    this.cachePath = join(cacheDir, 'catalog-cache.json')
    this.metaPath = join(cacheDir, 'catalog-meta.json')
    this.builtinCatalogPath = builtinCatalogPath
    this.desktopVersion = desktopVersion
  }

  async #readBuiltin() {
    const raw = await readFile(this.builtinCatalogPath, 'utf8')
    return validateConnectorCatalog(JSON.parse(raw))
  }

  async #readCache() {
    try {
      const [rawCatalog, rawMeta] = await Promise.all([
        readFile(this.cachePath, 'utf8'),
        readFile(this.metaPath, 'utf8').catch(() => '{}'),
      ])
      const catalog = validateConnectorCatalog(JSON.parse(rawCatalog))
      const meta = JSON.parse(rawMeta)
      return { catalog, meta: isPlainObject(meta) ? meta : {} }
    } catch {
      return undefined
    }
  }

  annotate(catalog, { source, meta = {}, previousCatalog, lastError } = {}) {
    const previousById = new Map((previousCatalog?.connectors ?? []).map(entry => [entry.id, entry]))
    const connectors = catalog.connectors.map((entry) => {
      const securityDiff = previousById.has(entry.id)
        ? diffConnectorSecurityChanges(previousById.get(entry.id), entry)
        : { requiresUserApproval: false, reasons: [] }
      const compatible = isCompatibleWithDesktop(entry.minDesktopVersion, this.desktopVersion)
      return {
        ...entry,
        compatible,
        compatibilityReason: compatible ? undefined : `requires desktop >= ${entry.minDesktopVersion}`,
        securityReview: securityDiff,
      }
    })
    return {
      schemaVersion: catalog.schemaVersion,
      catalogVersion: catalog.catalogVersion,
      updatedAt: catalog.updatedAt,
      source,
      meta,
      ...(lastError ? { lastError } : {}),
      connectors,
    }
  }

  async load() {
    const cached = await this.#readCache()
    if (cached) {
      return this.annotate(cached.catalog, { source: 'cache', meta: cached.meta })
    }
    const builtin = await this.#readBuiltin()
    return this.annotate(builtin, { source: 'builtin' })
  }

  async refresh({
    fetchImpl = globalThis.fetch,
    remoteUrl,
    signatureUrl,
    publicKeyPem,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
  } = {}) {
    const current = await this.load()
    if (typeof remoteUrl !== 'string' || remoteUrl.trim().length === 0 || typeof fetchImpl !== 'function') {
      return current
    }
    assertHttpsUrl(remoteUrl, 'remoteUrl')
    if (signatureUrl !== undefined) assertHttpsUrl(signatureUrl, 'signatureUrl')

    const headers = {}
    if (typeof current.meta?.etag === 'string') headers['if-none-match'] = current.meta.etag
    if (typeof current.meta?.lastModified === 'string') headers['if-modified-since'] = current.meta.lastModified

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(remoteUrl, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: controller.signal,
      })
      if (response.status === 304) {
        const meta = {
          ...current.meta,
          lastCheckedAt: new Date().toISOString(),
        }
        await writeJsonAtomic(this.metaPath, meta).catch(() => {})
        return { ...current, meta }
      }
      if (!response.ok) {
        throw new ConnectorCatalogError('HTTP_ERROR', `catalog fetch returned ${response.status}`)
      }
      const rawBytes = await readBoundedBytes(response, maxBytes)
      if (typeof publicKeyPem === 'string' && publicKeyPem.trim().length > 0) {
        let signatureBase64 = response.headers?.get?.('x-catalog-signature') ?? ''
        if (!signatureBase64 && signatureUrl) {
          const sigResponse = await fetchImpl(signatureUrl, {
            method: 'GET',
            redirect: 'error',
            signal: controller.signal,
          })
          if (!sigResponse.ok) {
            throw new ConnectorCatalogError('SIGNATURE_FETCH_FAILED', `signature fetch returned ${sigResponse.status}`)
          }
          signatureBase64 = (await readBoundedBytes(sigResponse, 16_384)).toString('utf8').trim()
        }
        if (!verifyCatalogSignature(rawBytes, signatureBase64, publicKeyPem)) {
          throw new ConnectorCatalogError('INVALID_SIGNATURE', 'catalog signature verification failed')
        }
      }
      const parsed = validateConnectorCatalog(JSON.parse(rawBytes.toString('utf8')))
      const meta = {
        etag: response.headers?.get?.('etag') ?? undefined,
        lastModified: response.headers?.get?.('last-modified') ?? undefined,
        fetchedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        catalogVersion: parsed.catalogVersion,
      }
      await writeJsonAtomic(this.cachePath, parsed)
      await writeJsonAtomic(this.metaPath, meta)
      return this.annotate(parsed, { source: 'remote', meta, previousCatalog: current })
    } catch (error) {
      return {
        ...current,
        lastError: {
          code: error instanceof ConnectorCatalogError ? error.code : 'REFRESH_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
