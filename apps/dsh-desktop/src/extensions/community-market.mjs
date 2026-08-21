import { createHash } from 'node:crypto'

export const COMMUNITY_MARKET_URL = 'https://awesome-dsh-plugin.com/plugins.json'

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 2_000_000
const MAX_PLUGINS = 5_000
const MAX_NAME_LENGTH = 200
const MAX_OWNER_LENGTH = 100
const MAX_CATEGORY_LENGTH = 80
const MAX_DESCRIPTION_LENGTH = 600
const MAX_URL_LENGTH = 2_048

const NPM_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/u
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/u
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{20}$/u
const RETIRED_MARKET_PACKAGES = new Set(['dshmarket'])

function boundedString(value, maxLength) {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  if (result.length === 0 || result.length > maxLength) return undefined
  return result
}

function boundedInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) return undefined
  return value
}

function parseGithubRepository(value) {
  const url = boundedString(value, MAX_URL_LENGTH)
  if (url === undefined) return undefined

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.search || parsed.hash) {
    return undefined
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2) return undefined
  const repositoryName = segments[1].replace(/\.git$/u, '')
  const repository = `${segments[0]}/${repositoryName}`
  if (!GITHUB_REPOSITORY_PATTERN.test(repository)) return undefined

  if (segments.length === 2) return { repository, subpath: undefined, url }
  if (segments.length < 5 || segments[2] !== 'tree') return undefined
  const subpathSegments = segments.slice(4)
  if (subpathSegments.length === 0 || subpathSegments.some((segment) => !SAFE_PATH_SEGMENT_PATTERN.test(segment))) {
    return undefined
  }
  return { repository, subpath: `/${subpathSegments.join('/')}`, url }
}

function displayName(name) {
  const compoundLeaf = name.split('#').at(-1)?.split('/').filter(Boolean).at(-1)
  return boundedString(compoundLeaf, MAX_NAME_LENGTH) ?? name
}

function description(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({})
  const result = {}
  const zh = boundedString(value.zh, MAX_DESCRIPTION_LENGTH)
  const en = boundedString(value.en, MAX_DESCRIPTION_LENGTH)
  if (zh !== undefined) result.zh = zh
  if (en !== undefined) result.en = en
  return Object.freeze(result)
}

function opaqueId(entry) {
  return createHash('sha256')
    .update(`${entry.name}\0${entry.npm ?? ''}\0${entry.url ?? ''}`)
    .digest('base64url')
    .slice(0, 20)
}

function projectPlugin(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const name = boundedString(value.name, MAX_NAME_LENGTH)
  if (name === undefined) return undefined

  const npm = boundedString(value.npm, MAX_NAME_LENGTH)
  if (RETIRED_MARKET_PACKAGES.has(name.toLowerCase()) || RETIRED_MARKET_PACKAGES.has(npm?.toLowerCase())) {
    return undefined
  }
  const github = parseGithubRepository(value.url)
  let sourceKind
  let installSpec
  if (npm !== undefined && NPM_NAME_PATTERN.test(npm)) {
    sourceKind = 'npm'
    installSpec = npm
  } else if (github !== undefined) {
    sourceKind = 'github'
    installSpec = `github:${github.repository}${github.subpath === undefined ? '' : `#path:${github.subpath}`}`
  } else {
    return undefined
  }

  const categoryValue = boundedString(value.category, MAX_CATEGORY_LENGTH)
  const category = categoryValue !== undefined && CATEGORY_PATTERN.test(categoryValue)
    ? categoryValue
    : 'other'
  const owner = boundedString(value.owner, MAX_OWNER_LENGTH)
  const added = boundedString(value.added, 32)
  const replacement = boundedString(value.replacement, MAX_NAME_LENGTH)
  const entry = {
    name,
    npm: npm !== undefined && NPM_NAME_PATTERN.test(npm) ? npm : undefined,
    url: github?.url,
  }

  return Object.freeze({
    id: opaqueId(entry),
    name,
    displayName: displayName(name),
    owner,
    repository: github?.repository,
    npm: entry.npm,
    category,
    description: description(value.description),
    stars: boundedInteger(value.stars),
    downloads: boundedInteger(value.downloads),
    added,
    deprecated: value.deprecated === true,
    replacement,
    sourceKind,
    installSpec,
  })
}

