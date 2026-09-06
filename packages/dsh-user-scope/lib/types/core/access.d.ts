import { decideAccess, type AccessDecision, type AccessResource } from './policy.ts';
import type { AccessScope, DeviceBinding, Principal, SessionOwnership, WorkspaceGrant, OwnershipSnapshot } from './schema.ts';
import type { PrincipalId, DeviceId, SessionId, WorkspaceId } from './ids.ts';
export { decideAccess };
export type { AccessDecision, AccessResource };
/** In-memory ownership registry; persistence is supplied by UserScopeStore. */
export declare class UserScopeRegistry {
    readonly localPrincipal: Principal;
    private state;
    constructor(localPrincipal: Principal, initial?: OwnershipSnapshot);
    snapshot(): OwnershipSnapshot;
    replace(next: OwnershipSnapshot): void;
    principal(principalId: PrincipalId): Principal | undefined;
    principalForDevice(deviceId: DeviceId): PrincipalId | undefined;
    device(deviceId: DeviceId): DeviceBinding | undefined;
    addPrincipal(principal: Principal): void;
    registerDevice(binding: DeviceBinding): void;
    touchDevice(deviceId: DeviceId, now: number): boolean;
    revokeDevice(deviceId: DeviceId, revokedAt: number): boolean;
    grantWorkspace(grant: WorkspaceGrant): void;
    revokeWorkspace(principalId: PrincipalId, workspaceId: WorkspaceId): boolean;
    registerSession(ownership: SessionOwnership): void;
    grantSession(principalId: PrincipalId, sessionId: SessionId): void;
    revokeSession(principalId: PrincipalId, sessionId: SessionId): boolean;
    removeSession(sessionId: SessionId): boolean;
    access(scope: AccessScope, resource: AccessResource): AccessDecision;
    visibleSessions(scope: AccessScope): SessionOwnership[];
}
//# sourceMappingURL=access.d.ts.map