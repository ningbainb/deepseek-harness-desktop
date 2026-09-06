/**
 * Pairing state machine: one active one-time token, a device-session table,
 * and presence tracking. Pure TypeScript with injected clock/randomness so
 * the whole security semantics are unit-testable without cordis. The
 * cordis-facing surfaces (routes, the api/gate listener) live next door.
 *
 * Security invariants:
 * - One active token at a time; `issue()` replaces it, so a refreshed QR
 *   immediately invalidates the previous link.
 * - A token is consumed by the first successful `accept()` — reuse is
 *   refused with `'used'`.
 * - Tokens expire; `accept()` on an expired token is refused like an
 *   unknown one (no oracle for validity).
 * - `stop()` revokes every device session and clears the token, so paired
 *   devices are cut off on their next gated request.
 */

import { randomBytes, randomUUID } from 'node:crypto'

/** Cookie names accepted by the pairing boundary; values are opaque IDs. */
export const PAIRING_COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u

/** Whether a configured pairing cookie name is safe to interpolate in headers. */
export function isSafePairingCookieName(value: unknown): value is string {
  return typeof value === 'string' && PAIRING_COOKIE_NAME_PATTERN.test(value)
}

/**
 * Public bases are origins only. HTTPS is required because the base may be
 * used to set a device cookie that must never travel over cleartext HTTP.
 */
export function isSecurePublicBaseUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname !== ''
      && url.username === ''
      && url.password === ''
      && url.search === ''
      && url.hash === ''
      && (url.pathname === '' || url.pathname === '/')
  } catch {
    return false
  }
}

/** The observable pairing phases the panel renders. */
export type PairingPhase =
  /** The server is not bound all-interfaces: no usable QR exists. */
  | 'lan-required'
  /** Remote control was stopped; a fresh QR (issue) re-enables it. */
  | 'stopped'
  /** A token is live and no device has paired with it yet. */
  | 'waiting'
  /** At least one paired device was active recently. */
  | 'connected'
  /** Devices are paired but none has been active within the offline window. */
  | 'disconnected'

/** One issued pairing token (keyed by its secret). */
export interface TokenRecord {
  /** Monotonic issue time (ms epoch), drives refresh ordering. */
  issuedAt: number
  /** Absolute expiry (ms epoch); accept() past this is refused. */
  expiresAt: number
  /** Consumed by the first successful accept(). */
  consumed: boolean
  /** Opaque, non-secret identifier surfaced in snapshots (never the pairing secret). */
  id: string
  /** Workspace the QR link should land the phone in (optional). */
  workspaceId?: string
  /** LAN IP literal the QR link was built from (optional; default first). */
  address?: string
}

/** One paired device session, keyed by the device id stored in its cookie. */
export interface DeviceSession {
  /** Opaque cookie identity minted by the Host. */
  deviceId: string
  /** Principal bound by the Host user-scope service; never client supplied. */
  principalId: string
  /** Pairing time (ms epoch). */
  createdAt: number
  /** Last time the device passed a gated request or heartbeat. */
  lastSeenAt: number
  /** Optional local-admin label; never accepted from a remote payload. */
  displayName?: string
  /** Set when the device is explicitly revoked before the process is stopped. */
  revokedAt?: number
}

/** Host-owned identity bridge used by the asynchronous pairing route. */
export interface PairingIdentity {
  bindDevice(deviceId: string): Promise<{ principalId: string }>
  grantWorkspace?(principalId: string, workspaceId: string): Promise<void>
  revokeDevice?(deviceId: string): Promise<boolean>
}

/** One tunnel status frame (auto-tunnel only; undefined when disabled). */
export interface TunnelStatus {
  /** starting: binary/process warming up; running: URL minted; failed: no URL. */
  state: 'starting' | 'running' | 'failed'
  /** The minted public URL, once the tunnel reports it. */
  url?: string
  /** Human-readable failure detail. */
  error?: string
}

