import { writeFileAtomic } from './atomic-write-adapter.mjs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readFile } from 'node:fs/promises'

export const DESKTOP_LAN_GATEWAY_BASE_ENV = 'DSH_DESKTOP_LAN_GATEWAY_BASE'
export const DEFAULT_DESKTOP_LAN_GATEWAY_PORT = 43126
export const DESKTOP_LAN_GATEWAY_STATES = Object.freeze(['stopped', 'starting', 'running', 'error'])

const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const MAX_ACTIVE_REQUESTS = 32
const REQUESTS_PER_MINUTE = 240
const PAIR_ACCEPTS_PER_MINUTE = 20
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
const REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'cache-control',
  'content-type',
  'cookie',
  'host',
  'last-event-id',
  'origin',
  'pragma',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'user-agent',
])

const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: 1,
  enabled: false,
  port: DEFAULT_DESKTOP_LAN_GATEWAY_PORT,
})

function parseIpv4(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value)) return undefined
  const parts = value.split('.').map(Number)
  if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return undefined
  if (parts.join('.') !== value) return undefined
  return parts
}

/** Only private/link-local IPv4 interfaces are eligible for the local gateway. */
export function isPrivateLanIpv4(value) {
  const parts = parseIpv4(value)
  if (parts === undefined) return false
  const [a, b] = parts
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
}

/** Return stable, duplicate-free local IPv4 candidates in interface order. */
export function desktopLanAddresses(interfaces = networkInterfaces()) {
  const seen = new Set()
  const addresses = []
  for (const rows of Object.values(interfaces)) {
    for (const row of rows ?? []) {
      if (row?.internal || row?.family !== 'IPv4' || !isPrivateLanIpv4(row.address) || seen.has(row.address)) continue
      seen.add(row.address)
      addresses.push(row.address)
    }
  }
  return Object.freeze(addresses)
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65_535
}

/** Validate one explicit renderer/store configuration. */
export function normalizeDesktopLanGatewayConfig(input, {
  availableAddresses,
  requireAvailable = false,
} = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('LAN gateway configuration must be an object')
  }
  if (typeof input.enabled !== 'boolean') throw new TypeError('LAN gateway enabled must be a boolean')
  const port = input.port === undefined ? DEFAULT_DESKTOP_LAN_GATEWAY_PORT : Number(input.port)
  if (!validPort(port)) throw new TypeError('LAN gateway port must be an integer from 1024 to 65535')
  const candidates = availableAddresses ?? desktopLanAddresses()
  let address = typeof input.address === 'string' && input.address.trim().length > 0
    ? input.address.trim()
    : undefined
  if (address !== undefined && !isPrivateLanIpv4(address)) {
    throw new TypeError('LAN gateway address must be a private IPv4 literal')
  }
  if (input.enabled && address === undefined) address = candidates[0]
  if (input.enabled && address === undefined) throw new TypeError('no private LAN address is available')
  if (requireAvailable && address !== undefined && !candidates.includes(address)) {
    throw new TypeError('LAN gateway address is not active on this computer')
  }
  return Object.freeze({
    schemaVersion: 1,
    enabled: input.enabled,
    ...(address === undefined ? {} : { address }),
    port,
  })
}

export function desktopLanGatewayBaseUrl(config, { availableAddresses } = {}) {
  try {
    const normalized = normalizeDesktopLanGatewayConfig(config, {
      availableAddresses,
      requireAvailable: true,
    })
    return normalized.enabled ? `http://${normalized.address}:${String(normalized.port)}` : undefined
  } catch {
    return undefined
  }
}

export function validateDesktopLanGatewayBaseUrl(value, { availableAddresses, requireAvailable = true } = {}) {
  if (value === undefined || value === '') return undefined
  let url
  try { url = new URL(value) } catch { throw new TypeError('LAN gateway base URL is invalid') }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.port) {
    throw new TypeError('LAN gateway base URL must be an HTTP private IPv4 origin')
  }
  const address = url.hostname
  const port = Number(url.port)
  if (!isPrivateLanIpv4(address) || !validPort(port)) {
    throw new TypeError('LAN gateway base URL must use a private IPv4 address and high port')
  }
  const candidates = availableAddresses ?? desktopLanAddresses()
  if (requireAvailable && !candidates.includes(address)) throw new TypeError('LAN gateway base URL address is not active')
  return `http://${address}:${String(port)}`
}

/** Desktop-owned, atomic local gateway preference store. */
export class DesktopLanGatewayStore {
  constructor(path) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('LAN gateway state path is required')
    this.path = path
    this.writeQueue = Promise.resolve()
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'))
      return normalizeDesktopLanGatewayConfig(parsed)
    } catch {
      return DEFAULT_CONFIG
    }
  }

  save(input) {
    const config = normalizeDesktopLanGatewayConfig(input)
    const operation = this.writeQueue.then(() => writeFileAtomic(
      this.path,
      `${JSON.stringify(config, null, 2)}\n`,
      { mode: 0o600 },
    ))
    this.writeQueue = operation.catch(() => {})
    return operation.then(() => config)
  }
}

