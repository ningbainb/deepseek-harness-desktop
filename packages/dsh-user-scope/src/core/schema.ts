import {
  asDeviceId,
  asPrincipalId,
  asSessionId,
  asWorkspaceId,
  type DeviceId,
  type PrincipalId,
  type SessionId,
  type WorkspaceId,
} from './ids.ts'

export const CURRENT_SCHEMA_VERSION = 1 as const

export type PrincipalKind = 'local-profile' | 'paired-device'

export interface Principal {
  id: PrincipalId
  kind: PrincipalKind
  createdAt: number
}

export interface PrincipalFile {
  version: typeof CURRENT_SCHEMA_VERSION
  principal: Principal
}

export interface WorkspaceGrant {
  principalId: PrincipalId
  workspaceId: WorkspaceId
  permission: 'use'
  createdAt: number
}

export interface SessionOwnership {
  sessionId: SessionId
  workspaceId?: WorkspaceId
  createdByPrincipalId: PrincipalId
  createdAt: number
  updatedAt: number
  grantedPrincipalIds?: PrincipalId[]
}

export interface DeviceBinding {
  deviceId: DeviceId
  principalId: PrincipalId
  createdAt: number
  lastSeenAt: number
  displayName?: string
  revokedAt?: number
}

export interface OwnershipSnapshot {
  version: typeof CURRENT_SCHEMA_VERSION
  principals: Principal[]
  devices: DeviceBinding[]
  grants: WorkspaceGrant[]
  sessions: SessionOwnership[]
}

export interface AccessScope {
  principalId: PrincipalId
  deviceId?: DeviceId
  source: 'desktop' | 'remote'
}

export type ParseFailure =
  | { ok: false; kind: 'unsupported-version'; version: number }
  | { ok: false; kind: 'invalid' }

export type ParseResult<T> = { ok: true; value: T } | ParseFailure

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseVersion(value: unknown): ParseResult<number> {
  if (!isRecord(value) || typeof value.version !== 'number' || !Number.isSafeInteger(value.version) || value.version < 1) {
    return { ok: false, kind: 'invalid' }
  }
  if (value.version > CURRENT_SCHEMA_VERSION) return { ok: false, kind: 'unsupported-version', version: value.version }
  if (value.version !== CURRENT_SCHEMA_VERSION) return { ok: false, kind: 'invalid' }
  return { ok: true, value: value.version }
}

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function parsePrincipal(value: unknown): Principal | undefined {
  if (!isRecord(value)) return undefined
  const id = asPrincipalId(value.id)
  const kind = value.kind
  if (id === undefined || (kind !== 'local-profile' && kind !== 'paired-device') || !validTime(value.createdAt)) return undefined
  return { id, kind, createdAt: value.createdAt }
}

export function parsePrincipalFile(value: unknown): ParseResult<PrincipalFile> {
  const version = parseVersion(value)
  if (!version.ok) return version
  if (!isRecord(value)) return { ok: false, kind: 'invalid' }
  const principal = parsePrincipal(value.principal)
  if (principal === undefined || principal.kind !== 'local-profile') return { ok: false, kind: 'invalid' }
  return { ok: true, value: { version: CURRENT_SCHEMA_VERSION, principal } }
}

function parseWorkspaceGrant(value: unknown): WorkspaceGrant | undefined {
  if (!isRecord(value)) return undefined
  const principalId = asPrincipalId(value.principalId)
  const workspaceId = asWorkspaceId(value.workspaceId)
  if (principalId === undefined || workspaceId === undefined || value.permission !== 'use' || !validTime(value.createdAt)) return undefined
  return { principalId, workspaceId, permission: 'use', createdAt: value.createdAt }
}

