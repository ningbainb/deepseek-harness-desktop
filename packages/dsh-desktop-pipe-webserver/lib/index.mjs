import { randomBytes } from 'node:crypto'
import { Duplex, Readable, Writable } from 'node:stream'

import { Service } from '@deepseek-ai/cordis'
import { renderIndexInjections } from '@deepseek-ai/dsh-host-webserver'

const LOOPBACK_HOST = '127.0.0.1'

function routePath(value) {
  if (typeof value !== 'string' || value === '' || value[0] !== '/' || (value.length > 1 && value.endsWith('/')) || /[?#\0\r\n]/u.test(value)) {
    throw new TypeError('desktop pipe route path is invalid')
  }
  return value
}

function headersRecord(headers) {
  const out = Object.create(null)
  for (const [name, value] of headers.entries()) out[name.toLowerCase()] = value
  // Requests can only arrive after the Electron main process has authenticated
  // to the private pipe. Present that trusted local carrier to official Host
  // routes as the loopback HTTP authority they already validate.
  out.host = LOOPBACK_HOST
  out.origin = `http://${LOOPBACK_HOST}`
  out['sec-fetch-site'] = 'same-origin'
  return out
}

function nodeRequest(request) {
  const stream = request.body === null
    ? Readable.from([])
    : Readable.fromWeb(request.body)
  stream.method = request.method
  const url = new URL(request.url)
  stream.url = `${url.pathname}${url.search}`
  stream.headers = headersRecord(request.headers)
  stream.socket = { remoteAddress: LOOPBACK_HOST }
  // node:http owns an error listener for IncomingMessage. This carrier is a
  // plain Readable, so retain the same crash-safe baseline when cancellation
  // destroys a request before a route consumes it.
  stream.on('error', () => {})
  if (request.signal.aborted) stream.destroy(request.signal.reason instanceof Error ? request.signal.reason : undefined)
  else request.signal.addEventListener('abort', () => {
    stream.emit('aborted')
    stream.destroy(request.signal.reason instanceof Error ? request.signal.reason : undefined)
  }, { once: true })
  return stream
}

function outputQueue() {
  const values = []
  const waiters = []
  let ended = false
  let failure
  const settle = () => {
    while (waiters.length > 0 && (values.length > 0 || ended || failure !== undefined)) {
      const waiter = waiters.shift()
      if (values.length > 0) waiter.resolve({ done: false, value: values.shift() })
      else if (failure !== undefined) waiter.reject(failure)
      else waiter.resolve({ done: true, value: undefined })
    }
  }
  return {
    push(value) { values.push(value); settle() },
    end() { ended = true; settle() },
    fail(error) { failure = error; settle() },
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (values.length > 0) return Promise.resolve({ done: false, value: values.shift() })
            if (failure !== undefined) return Promise.reject(failure)
            if (ended) return Promise.resolve({ done: true, value: undefined })
            return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
          },
        }
      },
    },
  }
}

class CarrierDuplex extends Duplex {
  constructor(output) {
    super()
    this.output = output
    this.remoteAddress = LOOPBACK_HOST
  }

  _read() {}

  _write(chunk, _encoding, callback) {
    const bytes = Buffer.from(chunk)
    for (let offset = 0; offset < bytes.length; offset += 192 * 1024) {
      this.output.push(bytes.subarray(offset, offset + 192 * 1024).toString('base64'))
    }
    callback()
  }

  _final(callback) {
    this.output.end()
    callback()
  }

  _destroy(error, callback) {
    if (error) this.output.fail(error)
    else this.output.end()
    callback(error)
  }

  setTimeout() { return this }
  setNoDelay() { return this }
  setKeepAlive() { return this }
}

class FetchResponseBridge extends Writable {
  #headers = new Headers()
  #writer
  #readable
  #transformController
  #resolve
  #settled = false

  statusCode = 200
  statusMessage = undefined
  headersSent = false

