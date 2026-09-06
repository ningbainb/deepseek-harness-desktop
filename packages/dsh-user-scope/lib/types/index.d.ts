import { Context, Service } from '@deepseek-ai/cordis';
import { type DeviceId, type PrincipalId } from './core/ids.ts';
import { type AccessDecision, type AccessResource } from './core/access.ts';
import { type AccessScope, type Principal, type SessionOwnership } from './core/schema.ts';
import { UserScopeRequestContext } from './context.ts';
import { UserScopeStore, type UserScopeStoreOptions } from './store.ts';
export type { AccessDecision, AccessResource } from './core/access.ts';
export type { AccessScope, DeviceBinding, Principal, SessionOwnership } from './core/schema.ts';
export type { DeviceId, PrincipalId, SessionId, WorkspaceId } from './core/ids.ts';
export type { OwnershipSnapshot, PrincipalKind, PrincipalFile, WorkspaceGrant, } from './core/schema.ts';
export { asDeviceId, asPrincipalId, asSessionId, asWorkspaceId, requireDeviceId, requirePrincipalId, requireSessionId, requireWorkspaceId, OPAQUE_ID_PATTERN, } from './core/ids.ts';
export { decideAccess, UserScopeRegistry } from './core/access.ts';
export { UserScopeRequestContext } from './context.ts';
export { USER_SCOPE_DIR_MODE, USER_SCOPE_FILE_MODE, CorruptUserScopeError, UnsupportedSchemaVersionError, UserScopeStore, UserScopeStoreError, } from './store.ts';
export type { UserScopeStoreOptions } from './store.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        userScope: UserScopeService;
    }
}
export declare const name = "user-scope";
export declare const inject: string[];
export interface UserScopeConfig extends UserScopeStoreOptions {
    now?: () => number;
}
export interface BoundDevice {
    deviceId: DeviceId;
    principalId: PrincipalId;
}
export type UserScopeAvailability = 'loading' | 'ready' | 'blocked';
export declare class UserScopeUnavailableError extends Error {
    constructor();
}
/** Host service shared by remote isolation, personal Prompt, and memory. */
export declare class UserScopeService extends Service {
    static inject: string[];
    readonly store: UserScopeStore;
    readonly requests: UserScopeRequestContext;
    private readonly now;
    private localPrincipalValue;
    private registryValue;
    private availability;
    private bootError;
    private readonly bootPromise;
    constructor(ctx: Context, config?: UserScopeConfig);
    ready(): Promise<void>;
    availabilityState(): UserScopeAvailability;
    diagnostics(): {
        state: UserScopeAvailability;
        principalId: PrincipalId;
        errorCode?: string;
    };
    localPrincipal(): Principal;
    snapshot(): import("./index.ts").OwnershipSnapshot;
    currentScope(): AccessScope | undefined;
    /** The local profile scope used by unscoped Host lifecycle events. */
    desktopScope(): AccessScope | undefined;
    run<T>(scope: AccessScope, callback: () => T): T;
    canAccess(scope: AccessScope, resource: AccessResource): AccessDecision;
    visibleSessions(scope: AccessScope): SessionOwnership[];
    principalForDevice(deviceId: string): PrincipalId | undefined;
    touchDevice(deviceId: string): boolean;
    bindDevice(deviceId: string, displayName?: string): Promise<BoundDevice>;
    revokeDevice(deviceId: string): Promise<boolean>;
    grantWorkspace(principalId: string, workspaceId: string): Promise<void>;
    revokeWorkspace(principalId: string, workspaceId: string): Promise<boolean>;
    grantSession(principalId: string, sessionId: string): Promise<void>;
    revokeSession(principalId: string, sessionId: string): Promise<boolean>;
    registerSession(input: {
        sessionId: string;
        workspaceId?: string;
        createdByPrincipalId?: string;
        createdAt?: number;
    }): Promise<void>;
    removeSession(sessionId: string): Promise<boolean>;
    private newPrincipal;
    private bootstrap;
    private requireReady;
    private commit;
}
/** Cordis plugin entry; the service registration is intentionally host-only. */
export declare function apply(ctx: Context, config?: UserScopeConfig): void;
//# sourceMappingURL=index.d.ts.map