/** One snapshot frame pushed to desktop status streams. */
export interface PairingSnapshot {
  phase: PairingPhase
  /** Whether the server bind is all-interfaces (a QR is constructible). */
  lanAvailable: boolean
  /** The LAN IP literals a QR can be built from (interface order). */
  lanAddresses: string[]
  /** Configured public (tunneled) base URL, when present. */
  publicUrl?: string
  /** Auto-tunnel status, while the auto-tunnel feature is active. */
  tunnel?: TunnelStatus
  /** Opaque (non-secret) id of the active token (undefined when stopped/lan-required). */
  tokenId?: string
  /** Absolute expiry of the active token. */
  tokenExpiresAt?: number
  /** Count of ever-paired devices. */
  deviceCount: number
  /** Count of devices active within the offline window. */
  onlineCount: number
}

/** Service tunables (config-validated upstream; plain numbers here). */
export interface PairingConfig {
  /** Token lifetime; the QR stops working after this. */
  tokenTtlMs: number
  /** A device is "online" while its lastSeenAt is newer than this. */
  offlineAfterMs: number
  /** Hard cap on paired device sessions (oldest-evicted when full). */
  maxDevices: number
  /** Cookie name carrying the device id. */
  cookieName: string
}

/** Result of one accept() attempt. */
export type AcceptResult =
  | { ok: true; deviceId: string; principalId: string }
  | { ok: false; code: 'invalid' | 'used' | 'identity-unavailable' }

/** Thrown by issue() for an address outside the sampled LAN literals. */
export class UnknownLanAddressError extends Error {
  /**
   * @param address - the offending literal.
   */
  constructor(address: string) {
    super(`remote-web-ui: unknown LAN address ${JSON.stringify(address)}`)
    this.name = 'UnknownLanAddressError'
  }
}

/** Clock and entropy injection for tests. */
export interface PairingClock {
  now(): number
  randomToken(): string
}

/** Real clock/entropy: 32 random hex chars per token. */
export const defaultClock: PairingClock = {
  now: () => Date.now(),
  randomToken: () => randomBytes(16).toString('hex'),
}

/**
 * The pairing state machine. All mutations notify state listeners after the
 * commit point that makes them true, and notification dedupes against the
 * last emitted snapshot — time-driven transitions (a device aging offline)
 * surface on the next sweep without any mutation.
 */
export class PairingService {
  private readonly tokens = new Map<string, TokenRecord>()
  private readonly devices = new Map<string, DeviceSession>()
  private readonly listeners = new Set<(snapshot: PairingSnapshot) => void>()
  private lastEmitted: PairingSnapshot | undefined
  private stopped = false
  private tokenSerial = 0
  /** LAN base URLs keyed by the advertised IP literal (interface order). */
  private lanBases = new Map<string, string>()
  /** Public (tunneled) base URL, e.g. a Cloudflare Tunnel quick URL. */
  private publicBase: string | undefined
  /** Auto-tunnel status, while the auto-tunnel feature is active. */
  private tunnelStatus: TunnelStatus | undefined
  private readonly deviceRevokedListeners = new Set<(deviceId: string) => void>()

  /**
   * @param config - tunables. The settings surface replaces the object (a
   * fresh literal) when a committed section changes; every operation reads
   * the current one.
   * @param clock - clock/entropy source (injectable for tests).
   */
  constructor(
    public config: PairingConfig,
    private readonly clock: PairingClock = defaultClock,
    private readonly identity?: PairingIdentity,
  ) {
    if (!isSafePairingCookieName(config.cookieName)) {
      throw new TypeError('invalid pairing cookie name')
    }
  }

  /** The default LAN base URL (the first interface; undefined when not LAN-reachable). */
  get lanBaseUrl(): string | undefined {
    return this.lanBases.values().next().value as string | undefined
  }

  /** The LAN base URL for one specific literal (undefined when not constructible). */
  lanBaseUrlFor(address: string): string | undefined {
    return this.lanBases.get(address)
  }

  /** The LAN IP literals QR links can be built from (interface order). */
  get lanAddresses(): string[] {
    return [...this.lanBases.keys()]
  }

  /** Set the LAN base URLs once the server bind is known (interface order). */
  setLanBases(entries: readonly { address: string; base: string }[]): void {
    this.lanBases = new Map(entries.map(entry => [entry.address, entry.base]))
    this.notify()
  }

  /** The configured public (tunneled) base URL, when present. */
  get publicBaseUrl(): string | undefined {
    return this.publicBase
  }