export function isDesktopLanGatewayRequestAllowed(method, pathname) {
  if ((method === 'GET' || method === 'HEAD') && (pathname === '/m' || pathname === '/m/mobile.js')) return true
  if (method === 'POST' && (pathname === '/api/pair/accept' || pathname === '/api/pair/heartbeat')) return true
  if (method === 'GET' && pathname === '/m/api/events.mux') return true
  return method === 'POST' && pathname.startsWith('/m/api/') && pathname !== '/m/api/events.mux'
}

function responseError(response, status, message) {
  if (response.headersSent || response.writableEnded) return
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(message)
}

async function readRequestBody(request, limit = MAX_REQUEST_BODY_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > limit) throw Object.assign(new RangeError('request body exceeded the limit'), { statusCode: 413 })
    chunks.push(value)
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks)
}

function requestHeaders(request, authority) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    const key = name.toLowerCase()
    if (!REQUEST_HEADER_ALLOWLIST.has(key) || HOP_BY_HOP_HEADERS.has(key) || value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }
  headers.set('host', authority)
  return headers
}

function copyResponseHeaders(source, response) {
  for (const [name, value] of source.headers) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) response.setHeader(name, value)
  }
  const cookies = source.headers.getSetCookie?.()
  if (Array.isArray(cookies) && cookies.length > 0) response.setHeader('set-cookie', cookies)
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
}

async function writeResponseBody(source, response, signal) {
  if (source.body === null) {
    response.end()
    return
  }
  const reader = source.body.getReader()
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done || signal.aborted || response.destroyed) break
      if (!response.write(Buffer.from(chunk.value))) {
        await new Promise((resolve, reject) => {
          const done = () => { cleanup(); resolve() }
          const failed = (error) => { cleanup(); reject(error) }
          const cleanup = () => {
            response.off('drain', done)
            response.off('error', failed)
          }
          response.once('drain', done)
          response.once('error', failed)
        })
      }
    }
    if (!response.destroyed && !response.writableEnded) response.end()
  } finally {
    if (signal.aborted) await reader.cancel(signal.reason).catch(() => {})
  }
}

function createRateLimiter({ now = Date.now } = {}) {
  const entries = new Map()
  return (key, limit) => {
    const timestamp = now()
    const current = entries.get(key)
    if (current === undefined || timestamp - current.startedAt >= 60_000) {
      entries.set(key, { startedAt: timestamp, count: 1 })
      return true
    }
    current.count += 1
    return current.count <= limit
  }
}

/** Create the strict HTTP-to-RuntimeProvider bridge used by the LAN listener. */
export function createDesktopLanGatewayHandler({ getProvider, authority, now } = {}) {
  if (typeof getProvider !== 'function') throw new TypeError('LAN gateway requires a Runtime provider getter')
  if (typeof authority !== 'string' || authority.length === 0) throw new TypeError('LAN gateway authority is required')
  const allowRate = createRateLimiter({ now })
  let active = 0
  return async (request, response) => {
    const method = String(request.method ?? 'GET').toUpperCase()
    let url
    try { url = new URL(request.url ?? '/', `http://${authority}`) } catch {
      responseError(response, 400, 'bad request')
      return
    }
    if (request.headers?.host !== authority) {
      responseError(response, 421, 'misdirected request')
      return
    }
    if (!isDesktopLanGatewayRequestAllowed(method, url.pathname)) {
      responseError(response, 404, 'not found')
      return
    }
    const origin = request.headers?.origin
    if (typeof origin === 'string' && origin !== `http://${authority}`) {
      responseError(response, 403, 'forbidden')
      return
    }
    const remoteAddress = String(request.socket?.remoteAddress ?? 'unknown')
    const rateKey = `${remoteAddress}:${url.pathname === '/api/pair/accept' ? 'pair' : 'request'}`
    const rateLimit = url.pathname === '/api/pair/accept' ? PAIR_ACCEPTS_PER_MINUTE : REQUESTS_PER_MINUTE
    if (!allowRate(rateKey, rateLimit)) {
      responseError(response, 429, 'too many requests')
      return
    }
    if (active >= MAX_ACTIVE_REQUESTS) {
      responseError(response, 503, 'gateway busy')
      return
    }
    const provider = getProvider()
    if (provider?.status?.state !== 'ready' || typeof provider.fetch !== 'function') {
      responseError(response, 503, 'runtime unavailable')
      return
    }
    active += 1
    const controller = new AbortController()
    const abort = () => {
      if (!response.writableEnded) controller.abort(new Error('LAN client disconnected'))
    }
    request.once('aborted', abort)
    response.once('close', abort)
    try {
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request)
      const forwarded = new Request(`http://${authority}${url.pathname}${url.search}`, {
        method,
        headers: requestHeaders(request, authority),
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      })
      const upstream = await provider.fetch(forwarded)
      response.statusCode = upstream.status
      response.statusMessage = upstream.statusText
      copyResponseHeaders(upstream, response)
      if (method === 'HEAD') response.end()
      else await writeResponseBody(upstream, response, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) responseError(response, error?.statusCode === 413 ? 413 : 502, error?.statusCode === 413 ? 'request too large' : 'gateway failure')
    } finally {
      request.off('aborted', abort)
      response.off('close', abort)
      active -= 1
    }
  }
}

