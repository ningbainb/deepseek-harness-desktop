/** Opaque identifiers used by the shared user-scope authority. */

declare const principalIdBrand: unique symbol
declare const deviceIdBrand: unique symbol
declare const workspaceIdBrand: unique symbol
declare const sessionIdBrand: unique symbol

export type PrincipalId = string & { readonly [principalIdBrand]: true }
export type DeviceId = string & { readonly [deviceIdBrand]: true }
export type WorkspaceId = string & { readonly [workspaceIdBrand]: true }
export type SessionId = string & { readonly [sessionIdBrand]: true }

/** Deliberately excludes path separators, NUL, dot segments, and whitespace. */
export const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

function asOpaqueId<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return undefined
  if (value === '.' || value === '..' || /[\\/\u0000\s]/u.test(value)) return undefined
  return OPAQUE_ID_PATTERN.test(value) ? value as T : undefined
}

export function asPrincipalId(value: unknown): PrincipalId | undefined {
  return asOpaqueId<PrincipalId>(value)
}

export function asDeviceId(value: unknown): DeviceId | undefined {
  return asOpaqueId<DeviceId>(value)
}

export function asWorkspaceId(value: unknown): WorkspaceId | undefined {
  return asOpaqueId<WorkspaceId>(value)
}

export function asSessionId(value: unknown): SessionId | undefined {
  return asOpaqueId<SessionId>(value)
}

export function requirePrincipalId(value: unknown): PrincipalId {
  const result = asPrincipalId(value)
  if (result === undefined) throw new TypeError('invalid principal id')
  return result
}

export function requireDeviceId(value: unknown): DeviceId {
  const result = asDeviceId(value)
  if (result === undefined) throw new TypeError('invalid device id')
  return result
}

export function requireWorkspaceId(value: unknown): WorkspaceId {
  const result = asWorkspaceId(value)
  if (result === undefined) throw new TypeError('invalid workspace id')
  return result
}

export function requireSessionId(value: unknown): SessionId {
  const result = asSessionId(value)
  if (result === undefined) throw new TypeError('invalid session id')
  return result
}