  /** Set or clear the public base URL (a tunnel in front of this server). */
  setPublicBaseUrl(url: string | undefined): void {
    if (url !== undefined && !isSecurePublicBaseUrl(url)) {
      throw new TypeError('invalid secure public base URL')
    }
    this.publicBase = url
    this.notify()
  }

  /** Set or clear the auto-tunnel status frame (undefined when the feature is off). */
  setTunnelStatus(status: TunnelStatus | undefined): void {
    this.tunnelStatus = status
    this.notify()
  }

  /**
   * Issue a fresh token, replacing (invalidating) any previous one. A
   * stopped service re-arms through this call (the panel's refresh button).
   * @param workspaceId - optional workspace the QR link should land in.
   * @param address - optional LAN IP literal the QR must be built from; the
   * default is the public base (when configured) or the first interface.
   * Unknown addresses are refused.
   * @returns the token secret and its expiry.
   * @throws {Error} when no reachable base exists (no public base and no
   * explicitly supported all-interface bind) — callers surface this as the
   * lan-required state instead of minting an unusable QR.
   */
  issue(workspaceId?: string, address?: string): { token: string; expiresAt: number } {
    if (this.lanBases.size === 0 && this.publicBase === undefined) {
      throw new Error('remote-web-ui: pairing requires autoTunnel, publicBaseUrl, or an explicitly supported all-interface bind')
    }
    if (address !== undefined && !this.lanBases.has(address)) {
      throw new UnknownLanAddressError(address)
    }
    const now = this.clock.now()
    const token = this.clock.randomToken()
    this.tokens.clear()
    this.stopped = false
    this.tokenSerial += 1
    this.tokens.set(token, {
      id: `t${this.tokenSerial}`,
      issuedAt: now,
      expiresAt: now + this.config.tokenTtlMs,
      consumed: false,
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(address !== undefined ? { address } : {}),
    })
    this.notify()
    return { token, expiresAt: now + this.config.tokenTtlMs }
  }

  /**
   * Consume a token and bind a device session. One-time: the second
   * successful call for the same token is impossible because the first
   * consumes it.
   * @param token - the token secret from the QR link.
   * @returns the new device id, or a refusal code.
   */
  accept(token: string): AcceptResult {
    const record = this.consumeToken(token)
    if (!record.ok) return record
    const deviceId = this.clock.randomToken()
    const principalId = `principal-device-${randomUUID()}`
    return this.commitAccepted(record.value, deviceId, principalId)
  }

  /**
   * Asynchronous Host-owned accept path. Pairing routes use this method so a
   * successful cookie is only issued after user-scope has persisted the
   * device/principal binding and the optional QR workspace grant.
   */
  async acceptAsync(token: string): Promise<AcceptResult> {
    const record = this.consumeToken(token)
    if (!record.ok) return record
    const deviceId = this.clock.randomToken()
    let principalId: string
    try {
      const bound = this.identity === undefined
        ? { principalId: `principal-device-${randomUUID()}` }
        : await this.identity.bindDevice(deviceId)
      if (typeof bound.principalId !== 'string' || bound.principalId === '') throw new Error('invalid principal binding')
      principalId = bound.principalId
      if (record.value.workspaceId !== undefined) {
        if (this.identity?.grantWorkspace === undefined) throw new Error('workspace grant bridge unavailable')
        await this.identity.grantWorkspace(principalId, record.value.workspaceId)
      }
    } catch {
      if (this.identity?.revokeDevice !== undefined) {
        try { await this.identity.revokeDevice(deviceId) } catch { /* best-effort cleanup; access was never issued */ }
      }
      return { ok: false, code: 'identity-unavailable' }
    }
    // The identity bridge is asynchronous. A local-admin stop or QR refresh
    // may invalidate the consumed token while it is waiting; never commit a
    // device from that stale accept, and best-effort revoke the persisted
    // binding created by the bridge.
    if (!this.tokenIsCurrent(record.value)) {
      if (this.identity?.revokeDevice !== undefined) {
        try { await this.identity.revokeDevice(deviceId) } catch { /* pairing was never committed locally */ }
      }
      return { ok: false, code: 'invalid' }
    }
    return this.commitAccepted(record.value, deviceId, principalId)
  }