function publicErrorCode(error) {
  if (error?.code === 'EADDRINUSE') return 'port-in-use'
  if (error?.code === 'EADDRNOTAVAIL') return 'address-unavailable'
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'permission-denied'
  return 'start-failed'
}

/** Lifecycle owner for the optional, exact-interface LAN listener. */
export class DesktopLanGateway {
  constructor({
    store,
    initialConfig = DEFAULT_CONFIG,
    getProvider,
    createHttpServer = handler => createServer(handler),
    interfacesProvider = networkInterfaces,
    log = async () => {},
    recordFeatureEvent = () => false,
  } = {}) {
    if (typeof store?.save !== 'function') throw new TypeError('LAN gateway store is required')
    if (typeof getProvider !== 'function') throw new TypeError('LAN gateway provider getter is required')
    this.store = store
    this.getProvider = getProvider
    this.createHttpServer = createHttpServer
    this.interfacesProvider = interfacesProvider
    this.log = log
    this.recordFeatureEvent = recordFeatureEvent
    this.config = normalizeDesktopLanGatewayConfig(initialConfig)
    this.phase = 'stopped'
    this.errorCode = undefined
    this.server = undefined
    this.sockets = new Set()
    this.listeners = new Set()
  }

  get availableAddresses() { return desktopLanAddresses(this.interfacesProvider()) }

  get baseUrl() {
    return desktopLanGatewayBaseUrl(this.config, { availableAddresses: this.availableAddresses })
  }

  get status() {
    const baseUrl = this.baseUrl
    return Object.freeze({
      state: this.phase,
      enabled: this.config.enabled,
      address: this.config.address,
      port: this.config.port,
      availableAddresses: [...this.availableAddresses],
      ...(this.phase === 'running' && baseUrl !== undefined ? { url: baseUrl } : {}),
      ...(this.errorCode === undefined ? {} : { errorCode: this.errorCode }),
    })
  }

  onStatus(listener) {
    if (typeof listener !== 'function') throw new TypeError('LAN gateway status listener must be a function')
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  #publish() {
    const status = this.status
    for (const listener of this.listeners) {
      try { listener(status) } catch {}
    }
  }

  async configure(input) {
    const detail = input?.enabled === true
      ? this.config.enabled ? 'reconfigure' : 'enable'
      : 'disable'
    try {
      const next = normalizeDesktopLanGatewayConfig(input, {
        availableAddresses: this.availableAddresses,
        requireAvailable: input?.enabled === true,
      })
      await this.stop()
      this.config = await this.store.save(next)
      if (this.config.enabled) await this.start()
      else this.#publish()
      const status = this.status
      const outcome = status.state === 'error' ? 'failed' : 'succeeded'
      try { this.recordFeatureEvent({ feature: 'local-lan', outcome, detail }) } catch {}
      return status
    } catch (error) {
      try { this.recordFeatureEvent({ feature: 'local-lan', outcome: 'failed', detail }) } catch {}
      throw error
    }
  }

  async start() {
    if (!this.config.enabled || this.server !== undefined) return this.status
    const baseUrl = this.baseUrl
    if (baseUrl === undefined) {
      this.phase = 'error'
      this.errorCode = this.config.address === undefined ? 'no-private-address' : 'address-unavailable'
      this.#publish()
      return this.status
    }
    const authority = new URL(baseUrl).host
    this.phase = 'starting'
    this.errorCode = undefined
    this.#publish()
    const server = this.createHttpServer(createDesktopLanGatewayHandler({ getProvider: this.getProvider, authority }))
    this.server = server
    server.maxConnections = MAX_ACTIVE_REQUESTS
    server.requestTimeout = 30_000
    server.headersTimeout = 10_000
    server.keepAliveTimeout = 5_000
    server.on('connection', socket => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
    })
    try {
      await new Promise((resolve, reject) => {
        const failed = (error) => { server.off('listening', ready); reject(error) }
        const ready = () => { server.off('error', failed); resolve() }
        server.once('error', failed)
        server.once('listening', ready)
        server.listen({ host: this.config.address, port: this.config.port, exclusive: true })
      })
      this.phase = 'running'
      this.#publish()
      await this.log(`[lan-gateway] listening address=${this.config.address} port=${this.config.port}`)
    } catch (error) {
      this.server = undefined
      this.phase = 'error'
      this.errorCode = publicErrorCode(error)
      this.#publish()
      await this.log(`[lan-gateway] start failed code=${this.errorCode}`)
    }
    return this.status
  }

  async stop() {
    const server = this.server
    this.server = undefined
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    if (server !== undefined) {
      server.closeAllConnections?.()
      await new Promise(resolve => server.close(() => resolve()))
    }
    this.phase = 'stopped'
    this.errorCode = undefined
    this.#publish()
    return this.status
  }

  async dispose() {
    await this.stop()
    this.listeners.clear()
  }
}
