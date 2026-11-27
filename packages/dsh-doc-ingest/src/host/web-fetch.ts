import { lookup as resolveAddresses } from 'node:dns/promises'
import { request as requestHttp, type IncomingMessage } from 'node:http'
import { request as requestHttps } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import { checkServerIdentity, connect as connectTls } from 'node:tls'
import type { Duplex } from 'node:stream'
import ipaddr from 'ipaddr.js'
import { MAX_PARSE_MS, MAX_WEB_BYTES } from '../core/types.ts'

interface Address {
  address: string
  family: number
}

export interface PublicTarget {
  url: URL
  hostname: string
  address: string
}

type Resolve = (hostname: string) => Promise<Address[]>
type RequestPage = (target: PublicTarget, signal: AbortSignal) => Promise<Response>

const resolveAll: Resolve = hostname => resolveAddresses(hostname, { all: true, verbatim: true })
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 5

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/gu, '')
}

export function parsePublicUrl(input: string): URL {
  if (input.length > 4096) throw new Error('The webpage URL is too long.')
  const url = new URL(input)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only public HTTP and HTTPS URLs without credentials are supported.')
  }
  if (!url.hostname || /(?:^|\.)(?:localhost|local|internal|home\.arpa)\.?$/iu.test(url.hostname)) {
    throw new Error('The target must be a public webpage.')
  }
  url.hash = ''
  return url
}

function isPublicAddress(address: string): boolean {
  if (!isIP(address)) return false
  const ip = ipaddr.process(address)
  if (ip.range() !== 'unicast') return false
  // Routing interfaces and transition mechanisms outside IANA global unicast
  // still do not qualify even when a library has no narrower range label.
  if (ip instanceof ipaddr.IPv6) return ip.match(ipaddr.IPv6.parse('2000::'), 3)
  return ip.octets[0] !== 0 && ip.octets[0] < 224
}

function untilAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export async function authorizePublicUrl(input: string, lookup = resolveAll, signal?: AbortSignal): Promise<PublicTarget> {
  signal?.throwIfAborted()
  const url = parsePublicUrl(input)
  const hostname = hostnameOf(url)
  const family = isIP(hostname)
  const addresses = family ? [{ address: hostname, family }] : await untilAbort(lookup(hostname), signal)
  if (addresses.length === 0 || addresses.some(record => !isPublicAddress(record.address))) {
    throw new Error('The webpage must resolve only to public IP addresses.')
  }
  return { url, hostname, address: addresses[0].address }
}

function defaultPort(url: URL): string {
  return url.port || (url.protocol === 'https:' ? '443' : '80')
}

function bypassProxy(target: PublicTarget, rules: string): boolean {
  const hostname = target.hostname.toLowerCase().replace(/\.$/u, '')
  return rules.split(/[;,\s]+/u).some(raw => {
    if (raw === '*') return true
    if (!raw) return false
    const match = /^(\[.+\]|[^:]+)(?::(\d+))?$/u.exec(raw)
    const rule = (match?.[1] ?? raw).toLowerCase().replace(/^\[|\]$/gu, '')
    if (match?.[2] && match[2] !== defaultPort(target.url)) return false
    if (rule === '<local>') return !hostname.includes('.') && !isIP(hostname)
    const suffix = rule.replace(/^\*\.|^\./u, '')
    if (hostname === suffix) return true
    return (rule.startsWith('.') || rule.startsWith('*.')) && hostname.endsWith(`.${suffix}`)
  })
}

function proxyFor(target: PublicTarget, env = process.env): URL | undefined {
  if (bypassProxy(target, env.NO_PROXY || env.no_proxy || '')) return
  const plain = env.HTTP_PROXY || env.http_proxy
  const secure = env.HTTPS_PROXY || env.https_proxy
  const fallback = env.ALL_PROXY || env.all_proxy
  const configured = target.url.protocol === 'https:' ? secure || plain || fallback : plain || fallback
  if (!configured) return
  const proxy = URL.parse(configured.includes('://') ? configured : `http://${configured}`)
  if (!proxy || !['http:', 'https:'].includes(proxy.protocol) || proxy.pathname !== '/' || proxy.search || proxy.hash) {
    throw new Error('The desktop proxy cannot open a validated webpage connection.')
  }
  return proxy
}

function establishTunnel(proxy: URL, target: PublicTarget, signal: AbortSignal): Promise<Duplex> {
  const endpoint = `${isIP(target.address) === 6 ? `[${target.address}]` : target.address}:${defaultPort(target.url)}`
  const headers: Record<string, string> = { host: endpoint }
  if (proxy.username || proxy.password) {
    try {
      const username = decodeURIComponent(proxy.username)
      const password = decodeURIComponent(proxy.password)
      headers['proxy-authorization'] = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
    } catch {
      throw new Error('The desktop proxy credentials are invalid.')
    }
  }
  const request = proxy.protocol === 'https:' ? requestHttps : requestHttp
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: proxy.protocol,
      hostname: hostnameOf(proxy),
      port: defaultPort(proxy),
      method: 'CONNECT',
      path: endpoint,
      headers,
      signal,
      agent: false,
    })
    req.once('error', reject)
    req.once('connect', (res, socket, head) => {
      if (res.statusCode !== 200 || head.byteLength) {
        socket.destroy()
        reject(new Error('The desktop proxy rejected the validated webpage connection.'))
        return
      }
      resolve(socket)
    })
    req.once('response', res => {
      res.destroy()
      reject(new Error('The desktop proxy did not open a webpage tunnel.'))
    })
    req.end()
  })
}