  private consumeToken(token: string): { ok: true; value: TokenRecord } | { ok: false; code: 'invalid' | 'used' } {
    const record = this.tokens.get(token)
    if (record === undefined || record.consumed || this.stopped || this.clock.now() >= record.expiresAt) {
      return { ok: false, code: record?.consumed === true ? 'used' : 'invalid' }
    }
    record.consumed = true
    return { ok: true, value: { ...record } }
  }

  private commitAccepted(record: TokenRecord, deviceId: string, principalId: string): AcceptResult {
    const now = this.clock.now()
    if (this.devices.size >= this.config.maxDevices) {
      // Evict the oldest session (FIFO) before binding a new device.
      let oldest: { id: string; createdAt: number } | undefined
      for (const [id, session] of this.devices) {
        if (oldest === undefined || session.createdAt < oldest.createdAt) oldest = { id, createdAt: session.createdAt }
      }
      if (oldest !== undefined) {
        this.revokeDevice(oldest.id)
        this.devices.delete(oldest.id)
      }
    }
    this.devices.set(deviceId, { deviceId, principalId, createdAt: now, lastSeenAt: now })
    this.notify()
    return { ok: true, deviceId, principalId }
  }

  /** Revoke one paired device immediately and emit a close signal. */
  revokeDevice(deviceId: string): boolean {
    const session = this.devices.get(deviceId)
    if (session === undefined || session.revokedAt !== undefined) return false
    session.revokedAt = this.clock.now()
    this.emitDeviceRevoked(deviceId)
    this.persistRevocation(deviceId)
    this.notify()
    return true
  }

  /** Rename one device from the loopback-only local control plane. */
  renameDevice(deviceId: string, displayName: string): boolean {
    const session = this.devices.get(deviceId)
    if (session === undefined || session.revokedAt !== undefined) return false
    session.displayName = displayName.slice(0, 128)
    this.notify()
    return true
  }

  /** Device records are only exposed by loopback control routes. */
  devicesSnapshot(): DeviceSession[] {
    return [...this.devices.values()].map(session => ({ ...session }))
  }

  /** Subscribe to immediate revocation signals used to abort live SSE. */
  onDeviceRevoked(listener: (deviceId: string) => void): () => void {
    this.deviceRevokedListeners.add(listener)
    return () => { this.deviceRevokedListeners.delete(listener) }
  }

  private emitDeviceRevoked(deviceId: string): void {
    for (const listener of this.deviceRevokedListeners) {
      try { listener(deviceId) } catch { /* a listener cannot block revocation */ }
    }
  }

  private persistRevocation(deviceId: string): void {
    const revoke = this.identity?.revokeDevice
    if (revoke === undefined) return
    void revoke(deviceId).catch(() => {
      console.warn('remote-web-ui: failed to persist device revocation')
    })
  }

  /**
   * Stop remote control: revoke every device session and clear the token.
   * The phone's next gated /api request 403s; the panel falls back to
   * stopped until a fresh QR is issued.
   */
  stop(): void {
    this.tokens.clear()
    for (const [deviceId, session] of this.devices) {
      if (session.revokedAt === undefined) {
        session.revokedAt = this.clock.now()
        this.emitDeviceRevoked(deviceId)
        this.persistRevocation(deviceId)
      }
    }
    this.devices.clear()
    this.stopped = true
    this.notify()
  }

  /**
   * The api/gate path: record activity for a device id and report whether
   * the request may proceed. Unknown or revoked ids (including any device
   * after stop()) are refused.
   * @param deviceId - the cookie value of the requesting device.
   * @returns true when the device session is live and was refreshed.
   */
  touchDevice(deviceId: string): boolean {
    const session = this.devices.get(deviceId)
    if (session === undefined || session.revokedAt !== undefined || this.stopped) return false
    session.lastSeenAt = this.clock.now()
    this.notify()
    return true
  }

  /** Explicit presence heartbeat (the phone's client sends these). */
  heartbeat(deviceId: string): boolean {
    return this.touchDevice(deviceId)
  }

  /**
   * Periodic sweep: re-evaluate the derived snapshot (a device aging past
   * the offline window flips the phase to disconnected). Emits only when
   * the snapshot actually changed.
   */
  sweep(): void {
    this.notify()
  }

