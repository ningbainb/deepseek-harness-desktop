/** PairingService semantics: one-time tokens, expiry, refresh, stop, presence. */
import { describe, expect, it } from 'vitest'
import { PairingService, UnknownLanAddressError, type PairingConfig, type PairingIdentity } from '../src/pairing.ts'

function makeService(overrides: Partial<PairingConfig> = {}, identity?: PairingIdentity) {
  let counter = 0
  const service = new PairingService({
    tokenTtlMs: 60_000,
    offlineAfterMs: 10_000,
    maxDevices: 2,
    cookieName: 'dsh_pair',
    ...overrides,
  }, {
    now: () => now,
    randomToken: () => `tok-${String(++counter).padStart(4, '0')}`,
  }, identity)
  service.setLanBases([{ address: '192.168.1.5', base: 'http://192.168.1.5:3080' }])
  return service
}

let now = 0
beforeEach0()

function beforeEach0(): void {
  now = 1_000_000
}

describe('PairingService', () => {
  it('issues one active token and replaces it on refresh (old link dies)', () => {
    const service = makeService()
    const first = service.issue()
    expect(service.accept(first.token)).toMatchObject({ ok: true })
    // Refresh: the previous token record is gone, so reuse is invalid.
    const second = service.issue()
    expect(second.token).not.toBe(first.token)
    expect(service.accept(first.token)).toEqual({ ok: false, code: 'invalid' })
    expect(service.accept(second.token)).toMatchObject({ ok: true })
  })

  it('never exposes the pairing secret in the snapshot', () => {
    const service = makeService()
    const { token } = service.issue()
    const snapshot = service.snapshot()
    expect(snapshot.tokenId).toBeDefined()
    expect(snapshot.tokenId).not.toBe(token)
  })

  it('refuses a consumed token (one-time) with used', () => {
    const service = makeService()
    const { token } = service.issue()
    expect(service.accept(token)).toMatchObject({ ok: true })
    expect(service.accept(token)).toEqual({ ok: false, code: 'used' })
  })

  it('refuses an expired token as invalid', () => {
    const service = makeService()
    const { token } = service.issue()
    now += 61_000
    expect(service.accept(token)).toEqual({ ok: false, code: 'invalid' })
  })

  it('refuses a token exactly at its expiry deadline', () => {
    const service = makeService()
    const { token } = service.issue()
    now += 60_000
    expect(service.accept(token)).toEqual({ ok: false, code: 'invalid' })
    expect(service.snapshot().tokenId).toBeUndefined()
  })

  it('refuses an unknown token as invalid', () => {
    const service = makeService()
    expect(service.accept('nope')).toEqual({ ok: false, code: 'invalid' })
  })

  it('throws lan-required when no LAN base is set (no unusable QR)', () => {
    const service = makeService()
    service.setLanBases([])
    expect(() => service.issue()).toThrow(/autoTunnel.*publicBaseUrl/u)
  })

  it('mints against a chosen address and refuses unknown literals', () => {
    const service = makeService()
    service.setLanBases([
      { address: '192.168.1.5', base: 'http://192.168.1.5:3080' },
      { address: '10.0.0.3', base: 'http://10.0.0.3:3080' },
    ])
    expect(service.lanAddresses).toEqual(['192.168.1.5', '10.0.0.3'])
    // Default stays the first interface; an explicit address is honored.
    const first = service.issue('ws-1')
    const second = service.issue('ws-2', '10.0.0.3')
    expect(first.token).not.toBe(second.token)
    expect(() => service.issue(undefined, '192.0.2.1')).toThrow(UnknownLanAddressError)
    // The snapshot advertises every constructible literal (interface order).
    expect(service.snapshot().lanAddresses).toEqual(['192.168.1.5', '10.0.0.3'])
  })

  it('publicBaseUrl satisfies the reachable-bind requirement and surfaces in snapshots', () => {
    const service = makeService()
    service.setLanBases([])
    service.setPublicBaseUrl('https://phone.example.com')
    // No LAN bind, but the public base is a constructible link — no throw.
    expect(() => service.issue()).not.toThrow()
    // The snapshot advertises the public base alongside the (empty) LAN set.
    expect(service.snapshot()).toMatchObject({
      phase: 'waiting',
      lanAvailable: false,
      lanAddresses: [],
      publicUrl: 'https://phone.example.com',
    })
    // Clearing the public base restores the lan-required condition.
    service.setPublicBaseUrl(undefined)
    expect(() => service.issue()).toThrow(/autoTunnel.*publicBaseUrl/u)
    expect(service.snapshot().phase).toBe('lan-required')
  })

  it('rejects insecure or non-origin public bases', () => {
    const service = makeService()
    expect(() => service.setPublicBaseUrl('http://phone.example.com')).toThrow(/secure public base URL/u)
    expect(() => service.setPublicBaseUrl('https://phone.example.com/path')).toThrow(/secure public base URL/u)
    expect(() => service.setPublicBaseUrl('https://user:pass@phone.example.com')).toThrow(/secure public base URL/u)
  })

  it('surfaces auto-tunnel status frames and clears them with the feature', () => {
    const service = makeService()
    service.setLanBases([])
    service.setPublicBaseUrl(undefined)
    expect(service.snapshot().tunnel).toBeUndefined()
    service.setTunnelStatus({ state: 'starting' })
    expect(service.snapshot().tunnel).toEqual({ state: 'starting' })
    // The status alone does not make a QR constructible (that is publicBaseUrl).
    expect(() => service.issue()).toThrow(/autoTunnel.*publicBaseUrl/u)
    service.setPublicBaseUrl('https://tunnel.example.com')
    service.setTunnelStatus({ state: 'running', url: 'https://tunnel.example.com' })
    expect(service.snapshot()).toMatchObject({
      publicUrl: 'https://tunnel.example.com',
      tunnel: { state: 'running', url: 'https://tunnel.example.com' },
    })
    // Turning the feature off clears the frame.
    service.setTunnelStatus(undefined)
    expect(service.snapshot().tunnel).toBeUndefined()
    // A failed frame with an error detail surfaces too.
    service.setTunnelStatus({ state: 'failed', error: 'binary offline' })
    expect(service.snapshot().tunnel).toEqual({ state: 'failed', error: 'binary offline' })
    // Listener dedupe: a repeated identical frame emits nothing.
    const seen: unknown[] = []
    service.onState(snapshot => { seen.push(snapshot.tunnel) })
    service.setTunnelStatus({ state: 'failed', error: 'binary offline' })
    expect(seen).toEqual([])
  })

  it('stop revokes devices and tokens; a fresh issue re-arms', () => {
    const service = makeService()
    const { token } = service.issue()
    const accepted = service.accept(token)
    expect(accepted.ok).toBe(true)
    const deviceId = accepted.ok ? accepted.deviceId : ''
    expect(service.hasDevice(deviceId)).toBe(true)
    service.stop()
    expect(service.hasDevice(deviceId)).toBe(false)
    expect(service.touchDevice(deviceId)).toBe(false)
    expect(service.accept(token)).toEqual({ ok: false, code: 'invalid' })
    expect(service.snapshot().phase).toBe('stopped')
    // Refresh re-arms from the stopped state.
    service.issue()
    expect(service.snapshot().phase).toBe('waiting')
  })

  it('tracks presence: touch keeps a device online, then it ages offline', () => {
    const service = makeService()
    const { token } = service.issue()
    const accepted = service.accept(token)
    const deviceId = accepted.ok ? accepted.deviceId : ''
    expect(service.snapshot().phase).toBe('connected')
    now += 9_000
    service.sweep()
    expect(service.snapshot().phase).toBe('connected')
    now += 2_000
    service.sweep()
    expect(service.snapshot().phase).toBe('disconnected')
    // Activity brings it back online.
    expect(service.touchDevice(deviceId)).toBe(true)
    expect(service.snapshot().phase).toBe('connected')
  })

  it('notifies listeners only on real snapshot changes', () => {
    const service = makeService()
    const seen: string[] = []
    service.onState(snapshot => { seen.push(snapshot.phase) })
    service.issue()
    expect(seen).toEqual(['waiting'])
    service.sweep()
    expect(seen).toEqual(['waiting'])
    const { token } = service.issue()
    const accepted = service.accept(token)
    expect(accepted.ok).toBe(true)
    expect(seen).toEqual(['waiting', 'waiting', 'connected'])
  })

  it('evicts the oldest device at the session cap', () => {
    const service = makeService({ maxDevices: 2 })
    const first = service.issue()
    const a = service.accept(first.token)
    const second = service.issue()
    const b = service.accept(second.token)
    const third = service.issue()
    const c = service.accept(third.token)
    const aId = a.ok ? a.deviceId : ''
    const bId = b.ok ? b.deviceId : ''
    const cId = c.ok ? c.deviceId : ''
    expect(service.hasDevice(aId)).toBe(false)
    expect(service.hasDevice(bId)).toBe(true)
    expect(service.hasDevice(cId)).toBe(true)
    expect(service.snapshot().deviceCount).toBe(2)
  })

  it('does not resurrect an async accept after stop or QR refresh', async () => {
    let resolveBind: ((value: { principalId: string }) => void) | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const revoked: string[] = []
    const identity: PairingIdentity = {
      bindDevice: async (deviceId) => {
        markStarted?.()
        return await new Promise<{ principalId: string }>(resolve => {
          resolveBind = (value) => {
            revoked.push(`bound:${deviceId}`)
            resolve(value)
          }
        })
      },
      revokeDevice: async deviceId => {
        revoked.push(`revoked:${deviceId}`)
        return true
      },
    }

    const stoppedService = makeService({}, identity)
    const stoppedToken = stoppedService.issue().token
    const stoppedAccept = stoppedService.acceptAsync(stoppedToken)
    await started
    stoppedService.stop()
    resolveBind?.({ principalId: 'principal-late-stop' })
    expect(await stoppedAccept).toEqual({ ok: false, code: 'invalid' })
    expect(stoppedService.snapshot().deviceCount).toBe(0)
    expect(revoked.some(value => value.startsWith('revoked:'))).toBe(true)

    resolveBind = undefined
    markStarted = undefined
    const refreshedStarted = new Promise<void>(resolve => { markStarted = resolve })
    const refreshedService = makeService({}, {
      bindDevice: async (deviceId) => {
        markStarted?.()
        return await new Promise<{ principalId: string }>(resolve => {
          resolveBind = resolve
        })
      },
      revokeDevice: async () => true,
    })
    const oldToken = refreshedService.issue().token
    const refreshedAccept = refreshedService.acceptAsync(oldToken)
    await refreshedStarted
    refreshedService.issue()
    resolveBind?.({ principalId: 'principal-late-refresh' })
    expect(await refreshedAccept).toEqual({ ok: false, code: 'invalid' })
    expect(refreshedService.snapshot().deviceCount).toBe(0)
  })
})