function signalSocket(socket: Duplex, signal: AbortSignal): void {
  const abort = (): void => { socket.destroy() }
  signal.addEventListener('abort', abort, { once: true })
  socket.once('close', () => signal.removeEventListener('abort', abort))
  if (signal.aborted) abort()
}

async function requestPublicPage(target: PublicTarget, signal: AbortSignal): Promise<Response> {
  const proxy = proxyFor(target)
  const tunnel = proxy ? await establishTunnel(proxy, target, signal) : undefined
  if (tunnel) signalSocket(tunnel, signal)
  const secure = target.url.protocol === 'https:'
  const servername = isIP(target.hostname) ? undefined : target.hostname
  // The request is created on the validated IP, while TLS identity and HTTP
  // routing stay bound to the original hostname.
  const headers = {
    host: target.url.host,
    'accept': 'text/html,application/xhtml+xml;q=0.9',
    'accept-encoding': 'identity',
    'user-agent': 'DeepSeek-Harness-Desktop/DocumentReader',
    connection: 'close',
  }
  let response: IncomingMessage
  try {
    response = await new Promise((resolve, reject) => {
      const socket = tunnel && secure ? connectTls({
        socket: tunnel,
        host: target.hostname,
        servername,
        rejectUnauthorized: true,
        checkServerIdentity: (_, certificate) => checkServerIdentity(target.hostname, certificate),
      }) : tunnel
      signal.throwIfAborted()
      const request = socket ? requestHttp : secure ? requestHttps : requestHttp
      const req = request({
        hostname: target.address,
        port: defaultPort(target.url),
        path: `${target.url.pathname}${target.url.search}`,
        method: 'GET',
        headers,
        signal,
        maxHeaderSize: 16 * 1024,
        ...(socket ? { createConnection: () => socket } : {
          agent: false,
          servername,
          checkServerIdentity: (_: string, certificate: Parameters<typeof checkServerIdentity>[1]) =>
            checkServerIdentity(target.hostname, certificate),
        }),
      }, resolve)
      req.once('error', reject)
      req.end()
    })
  } catch (error) {
    tunnel?.destroy()
    throw error
  }

  const status = response.statusCode ?? 502
  if (status < 200 || status >= 600) {
    response.destroy()
    throw new Error('The webpage returned an invalid response.')
  }
  const resultHeaders = new Headers()
  for (const key of ['content-type', 'content-length', 'content-encoding', 'location']) {
    const value = response.headers[key]
    if (typeof value === 'string') resultHeaders.set(key, value)
  }
  if (REDIRECT_STATUS.has(status) || status < 200 || status >= 300 || status === 204 || status === 205) {
    response.destroy()
    return new Response(null, { status, headers: resultHeaders })
  }
  const stream = Readable.toWeb(response) as ReadableStream<Uint8Array>
  return new Response(stream, { status, headers: resultHeaders })
}

async function readHtml(response: Response, signal: AbortSignal): Promise<string> {
  const type = response.headers.get('content-type') ?? ''
  if (!/^(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/iu.test(type)) throw new Error('The URL did not return HTML.')
  if (Number(response.headers.get('content-length')) > MAX_WEB_BYTES) throw new Error('Webpage exceeds the 8 MiB size limit.')
  const encoding = response.headers.get('content-encoding')
  if (encoding && encoding.toLowerCase() !== 'identity') throw new Error('The webpage did not honor uncompressed transfer.')
  if (!response.body) throw new Error('The webpage has no response body.')

  const match = /(?:^|;)\s*charset\s*=\s*["']?([\w-]+)/iu.exec(type)
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(match?.[1] ?? 'utf-8')
  } catch {
    decoder = new TextDecoder('utf-8')
  }
  const reader = response.body.getReader()
  let size = 0
  const parts: string[] = []
  try {
    while (true) {
      signal.throwIfAborted()
      const chunk = await untilAbort(reader.read(), signal)
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_WEB_BYTES) throw new Error('Webpage exceeds the 8 MiB size limit.')
      parts.push(decoder.decode(chunk.value, { stream: true }))
    }
    parts.push(decoder.decode())
    return parts.join('')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function fetchPublicHtml(
  input: string,
  options: { signal?: AbortSignal; lookup?: Resolve; request?: RequestPage } = {},
): Promise<{ html: string; url: string }> {
  if (process.env.DSH_DESKTOP_DOC_PROXY_UNAVAILABLE === '1') {
    throw new Error('The configured Desktop proxy mode cannot validate public webpage connections.')
  }
  const deadline = AbortSignal.timeout(MAX_PARSE_MS)
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline
  let next = input
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const target = await authorizePublicUrl(next, options.lookup, signal)
    const response = await (options.request ?? requestPublicPage)(target, signal)
    try {
      if (REDIRECT_STATUS.has(response.status)) {
        const redirect = response.headers.get('location')
        if (!redirect) throw new Error('The webpage redirect has no destination.')
        next = new URL(redirect, target.url).href
        continue
      }
      if (!response.ok) throw new Error(`The webpage returned HTTP ${response.status}.`)
      return { html: await readHtml(response, signal), url: target.url.href }
    } finally {
      await response.body?.cancel().catch(() => {})
    }
  }
  throw new Error('The webpage has too many redirects.')
}