  constructor(method) {
    super({ highWaterMark: 64 * 1024 })
    const transform = new TransformStream({ start: controller => { this.#transformController = controller } })
    this.#writer = transform.writable.getWriter()
    this.#readable = transform.readable
    this.response = new Promise(resolve => { this.#resolve = resolve })
    this.method = method
    this.on('error', () => {})
    void this.#writer.closed.catch(error => this.destroy(error))
  }

  setHeader(name, value) {
    if (this.destroyed) return this
    if (this.headersSent) throw new Error('headers already sent')
    this.#headers.set(name, Array.isArray(value) ? value.join(', ') : String(value))
    return this
  }

  getHeader(name) {
    return this.#headers.get(name) ?? undefined
  }

  hasHeader(name) {
    return this.#headers.has(name)
  }

  removeHeader(name) {
    if (this.destroyed) return
    if (this.headersSent) throw new Error('headers already sent')
    this.#headers.delete(name)
  }

  writeHead(statusCode, statusMessageOrHeaders, maybeHeaders) {
    if (this.destroyed) return this
    this.statusCode = statusCode
    const headers = typeof statusMessageOrHeaders === 'string' ? maybeHeaders : statusMessageOrHeaders
    if (typeof statusMessageOrHeaders === 'string') this.statusMessage = statusMessageOrHeaders
    if (headers !== undefined) {
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value)
    }
    this.flushHeaders()
    return this
  }

  flushHeaders() {
    if (this.headersSent) return
    this.headersSent = true
    this.#settled = true
    const body = this.method === 'HEAD' || this.statusCode === 204 || this.statusCode === 304
      ? null
      : this.#readable
    this.#resolve(new Response(body, { status: this.statusCode, headers: this.#headers }))
  }

  write(chunk, encoding, callback) {
    if (this.destroyed || this.writableEnded) return false
    this.flushHeaders()
    return super.write(chunk, encoding, callback)
  }

  _write(chunk, _encoding, callback) {
    if (this.method === 'HEAD' || this.statusCode === 204 || this.statusCode === 304) {
      callback()
      return
    }
    void this.#writer.write(chunk).then(() => callback(), callback)
  }

  end(chunk, encoding, callback) {
    if (this.destroyed || this.writableEnded) return this
    this.flushHeaders()
    return super.end(chunk, encoding, callback)
  }

  _final(callback) {
    void this.#writer.close().then(() => callback(), callback)
  }

  _destroy(error, callback) {
    if (!this.#settled) {
      this.statusCode = 500
      this.flushHeaders()
    }
    if (!this.writableFinished) this.#transformController.error(error ?? new Error('desktop pipe response closed'))
    void this.#writer.abort(error).catch(() => {})
    callback(error)
  }
}

function safeLogError(ctx, error) {
  ctx.logger.warn(error instanceof Error ? new Error(`desktop pipe route failed: ${error.name}`) : new Error('desktop pipe route failed'))
}

export class DesktopPipeWebServer extends Service {
  exact = new Map()
  prefixes = new Map()
  upgrades = new Map()
  indexTaps = []
  fallback

  constructor(ctx) {
    super(ctx, 'webServer')
  }

  get host() {
    return LOOPBACK_HOST
  }

  get port() {
    return 0
  }

  register(route) {
    if (route?.kind !== 'exact' && route?.kind !== 'prefix') throw new TypeError('desktop pipe route kind is invalid')
    if (typeof route.handler !== 'function') throw new TypeError('desktop pipe route handler is invalid')
    const path = routePath(route.path)
    const table = route.kind === 'exact' ? this.exact : this.prefixes
    if (table.has(path)) throw new Error(`desktop pipe: duplicate ${route.kind} route ${JSON.stringify(path)}`)
    table.set(path, { ...route, path })
    return () => { table.delete(path) }
  }

  registerUpgrade(route) {
    const path = routePath(route?.path)
    if (typeof route.handler !== 'function') throw new TypeError('desktop pipe upgrade handler is invalid')
    if (this.upgrades.has(path)) throw new Error(`desktop pipe: duplicate upgrade route ${JSON.stringify(path)}`)
    this.upgrades.set(path, { ...route, path })
    return () => { this.upgrades.delete(path) }
  }

  registerFallback(handler) {
    if (typeof handler !== 'function') throw new TypeError('desktop pipe fallback is invalid')
    if (this.fallback !== undefined) throw new Error('desktop pipe: fallback already registered')
    this.fallback = handler
    return () => { this.fallback = undefined }
  }

  tapIndex(transform) {
    if (typeof transform !== 'function') throw new TypeError('desktop pipe index transform is invalid')
    this.indexTaps.push(transform)
    return () => {
      const at = this.indexTaps.indexOf(transform)
      if (at !== -1) this.indexTaps.splice(at, 1)
    }
  }

  collectIndexInjections() {
    const table = []
    this.ctx.emit('webserver/index-inject', table)
    return table
  }

  applyIndexTaps(html) {
    let output = html
    for (const transform of this.indexTaps) output = transform(output)
    return output
  }

  renderIndex(html) {
    return this.applyIndexTaps(renderIndexInjections(html, this.collectIndexInjections()))
  }

  match(pathname) {
    const exact = this.exact.get(pathname)
    if (exact !== undefined) return exact
    let best
    for (const [prefix, route] of this.prefixes) {
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
      if (best === undefined || prefix.length > best.path.length) best = route
    }
    return best
  }

  upgrade(pathname) {
    return this.upgrades.get(pathname)
  }

  async fetch(request) {
    const pathname = new URL(request.url).pathname
    const route = this.match(pathname)
    const handler = route?.handler ?? this.fallback
    if (handler === undefined) return new Response('not found', { status: 404 })
    const req = nodeRequest(request)
    const res = new FetchResponseBridge(request.method)
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(error => {
        safeLogError(this.ctx, error)
        if (res.headersSent) res.destroy(error instanceof Error ? error : undefined)
        else {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('request failed')
        }
      })
    request.signal.addEventListener('abort', () => res.destroy(request.signal.reason instanceof Error ? request.signal.reason : undefined), { once: true })
    return res.response
  }

  async authorizeIndex(request) {
    if (this.ctx.get('connection') === undefined || typeof this.ctx.connection.authorizeIndex !== 'function') {
      throw new Error('desktop pipe index authorization requires Connection')
    }
    const req = nodeRequest(request)
    const res = new FetchResponseBridge(request.method)
    const authorized = this.ctx.connection.authorizeIndex(req, res)
    if (authorized) return undefined
    return res.response
  }

  openDuplex(endpoint, payload, input, signal, browserCookie) {
    if (endpoint !== 'websocket' || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new TypeError('desktop pipe duplex request is invalid')
    }
    if (typeof payload.url !== 'string' || payload.url.length === 0 || payload.url.length > 4_096) {
      throw new TypeError('desktop pipe WebSocket URL is invalid')
    }
    const url = new URL(payload.url, `http://${LOOPBACK_HOST}`)
    if (url.origin !== `http://${LOOPBACK_HOST}`) throw new TypeError('desktop pipe WebSocket authority is invalid')
    const route = this.upgrade(url.pathname)
    if (route === undefined) throw new Error('desktop pipe WebSocket route is unavailable')
    if (browserCookie !== undefined && (typeof browserCookie !== 'string' || browserCookie.length === 0
      || browserCookie.length > 4096 || /[\r\n]/u.test(browserCookie))) {
      throw new TypeError('desktop pipe WebSocket browser cookie is invalid')
    }
    const protocols = Array.isArray(payload.protocols)
      ? payload.protocols.filter(value => typeof value === 'string' && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(value)).slice(0, 8)
      : []
    const output = outputQueue()
    const socket = new CarrierDuplex(output)
    const headers = {
      host: LOOPBACK_HOST,
      origin: `http://${LOOPBACK_HOST}`,
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-fetch-site': 'same-origin',
      'sec-websocket-key': randomBytes(16).toString('base64'),
      'sec-websocket-version': '13',
      ...(browserCookie === undefined ? {} : { cookie: browserCookie }),
      ...(protocols.length === 0 ? {} : { 'sec-websocket-protocol': protocols.join(', ') }),
    }
    const req = Readable.from([])
    req.method = 'GET'
    req.url = `${url.pathname}${url.search}`
    req.headers = headers
    req.rawHeaders = Object.entries(headers).flatMap(([name, value]) => [name, value])
    req.httpVersion = '1.1'
    req.httpVersionMajor = 1
    req.httpVersionMinor = 1
    req.socket = socket
    const stop = () => socket.destroy(signal.reason instanceof Error ? signal.reason : undefined)
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
    Promise.resolve(route.handler(req, socket, Buffer.alloc(0))).catch(error => socket.destroy(error instanceof Error ? error : undefined))
    void (async () => {
      try {
        for await (const value of input) {
          if (typeof value !== 'string' || value.length > 700_000) throw new Error('desktop pipe WebSocket frame is invalid')
          socket.push(Buffer.from(value, 'base64'))
        }
        socket.push(null)
      } catch (error) {
        socket.destroy(error instanceof Error ? error : undefined)
      }
    })()
    return output.iterable
  }
}

class DesktopPipeWebRuntime extends Service {
  trustedHosts = []

  constructor(ctx) {
    super(ctx, 'webRuntime')
  }
}

export const name = 'desktop-pipe-webserver'
export const inject = []

export function apply(ctx) {
  new DesktopPipeWebServer(ctx)
  new DesktopPipeWebRuntime(ctx)
  ctx.provide('webApp', { getAdvertisedUrl: () => 'dsh-runtime://app/' })
}