function categoryLabel(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({})
  const result = {}
  const zh = boundedString(value.zh, MAX_CATEGORY_LENGTH)
  const en = boundedString(value.en, MAX_CATEGORY_LENGTH)
  if (zh !== undefined) result.zh = zh
  if (en !== undefined) result.en = en
  return Object.freeze(result)
}

function projectCatalog(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.plugins)) {
    throw new TypeError('community market catalog shape is invalid')
  }

  const plugins = []
  const installById = new Map()
  for (const candidate of value.plugins.slice(0, MAX_PLUGINS)) {
    const plugin = projectPlugin(candidate)
    if (plugin === undefined || installById.has(plugin.id)) continue
    plugins.push(plugin)
    installById.set(plugin.id, plugin.installSpec)
  }
  if (plugins.length === 0) throw new TypeError('community market catalog contains no installable plugins')

  const categorySource = value.categories !== null && typeof value.categories === 'object' && !Array.isArray(value.categories)
    ? value.categories
    : {}
  const categoryIds = new Set(plugins.map((plugin) => plugin.category))
  const categories = [...categoryIds]
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((id) => Object.freeze({ id, label: categoryLabel(categorySource[id]) }))

  const publicCatalog = Object.freeze({
    updated: boundedString(value.updated, 32),
    count: plugins.length,
    categories: Object.freeze(categories),
    plugins: Object.freeze(plugins),
  })
  return { publicCatalog, installById }
}

function responseHeader(response, name) {
  const value = response.headers?.get?.(name)
  return boundedString(value, 512)
}

function catalogUnavailable(error) {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`community market catalog unavailable: ${message}`)
}

export function createCommunityMarketService({
  fetch: fetchImpl = globalThis.fetch,
  catalogUrl = COMMUNITY_MARKET_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('community market fetch implementation is required')
  if (catalogUrl !== COMMUNITY_MARKET_URL) throw new TypeError('community market URL is fixed')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('community market timeout is invalid')
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('community market size limit is invalid')

  let served

  async function list() {
    const headers = { accept: 'application/json' }
    if (served?.etag !== undefined) headers['if-none-match'] = served.etag
    else if (served?.lastModified !== undefined) headers['if-modified-since'] = served.lastModified

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    let response
    try {
      response = await fetchImpl(catalogUrl, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: controller.signal,
      })
    } catch (error) {
      throw catalogUnavailable(error)
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 304) {
      if (served === undefined) throw new Error('community market catalog returned 304 without cached data')
      return served.publicCatalog
    }
    if (!response.ok) throw new Error(`community market catalog request failed with HTTP ${response.status}`)

    const announcedLength = Number(responseHeader(response, 'content-length'))
    if (Number.isFinite(announcedLength) && announcedLength > maxBytes) {
      throw new Error('community market catalog response is too large')
    }

    let bytes
    try {
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      throw catalogUnavailable(error)
    }
    if (bytes.byteLength > maxBytes) throw new Error('community market catalog response is too large')

    let parsed
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new TypeError('community market catalog JSON is invalid')
    }

    const projected = projectCatalog(parsed)
    served = {
      ...projected,
      etag: responseHeader(response, 'etag'),
      lastModified: responseHeader(response, 'last-modified'),
    }
    return served.publicCatalog
  }

  async function resolveInstall(id) {
    if (typeof id !== 'string' || !OPAQUE_ID_PATTERN.test(id)) {
      throw new TypeError('invalid community market plugin identifier')
    }
    if (served === undefined) await list()
    const installSpec = served.installById.get(id)
    if (installSpec === undefined) throw new TypeError('invalid community market plugin identifier')
    return installSpec
  }

  return Object.freeze({ list, resolveInstall })
}