function parseSessionOwnership(value: unknown): SessionOwnership | undefined {
  if (!isRecord(value)) return undefined
  const sessionId = asSessionId(value.sessionId)
  const owner = asPrincipalId(value.createdByPrincipalId)
  if (sessionId === undefined || owner === undefined || !validTime(value.createdAt) || !validTime(value.updatedAt)) return undefined
  let workspaceId: WorkspaceId | undefined
  if (value.workspaceId !== undefined) {
    workspaceId = asWorkspaceId(value.workspaceId)
    if (workspaceId === undefined) return undefined
  }
  let grantedPrincipalIds: PrincipalId[] | undefined
  if (value.grantedPrincipalIds !== undefined) {
    if (!Array.isArray(value.grantedPrincipalIds)) return undefined
    const parsed = value.grantedPrincipalIds.map(asPrincipalId)
    if (parsed.some(item => item === undefined) || new Set(parsed).size !== parsed.length) return undefined
    grantedPrincipalIds = parsed as PrincipalId[]
  }
  return {
    sessionId,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    createdByPrincipalId: owner,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(grantedPrincipalIds === undefined ? {} : { grantedPrincipalIds }),
  }
}

function parseDeviceBinding(value: unknown): DeviceBinding | undefined {
  if (!isRecord(value)) return undefined
  const deviceId = asDeviceId(value.deviceId)
  const principalId = asPrincipalId(value.principalId)
  if (deviceId === undefined || principalId === undefined || !validTime(value.createdAt) || !validTime(value.lastSeenAt)) return undefined
  let revokedAt: number | undefined
  if (value.revokedAt !== undefined) {
    if (!validTime(value.revokedAt)) return undefined
    revokedAt = value.revokedAt
  }
  let displayName: string | undefined
  if (value.displayName !== undefined) {
    if (typeof value.displayName !== 'string' || value.displayName.length > 128 || /[\u0000]/u.test(value.displayName)) return undefined
    displayName = value.displayName
  }
  return {
    deviceId,
    principalId,
    createdAt: value.createdAt,
    lastSeenAt: value.lastSeenAt,
    ...(displayName === undefined ? {} : { displayName }),
    ...(revokedAt === undefined ? {} : { revokedAt }),
  }
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

export function emptyOwnershipSnapshot(localPrincipal: Principal): OwnershipSnapshot {
  return {
    version: CURRENT_SCHEMA_VERSION,
    principals: [{ ...localPrincipal }],
    devices: [],
    grants: [],
    sessions: [],
  }
}

export function parseOwnershipSnapshot(value: unknown): ParseResult<OwnershipSnapshot> {
  const version = parseVersion(value)
  if (!version.ok) return version
  if (!isRecord(value) || !Array.isArray(value.principals) || !Array.isArray(value.devices) || !Array.isArray(value.grants) || !Array.isArray(value.sessions)) {
    return { ok: false, kind: 'invalid' }
  }
  const principals = value.principals.map(parsePrincipal)
  const devices = value.devices.map(parseDeviceBinding)
  const grants = value.grants.map(parseWorkspaceGrant)
  const sessions = value.sessions.map(parseSessionOwnership)
  if (principals.some(item => item === undefined) || devices.some(item => item === undefined) || grants.some(item => item === undefined) || sessions.some(item => item === undefined)) {
    return { ok: false, kind: 'invalid' }
  }
  const resolvedPrincipals = principals as Principal[]
  const resolvedDevices = devices as DeviceBinding[]
  const resolvedGrants = grants as WorkspaceGrant[]
  const resolvedSessions = sessions as SessionOwnership[]
  if (!unique(resolvedPrincipals.map(item => item.id)) || !unique(resolvedDevices.map(item => item.deviceId)) || !unique(resolvedGrants.map(item => `${item.principalId}:${item.workspaceId}`)) || !unique(resolvedSessions.map(item => item.sessionId))) {
    return { ok: false, kind: 'invalid' }
  }
  const principalIds = new Set(resolvedPrincipals.map(item => item.id))
  if (resolvedPrincipals.filter(item => item.kind === 'local-profile').length > 1) return { ok: false, kind: 'invalid' }
  if (
    resolvedDevices.some(item => !principalIds.has(item.principalId)) ||
    resolvedGrants.some(item => !principalIds.has(item.principalId)) ||
    resolvedSessions.some(item => !principalIds.has(item.createdByPrincipalId)) ||
    resolvedSessions.some(item => item.grantedPrincipalIds?.some(principalId => !principalIds.has(principalId)) === true)
  ) {
    return { ok: false, kind: 'invalid' }
  }
  return {
    ok: true,
    value: {
      version: CURRENT_SCHEMA_VERSION,
      principals: resolvedPrincipals,
      devices: resolvedDevices,
      grants: resolvedGrants,
      sessions: resolvedSessions,
    },
  }
}
