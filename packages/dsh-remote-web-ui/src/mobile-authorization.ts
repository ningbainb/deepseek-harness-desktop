/**
 * Shared authorization helpers for the mobile data channel. Authentication
 * comes from the pairing cookie, while resource authorization comes from the
 * single Host-owned user-scope service. The helpers deliberately return only
 * a scope or a boolean: callers must not expose the reason a resource was
 * denied to a remote principal.
 */

import type { IncomingMessage } from 'node:http'
import type { MuxFrame } from '@deepseek-ai/dsh-host-apiproxy/api/events'
import type { PairingService } from './pairing.ts'
import {
  asDeviceId,
  asPrincipalId,
  asSessionId,
  asWorkspaceId,
  type AccessDecision,
  type AccessResource,
  type AccessScope,
  type DeviceId,
  type PrincipalId,
  type SessionId,
  type UserScopeService,
  type WorkspaceId,
} from '@ningbainb/dsh-user-scope'
import { readCookie } from './gate.ts'

/** The small user-scope surface the remote plugin is allowed to consume. */
export interface MobileScopeAuthority {
  principalForDevice(deviceId: string): PrincipalId | undefined
  touchDevice(deviceId: string): boolean
  canAccess(scope: AccessScope, resource: AccessResource): AccessDecision
  visibleSessions(scope: AccessScope): Array<{ sessionId: SessionId }>
  registerSession(input: {
    sessionId: string
    workspaceId?: string
    createdByPrincipalId?: string
  }): Promise<void>
  run<T>(scope: AccessScope, callback: () => T): T
}

/** Structural adapter keeps the import contract explicit for Host wiring. */
export type MobileScopeService = Pick<
  UserScopeService,
  'principalForDevice' | 'touchDevice' | 'canAccess' | 'visibleSessions' | 'registerSession' | 'run'
>

/** Resolve and validate the access scope carried by a paired-device cookie. */
export function resolveMobileScope(
  request: IncomingMessage,
  pairing: PairingService,
  authority: MobileScopeAuthority | undefined,
): { deviceId: DeviceId; scope: AccessScope } | undefined {
  if (authority === undefined) return undefined
  const rawDeviceId = readCookie(request.headers.cookie, pairing.config.cookieName)
  if (rawDeviceId === undefined || !pairing.hasDevice(rawDeviceId)) return undefined
  const deviceId = asDeviceId(rawDeviceId)
  const pairedPrincipal = asPrincipalId(pairing.principalForDevice(rawDeviceId))
  const persistedPrincipal = authority.principalForDevice(rawDeviceId)
  if (deviceId === undefined || pairedPrincipal === undefined || persistedPrincipal === undefined || pairedPrincipal !== persistedPrincipal) return undefined
  const scope: AccessScope = { principalId: persistedPrincipal, deviceId, source: 'remote' }
  if (!authority.canAccess(scope, { kind: 'principal', principalId: persistedPrincipal }).allowed) return undefined
  // Refresh both process authentication and the persisted registry's live
  // binding before dispatching any remote operation.
  if (!pairing.touchDevice(rawDeviceId) || !authority.touchDevice(rawDeviceId)) return undefined
  return { deviceId, scope }
}

/** A remote payload may never impersonate identity or authorization state. */
export function hasIdentityOverride(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  return ['principalId', 'ownerId', 'grants', 'deviceId'].some(key => Object.prototype.hasOwnProperty.call(payload, key))
}

/** Parse a resource id without guessing malformed or path-like values. */
export function sessionIdFromPayload(payload: unknown): SessionId | undefined {
  return isRecord(payload) ? asSessionId(payload.sessionId) : undefined
}

/** Parse a workspace id without guessing malformed or path-like values. */
export function workspaceIdFromPayload(payload: unknown): WorkspaceId | undefined {
  return isRecord(payload) ? asWorkspaceId(payload.workspaceId) : undefined
}

/** Check a session resource against the current remote scope. */
export function canAccessSession(authority: MobileScopeAuthority, scope: AccessScope, sessionId: SessionId): boolean {
  return authority.canAccess(scope, { kind: 'session', sessionId }).allowed
}

/** Check a workspace resource against the current remote scope. */
export function canAccessWorkspace(authority: MobileScopeAuthority, scope: AccessScope, workspaceId: WorkspaceId): boolean {
  return authority.canAccess(scope, { kind: 'workspace', workspaceId }).allowed
}

/**
 * Mux frames are safe only when they carry a valid, currently authorized
 * session. `stream/error` has no resource identity and is therefore dropped.
 */
const MUX_FRAME_TYPES = new Set([
  'session/event',
  'session/subscribed',
  'approval/requested',
  'approval/resolved',
  'question/requested',
  'question/resolved',
  'session/queue',
  'session/jobs',
  'session/projection',
])

export function isAuthorizedMuxFrame(
  frame: unknown,
  authority: MobileScopeAuthority,
  scope: AccessScope,
): frame is { rpcId: string; payload: MuxFrame } {
  if (!isRecord(frame) || typeof frame.rpcId !== 'string' || frame.rpcId.length === 0 || frame.rpcId.length > 256) return false
  if (!isRecord(frame.payload) || typeof frame.payload.type !== 'string' || !MUX_FRAME_TYPES.has(frame.payload.type)) return false
  const sessionId = asSessionId(frame.payload.sessionId)
  return sessionId !== undefined && canAccessSession(authority, scope, sessionId)
}

/** Record guard used before inspecting untrusted JSON values. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
