import type { AccessResource, AccessScope, PrincipalId, SessionId, UserScopeService, WorkspaceId } from '@ningbainb/dsh-user-scope';
import { type MemoryItem, type MemoryPublicItem, type MemoryScope, type MemorySnapshot, type MemorySource } from './schema.ts';
import { type RankedMemory } from './rank.ts';
import { MemoryStore } from '../store.ts';
import type { MemoryActivity } from './activity.ts';
export interface MemoryDraft {
    id?: string;
    scope: MemoryScope;
    workspaceId?: string;
    sessionId?: string;
    content: string;
    tags?: readonly string[];
    pinned?: boolean;
    expiresAt?: number;
    expectedUpdatedAt?: number;
}
export interface MemoryRequestContext {
    scope: AccessScope;
    workspaceId?: WorkspaceId;
    sessionId?: SessionId;
}
export type MemoryWarningCode = 'scope-unavailable' | 'access-denied' | 'store-unavailable' | 'invalid-target';
export interface MemoryWarning {
    readonly code: MemoryWarningCode;
}
export type MemoryReadResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    warning: MemoryWarning;
};
export declare class MemoryAccessError extends Error {
    readonly code: 'scope-unavailable' | 'access-denied' | 'invalid-target';
    constructor(code?: 'scope-unavailable' | 'access-denied' | 'invalid-target');
}
export declare class MemoryNotFoundError extends Error {
    constructor();
}
interface SessionOwnershipLike {
    sessionId: string;
    workspaceId?: string;
    createdByPrincipalId: string;
}
interface MemoryUserScopeLike {
    availabilityState(): string;
    localPrincipal(): {
        id: PrincipalId;
    };
    currentScope(): AccessScope | undefined;
    snapshot(): {
        sessions: readonly SessionOwnershipLike[];
    };
    canAccess(scope: AccessScope, resource: AccessResource): {
        allowed: boolean;
    };
}
export interface MemoryServiceOptions {
    userScope: Pick<UserScopeService, 'availabilityState' | 'localPrincipal' | 'currentScope' | 'snapshot' | 'canAccess'> | MemoryUserScopeLike;
    store?: MemoryStore;
    now?: () => number;
    resolveWorkspaceForSession?: (sessionId: string) => string | undefined;
    warningSink?: (warning: MemoryWarning) => void;
}
export interface PendingMemorySuggestion {
    readonly id: string;
    readonly item: MemoryPublicItem;
    readonly createdAt: number;
}
/**
 * Host-side memory service. It deliberately keeps a synchronous cache for
 * prompt assembly and a separate async path for settings/tools. A failed load
 * never replaces a principal's cache with another principal's data.
 */
export declare class MemoryService {
    readonly store: MemoryStore;
    private readonly now;
    private readonly userScope;
    private readonly resolveWorkspaceForSession?;
    private readonly warningSink?;
    private readonly cache;
    private readonly loading;
    private readonly loadedAt;
    private readonly generations;
    private readonly pending;
    private readonly activity;
    private readonly ignored;
    constructor(options: MemoryServiceOptions);
    desktopScope(): AccessScope | undefined;
    currentScope(): AccessScope | undefined;
    localContext(): MemoryRequestContext | undefined;
    contextForCurrentSession(sessionId: string): MemoryRequestContext | undefined;
    contextFor(scope: AccessScope, target?: {
        workspaceId?: string;
        sessionId?: string;
    }): MemoryRequestContext | undefined;
    preload(context: MemoryRequestContext): Promise<MemoryReadResult<MemorySnapshot>>;
    /** Read from the already-loaded owner cache; prompt providers never await I/O. */
    prepare(context: MemoryRequestContext, query: string, enabled: boolean): string;
    recentActivity(context: MemoryRequestContext, enabled: boolean): MemoryActivity;
    ignoreForSession(context: MemoryRequestContext, id: string | null): void;
    private activityKey;
    searchCached(context: MemoryRequestContext, query?: string): RankedMemory[] | undefined;
    list(context: MemoryRequestContext): Promise<MemoryReadResult<MemoryItem[]>>;
    search(context: MemoryRequestContext, query: string): Promise<MemoryReadResult<RankedMemory[]>>;
    save(context: MemoryRequestContext, draft: MemoryDraft, source?: MemorySource): Promise<MemoryItem>;
    remove(context: MemoryRequestContext, id: string, expectedUpdatedAt?: number): Promise<boolean>;
    clear(context: MemoryRequestContext): Promise<void>;
    /** Management can inspect all authorized scopes; model retrieval always stays scoped. */
    listManaged(context: MemoryRequestContext, refresh?: boolean): Promise<MemoryReadResult<MemoryItem[]>>;
    clearSelected(context: MemoryRequestContext, entries: {
        id: string;
        updatedAt: number;
    }[]): Promise<void>;
    private isLocalManager;
    suggest(context: MemoryRequestContext, draft: MemoryDraft): PendingMemorySuggestion;
    listPending(context: MemoryRequestContext): PendingMemorySuggestion[];
    confirm(context: MemoryRequestContext, id: string, replacement?: {
        id: string;
        updatedAt: number;
    }): Promise<MemoryItem>;
    cancel(context: MemoryRequestContext, id: string): boolean;
    toPublic(items: readonly MemoryItem[]): MemoryPublicItem[];
    private queryFor;
    private targetContext;
    private authorizedContext;
    private readForMutation;
    private sessionOwnership;
    private allowed;
    private loadPrincipal;
    private invalidate;
    private publish;
    private denied;
    private report;
}
export {};
//# sourceMappingURL=service.d.ts.map