  /** The current snapshot (fresh object per call — stable between emits). */
  snapshot(): PairingSnapshot {
    const now = this.clock.now()
    const onlineCount = [...this.devices.values()].filter(session => this.isOnlineAt(session, now)).length
    const token = this.activeToken()
    return {
      phase: this.derivePhase(onlineCount, token !== undefined),
      lanAvailable: this.lanBases.size > 0,
      lanAddresses: [...this.lanBases.keys()],
      ...(this.publicBase !== undefined ? { publicUrl: this.publicBase } : {}),
      ...(this.tunnelStatus !== undefined ? { tunnel: this.tunnelStatus } : {}),
      ...(token !== undefined ? { tokenId: token.record.id, tokenExpiresAt: token.record.expiresAt } : {}),
      deviceCount: this.devices.size,
      onlineCount,
    }
  }

  /** Whether a cookie value names a currently live device session. */
  hasDevice(deviceId: string): boolean {
    const session = this.devices.get(deviceId)
    return session !== undefined && session.revokedAt === undefined && !this.stopped
  }

  /** Principal bound to a live device session; undefined is a safe deny. */
  principalForDevice(deviceId: string): string | undefined {
    return this.hasDevice(deviceId) ? this.devices.get(deviceId)?.principalId : undefined
  }

  /** Device record for local diagnostics; never use this for remote auth. */
  device(deviceId: string): DeviceSession | undefined {
    const session = this.devices.get(deviceId)
    return session === undefined ? undefined : { ...session }
  }

  /** Subscribe to snapshot changes (each emit passes a fresh snapshot). */
  onState(listener: (snapshot: PairingSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private activeToken(): { token: string; record: TokenRecord } | undefined {
    for (const [token, record] of this.tokens) {
      if (this.stopped) return undefined
      if (record.consumed) continue
      if (this.clock.now() >= record.expiresAt) continue
      return { token, record }
    }
    return undefined
  }

  /** Whether an async accept still belongs to the current, unrefreshed QR. */
  private tokenIsCurrent(record: TokenRecord): boolean {
    if (this.stopped || record.expiresAt <= this.clock.now()) return false
    for (const current of this.tokens.values()) {
      if (current.id === record.id && current.consumed) return true
    }
    return false
  }

  private derivePhase(onlineCount: number, hasToken: boolean): PairingPhase {
    if (this.lanBases.size === 0 && this.publicBase === undefined) return 'lan-required'
    if (this.stopped) return 'stopped'
    if (onlineCount > 0) return 'connected'
    if (this.devices.size > 0) return 'disconnected'
    if (hasToken) return 'waiting'
    return 'stopped'
  }

  private isOnlineAt(session: DeviceSession, now: number): boolean {
    return now - session.lastSeenAt <= this.config.offlineAfterMs
  }

  private notify(): void {
    const snapshot = this.snapshot()
    if (this.lastEmitted !== undefined && snapshotsEqual(this.lastEmitted, snapshot)) return
    this.lastEmitted = snapshot
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch (error) {
        // A throwing subscriber must not break the emit loop or the caller.
        console.error('remote-web-ui: pairing state listener failed', error)
      }
    }
  }
}

/** Structural equality over the snapshot's wire fields. */
function snapshotsEqual(a: PairingSnapshot, b: PairingSnapshot): boolean {
  return a.phase === b.phase
    && a.lanAvailable === b.lanAvailable
    && sameStrings(a.lanAddresses, b.lanAddresses)
    && a.publicUrl === b.publicUrl
    && tunnelEqual(a.tunnel, b.tunnel)
    && a.tokenId === b.tokenId
    && a.tokenExpiresAt === b.tokenExpiresAt
    && a.deviceCount === b.deviceCount
    && a.onlineCount === b.onlineCount
}

/** Tunnel frame equality (undefined equals undefined; fields compared shallowly). */
function tunnelEqual(a: TunnelStatus | undefined, b: TunnelStatus | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined
    && a.state === b.state && a.url === b.url && a.error === b.error)
}

/** Element-wise string list equality (interface order is meaningful). */
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}
