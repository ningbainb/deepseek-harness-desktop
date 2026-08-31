import { isAbsolute, normalize } from 'node:path'

const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u
const FIXED_ROUTES = new Map([
  ['extensions', 'extensions'],
  ['updates', 'updates'],
])
const ID_ROUTES = new Map([
  ['task', 'task'],
  ['session', 'session'],
  ['run', 'run'],
])

export function normalizeDeepLink(value, protocol = 'dsh') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) {
    throw new TypeError('deep link is empty or too long')
  }
  if (/(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/iu.test(value)) {
    throw new TypeError('deep link path traversal is not allowed')
  }
  let url
  try {
    url = new URL(value)
  } catch (error) {
    throw new TypeError('deep link is not a valid URL', { cause: error })
  }
  if (url.protocol !== `${protocol}:` || url.username || url.password || url.port || url.hash || url.search) {
    throw new TypeError('deep link contains an unsupported scheme, credential, port, fragment, or query')
  }
  const host = url.hostname.toLowerCase()
  const fixed = FIXED_ROUTES.get(host)
  if (fixed !== undefined && (url.pathname === '' || url.pathname === '/')) {
    return Object.freeze({ kind: fixed, href: `${protocol}://${host}` })
  }
  if (host === 'preset' && url.pathname === '/preview') {
    return Object.freeze({ kind: 'preset-preview', href: `${protocol}://preset/preview` })
  }
  const idKind = ID_ROUTES.get(host)
  if (idKind !== undefined) {
    const rawId = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
    if (!SAFE_ID_PATTERN.test(rawId)) throw new TypeError(`deep link ${idKind} identifier is invalid`)
    return Object.freeze({ kind: idKind, id: rawId, href: `${protocol}://${host}/${rawId}` })
  }
  throw new TypeError('deep link route is not allowlisted')
}

export function presetFileFrom(commandLine = []) {
  for (const value of commandLine) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 32_767 || value.includes('\0')) continue
    if (!/\.dshpreset$/iu.test(value) || !isAbsolute(value)) continue
    return normalize(value)
  }
  return undefined
}

export class DeepLinkRouter {
  constructor({ dispatch, protocol = 'dsh', maxPending = 32, maxLifetimeLinks = 256 } = {}) {
    if (typeof dispatch !== 'function') throw new TypeError('deep link router requires dispatch')
    this.dispatch = dispatch
    this.protocol = protocol
    this.maxPending = maxPending
    this.maxLifetimeLinks = maxLifetimeLinks
    this.ready = false
    this.pending = []
    this.seen = new Set()
    this.queue = Promise.resolve()
  }

  enqueue(value) {
    let link
    try {
      link = normalizeDeepLink(value, this.protocol)
    } catch {
      return Object.freeze({ accepted: false, reason: 'invalid' })
    }
    if (this.seen.has(link.href)) return Object.freeze({ accepted: false, reason: 'duplicate' })
    if (this.seen.size >= this.maxLifetimeLinks) return Object.freeze({ accepted: false, reason: 'limit' })
    if (!this.ready && this.pending.length >= this.maxPending) return Object.freeze({ accepted: false, reason: 'queue-full' })
    this.seen.add(link.href)
    if (!this.ready) {
      this.pending.push(link)
      return Object.freeze({ accepted: true, queued: true, link })
    }
    this.#dispatch(link)
    return Object.freeze({ accepted: true, queued: false, link })
  }

  #dispatch(link) {
    const operation = this.queue.then(() => this.dispatch(link), () => this.dispatch(link))
    this.queue = operation.catch(() => {})
  }

  /**
   * Dispatch an already-validated main-process route without ingress dedupe.
   * Import completion can happen while the renderer is still mounting its
   * listeners, so callers may opt into the same readiness queue used by
   * command-line/deep-link ingress.
   */
  dispatchValidated(value, { queueUntilReady = false } = {}) {
    if (value === null || typeof value !== 'object' || typeof value.href !== 'string') {
      throw new TypeError('validated deep link is invalid')
    }
    const link = normalizeDeepLink(value.href, this.protocol)
    if (queueUntilReady && !this.ready) {
      if (this.pending.length >= this.maxPending) throw new Error('deep link queue is full')
      this.pending.push(link)
      return link
    }
    this.#dispatch(link)
    return link
  }

  setReady(ready) {
    if (typeof ready !== 'boolean') throw new TypeError('deep link readiness must be a boolean')
    this.ready = ready
    if (!ready) return 0
    const links = this.pending.splice(0)
    for (const link of links) this.#dispatch(link)
    return links.length
  }

  async idle() {
    await this.queue
  }
}
