import type { PrincipalId, SessionId, WorkspaceId } from './ids.ts';
import type { AccessScope, OwnershipSnapshot } from './schema.ts';
export type AccessResource = {
    kind: 'principal';
    principalId: PrincipalId;
} | {
    kind: 'workspace';
    workspaceId: WorkspaceId;
} | {
    kind: 'session';
    sessionId: SessionId;
};
export type AccessDeniedReason = 'scope-unavailable' | 'unknown-principal' | 'missing-device' | 'unknown-device' | 'revoked-device' | 'device-principal-mismatch' | 'unknown-resource' | 'other-principal' | 'missing-workspace-grant';
export type AccessDecision = {
    allowed: true;
    reason: 'allowed';
} | {
    allowed: false;
    reason: AccessDeniedReason;
};
/** Central authorization decision used by desktop and remote consumers. */
export declare function decideAccess(snapshot: OwnershipSnapshot, localPrincipalId: PrincipalId, scope: AccessScope, resource: AccessResource): AccessDecision;
//# sourceMappingURL=policy.d.ts.map