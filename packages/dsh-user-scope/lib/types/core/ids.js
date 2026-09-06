/** Opaque identifiers used by the shared user-scope authority. */
/** Deliberately excludes path separators, NUL, dot segments, and whitespace. */
export const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
function asOpaqueId(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128)
        return undefined;
    if (value === '.' || value === '..' || /[\\/\u0000\s]/u.test(value))
        return undefined;
    return OPAQUE_ID_PATTERN.test(value) ? value : undefined;
}
export function asPrincipalId(value) {
    return asOpaqueId(value);
}
export function asDeviceId(value) {
    return asOpaqueId(value);
}
export function asWorkspaceId(value) {
    return asOpaqueId(value);
}
export function asSessionId(value) {
    return asOpaqueId(value);
}
export function requirePrincipalId(value) {
    const result = asPrincipalId(value);
    if (result === undefined)
        throw new TypeError('invalid principal id');
    return result;
}
export function requireDeviceId(value) {
    const result = asDeviceId(value);
    if (result === undefined)
        throw new TypeError('invalid device id');
    return result;
}
export function requireWorkspaceId(value) {
    const result = asWorkspaceId(value);
    if (result === undefined)
        throw new TypeError('invalid workspace id');
    return result;
}
export function requireSessionId(value) {
    const result = asSessionId(value);
    if (result === undefined)
        throw new TypeError('invalid session id');
    return result;
}
