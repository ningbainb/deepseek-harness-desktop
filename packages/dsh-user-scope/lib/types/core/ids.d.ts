/** Opaque identifiers used by the shared user-scope authority. */
declare const principalIdBrand: unique symbol;
declare const deviceIdBrand: unique symbol;
declare const workspaceIdBrand: unique symbol;
declare const sessionIdBrand: unique symbol;
export type PrincipalId = string & {
    readonly [principalIdBrand]: true;
};
export type DeviceId = string & {
    readonly [deviceIdBrand]: true;
};
export type WorkspaceId = string & {
    readonly [workspaceIdBrand]: true;
};
export type SessionId = string & {
    readonly [sessionIdBrand]: true;
};
/** Deliberately excludes path separators, NUL, dot segments, and whitespace. */
export declare const OPAQUE_ID_PATTERN: RegExp;
export declare function asPrincipalId(value: unknown): PrincipalId | undefined;
export declare function asDeviceId(value: unknown): DeviceId | undefined;
export declare function asWorkspaceId(value: unknown): WorkspaceId | undefined;
export declare function asSessionId(value: unknown): SessionId | undefined;
export declare function requirePrincipalId(value: unknown): PrincipalId;
export declare function requireDeviceId(value: unknown): DeviceId;
export declare function requireWorkspaceId(value: unknown): WorkspaceId;
export declare function requireSessionId(value: unknown): SessionId;
export {};
//# sourceMappingURL=ids.d.ts.map