/**
 * The `api/gate` listener: application-level access control layered on top
 * of the transport fence (the fence is Host/Origin based and explicitly not
 * an authentication layer — packages/client/connection documents this
 * event as the sanctioned seam for pairing/revocation).
 *
 * Policy: loopback requests (the desktop) pass without a device identity;
 * every non-loopback /api request must carry a live, non-revoked device
 * cookie. This makes the QR the only way into a LAN-exposed dsh web and
 * gives "停止" real teeth: revoked devices 403 on their next request,
 * including the mux/SSE stream (which then dies on reconnect).
 */

import type { IncomingMessage } from 'node:http'
import type { PairingService } from './pairing.ts'
import { isSafePairingCookieName } from './pairing.ts'

/**
 * Whether a normalized URL hostname names the local loopback authority.
 * Semantics mirror the connection package's internal predicate (localhost,
 * IPv6 loopback, any IPv4 address in 127/8); it is reimplemented here because
 * the connection package no longer exports it — the fence now lives inside
 * the connection plugin, and external host plugins only need the
 * classification, not the whole trust decision.
 * @param hostname - WHATWG URL hostname (IPv6 literals retain brackets).
 * @returns true for localhost, IPv6 loopback, or any IPv4 address in 127/8.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Whether a socket remote address names the loopback range (127/8, ::1, IPv4-mapped). */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isIPv4Loopback(normalized.slice('::ffff:'.length))
  return isIPv4Loopback(normalized)
}

/** IPv4 127/8 predicate (four decimal octets, first == 127). */
function isIPv4Loopback(v4: string): boolean {
  const parts = v4.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Read one cookie value from a Cookie header.
 * @param header - the raw Cookie header value (or undefined).
 * @param name - the cookie name.
 * @returns the value, or undefined when absent.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!isSafePairingCookieName(name)) return undefined
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    if (key === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

/**
 * The effective Host hostname of a request.
 * @param request - node HTTP request.
 * @returns the normalized hostname, or undefined when unparsable.
 */
export function hostnameOf(request: IncomingMessage): string | undefined {
  const host = request.headers.host
  if (typeof host !== 'string') return undefined
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}

/** Whether a request comes from the desktop loopback client (loopback socket AND loopback Host). */
export function isLoopbackClient(request: IncomingMessage): boolean {
  const hostname = hostnameOf(request)
  if (hostname === undefined || !isLoopbackHostname(hostname)) return false
  const socket = request.socket as { remoteAddress?: string } | undefined
  return isLoopbackAddress(socket?.remoteAddress)
}

/** Full /api exposure policy. The default is deliberately resource-safe. */
export type RemoteApiMode = 'mobile-only' | 'legacy-full-api'

/** Live gate policy read by the listener on every request. */
export interface GateOptions {
  /** Whether non-loopback full /api is denied or kept in legacy mode. */
  remoteApiMode?: RemoteApiMode | (() => RemoteApiMode)
  /** Legacy pairing requirement, only meaningful in legacy-full-api mode. */
  requirePairingForLan?: boolean | (() => boolean)
  /** Master plugin switch. */
  enabled?: boolean | (() => boolean)
}

/**
 * Build the api/gate listener for one pairing service.
 * @param service - the pairing service.
 * @param options - the live gate policy. A function is re-read per request,
 * so a settings edit takes effect without a restart. Unknown modes fail closed.
 * @returns the cordis waterfall listener: call `next()` to delegate,
 * return false (without calling it) to veto with 403.
 */
export function makeGateListener(
  service: PairingService,
  optionsOrRequirePairing: GateOptions | boolean | (() => boolean) = {},
  legacyEnabled: boolean | (() => boolean) = true,
): (request: IncomingMessage, method: string | undefined, next: () => boolean | Promise<boolean>) => boolean | Promise<boolean> {
  // Keep the old positional form as an explicit legacy-full-api escape hatch
  // for existing profile tests and callers. New callers must use GateOptions.
  const options: GateOptions = typeof optionsOrRequirePairing === 'object'
    ? optionsOrRequirePairing
    : {
        remoteApiMode: 'legacy-full-api',
        requirePairingForLan: optionsOrRequirePairing,
        enabled: legacyEnabled,
      }
  return (request, _method, next) => {
    if (isLoopbackClient(request)) return next()
    let active: boolean
    let mode: RemoteApiMode
    let require: boolean
    try {
      const enabled = options.enabled ?? true
      active = typeof enabled === 'function' ? enabled() : enabled
      const modeValue = options.remoteApiMode ?? 'mobile-only'
      mode = typeof modeValue === 'function' ? modeValue() : modeValue
      const pairingValue = options.requirePairingForLan ?? true
      require = typeof pairingValue === 'function' ? pairingValue() : pairingValue
    } catch {
      // A broken live settings source must never turn a remote request into a
      // pass-through. Loopback remains governed by the Host's own fence.
      return false
    }
    if (!active) return false
    if (mode !== 'legacy-full-api') return false
    if (!require) return next()
    const deviceId = readCookie(request.headers.cookie, service.config.cookieName)
    if (deviceId === undefined) return false
    return service.touchDevice(deviceId) ? next() : false
  }
}
