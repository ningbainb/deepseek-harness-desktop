import { type DeviceId, type PrincipalId, type SessionId, type WorkspaceId } from './ids.ts';
export declare const CURRENT_SCHEMA_VERSION: 1;
export type PrincipalKind = 'local-profile' | 'paired-device';
export interface Principal {
    id: PrincipalId;
    kind: PrincipalKind;
    createdAt: number;
}
export interface PrincipalFile {
    version: typeof CURRENT_SCHEMA_VERSION;
    principal: Principal;
}
export interface WorkspaceGrant {
    principalId: PrincipalId;
    workspaceId: WorkspaceId;
    permission: 'use';
    createdAt: number;
}
export interface SessionOwnership {
    sessionId: SessionId;
    workspaceId?: WorkspaceId;
    createdByPrincipalId: PrincipalId;
    createdAt: number;
    updatedAt: number;
    grantedPrincipalIds?: PrincipalId[];
}
export interface DeviceBinding {
    deviceId: DeviceId;
    principalId: PrincipalId;
    createdAt: number;
    lastSeenAt: number;
    displayName?: string;
    revokedAt?: number;
}
export interface OwnershipSnapshot {
    version: typeof CURRENT_SCHEMA_VERSION;
    principals: Principal[];
    devices: DeviceBinding[];
    grants: WorkspaceGrant[];
    sessions: SessionOwnership[];
}
export interface AccessScope {
    principalId: PrincipalId;
    deviceId?: DeviceId;
    source: 'desktop' | 'remote';
}
export type ParseFailure = {
    ok: false;
    kind: 'unsupported-version';
    version: number;
} | {
    ok: false;
    kind: 'invalid';
};
export type ParseResult<T> = {
    ok: true;
    value: T;
} | ParseFailure;
export declare function parsePrincipalFile(value: unknown): ParseResult<PrincipalFile>;
export declare function emptyOwnershipSnapshot(localPrincipal: Principal): OwnershipSnapshot;
export declare function parseOwnershipSnapshot(value: unknown): ParseResult<OwnershipSnapshot>;
//# sourceMappingURL=schema.d.ts.map