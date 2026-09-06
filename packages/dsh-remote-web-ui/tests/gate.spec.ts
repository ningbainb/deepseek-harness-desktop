/** The api/gate policy: loopback passes; full remote /api is opt-in legacy mode. */
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { PairingService } from '../src/pairing.ts'
import { makeGateListener, readCookie } from '../src/gate.ts'

function request(headers: Record<string, string>, remoteAddress = '127.0.0.1'): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage
  Object.assign(req, { headers, socket: { remoteAddress } })
  return req
}

function makeService(cookieName = 'dsh_pair'): PairingService {
  const service = new PairingService({
    tokenTtlMs: 60_000,
    offlineAfterMs: 10_000,
    maxDevices: 4,
    cookieName,
  }, {
    now: () => 1_000_000,
    randomToken: () => 'tok-1',
  })
  service.setLanBases([{ address: '192.168.1.5', base: 'http://192.168.1.5:3080' }])
  return service
}

describe('makeGateListener', () => {
  it('passes loopback requests without a device identity', () => {
    const service = makeService()
    const gate = makeGateListener(service)
    let delegated = false
    const result = gate(request({ host: '127.0.0.1:3080' }), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(true)
    expect(delegated).toBe(true)
  })

  it('vetoes a spoofed loopback Host from a non-loopback remote address', () => {
    const service = makeService()
    const gate = makeGateListener(service)
    let delegated = false
    const result = gate(request({ host: '127.0.0.1:3080' }, '203.0.113.7'), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(false)
    expect(delegated).toBe(false)
  })

  it('vetoes a non-loopback request without a device cookie', () => {
    const service = makeService()
    const gate = makeGateListener(service)
    let delegated = false
    const result = gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(false)
    expect(delegated).toBe(false)
  })

  it('passes a paired device and records its activity', () => {
    const service = makeService()
    const { token } = service.issue()
    const accepted = service.accept(token)
    expect(accepted.ok).toBe(true)
    const deviceId = accepted.ok ? accepted.deviceId : ''
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api' })
    let delegated = false
    const result = gate(request({ host: '192.168.1.5:3080', cookie: `dsh_pair=${deviceId}` }), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(true)
    expect(delegated).toBe(true)
    expect(service.snapshot().phase).toBe('connected')
  })

  it('vetoes a revoked device (after stop)', () => {
    const service = makeService()
    const { token } = service.issue()
    const accepted = service.accept(token)
    const deviceId = accepted.ok ? accepted.deviceId : ''
    service.stop()
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api' })
    let delegated = false
    const result = gate(request({ host: '192.168.1.5:3080', cookie: `dsh_pair=${deviceId}` }), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(false)
    expect(delegated).toBe(false)
  })

  it('vetoes an unknown device id', () => {
    const service = makeService()
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api' })
    const result = gate(request({ host: '192.168.1.5:3080', cookie: 'dsh_pair=unknown' }), 'session.list', () => true)
    expect(result).toBe(false)
  })

  it('passes remote requests when requirePairingForLan is off', () => {
    const service = makeService()
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api', requirePairingForLan: false })
    const result = gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => true)
    expect(result).toBe(true)
  })

  it('re-reads requirePairingForLan per request', () => {
    const service = makeService()
    let require = true
    const gate = makeGateListener(service, {
      remoteApiMode: 'legacy-full-api',
      requirePairingForLan: () => require,
    })
    let delegated = false
    expect(gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => { delegated = true; return true })).toBe(false)
    require = false
    expect(gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => { delegated = true; return true })).toBe(true)
    expect(delegated).toBe(true)
  })

  it('denies a paired device in the default mobile-only full-api mode', () => {
    const service = makeService()
    const { token } = service.issue()
    const accepted = service.accept(token)
    expect(accepted.ok).toBe(true)
    const deviceId = accepted.ok ? accepted.deviceId : ''
    const gate = makeGateListener(service)
    let delegated = false
    expect(gate(request({ host: '192.168.1.5:3080', cookie: `dsh_pair=${deviceId}` }), 'session.list', () => {
      delegated = true
      return true
    })).toBe(false)
    expect(delegated).toBe(false)
  })

  it('vetoes non-loopback requests while the plugin is disabled', () => {
    const service = makeService()
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api', requirePairingForLan: true, enabled: () => false })
    let delegated = false
    const result = gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(false)
    expect(delegated).toBe(false)
  })

  it('keeps loopback available while the plugin is disabled', () => {
    const service = makeService()
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api', requirePairingForLan: true, enabled: () => false })
    let delegated = false
    const result = gate(request({ host: '127.0.0.1:3080' }), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(true)
    expect(delegated).toBe(true)
  })

  it('re-reads the full-api mode per request and fails closed by default', () => {
    const service = makeService()
    let mode: 'mobile-only' | 'legacy-full-api' = 'mobile-only'
    const gate = makeGateListener(service, { remoteApiMode: () => mode, requirePairingForLan: false })
    expect(gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => true)).toBe(false)
    mode = 'legacy-full-api'
    expect(gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => true)).toBe(true)
  })

  it('re-enabling restores pairing after stop', () => {
    const service = makeService()
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api', requirePairingForLan: true, enabled: () => true })
    service.stop()
    const { token } = service.issue()
    const accepted = service.accept(token)
    expect(accepted.ok).toBe(true)
    const deviceId = accepted.ok ? accepted.deviceId : ''
    let delegated = false
    const result = gate(request({ host: '192.168.1.5:3080', cookie: `dsh_pair=${deviceId}` }), 'session.list', () => { delegated = true; return true })
    expect(result).toBe(true)
    expect(delegated).toBe(true)
  })

  it('vetoes a request with an unparsable Host', () => {
    const service = makeService()
    const gate = makeGateListener(service, { remoteApiMode: 'legacy-full-api' })
    expect(gate(request({ host: ':::' }), 'session.list', () => true)).toBe(false)
  })

  it('fails closed when a live gate setting reader throws', () => {
    const service = makeService()
    const gate = makeGateListener(service, {
      remoteApiMode: () => { throw new Error('settings unavailable') },
    })
    expect(gate(request({ host: '192.168.1.5:3080' }), 'session.list', () => true)).toBe(false)
  })
})

describe('readCookie', () => {
  it('finds a cookie among others and trims whitespace', () => {
    expect(readCookie('a=1; dsh_pair=  abc ; b=2', 'dsh_pair')).toBe('abc')
    expect(readCookie(undefined, 'dsh_pair')).toBeUndefined()
    expect(readCookie('a=1', 'dsh_pair')).toBeUndefined()
  })
})
