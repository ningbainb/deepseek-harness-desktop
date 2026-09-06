import type { PrincipalId, SessionId, WorkspaceId } from '@ningbainb/dsh-user-scope';
export declare const MEMORY_SCHEMA_VERSION: 1;
export declare const MEMORY_SETTINGS_NAMESPACE = "memory";
export declare const MAX_MEMORY_CONTENT_LENGTH = 2000;
export declare const MAX_MEMORY_TAGS = 10;
export declare const MAX_MEMORY_TAG_LENGTH = 64;
export declare const MAX_MEMORY_ITEMS = 2000;
export declare const MAX_MEMORY_INJECTION_ITEMS = 5;
export declare const MAX_MEMORY_INJECTION_LENGTH = 2000;
export declare const MAX_MEMORY_QUERY_LENGTH = 4000;
export declare const MAX_PENDING_MEMORY_SUGGESTIONS = 32;
export declare const MAX_MEMORY_ID_LENGTH = 128;
export type MemoryScope = 'global' | 'workspace' | 'session';
export type MemorySource = 'explicit' | 'confirmed-suggestion';
export interface MemoryItem {
    id: string;
    principalId: PrincipalId;
    scope: MemoryScope;
    workspaceId?: WorkspaceId;
    sessionId?: SessionId;
    content: string;
    tags: string[];
    pinned: boolean;
    source: MemorySource;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
}
export interface MemorySnapshot {
    version: typeof MEMORY_SCHEMA_VERSION;
    items: MemoryItem[];
}
export interface MemoryItemInput {
    id?: string;
    principalId: PrincipalId;
    scope: MemoryScope;
    workspaceId?: WorkspaceId;
    sessionId?: SessionId;
    content: string;
    tags?: readonly string[];
    pinned?: boolean;
    source: MemorySource;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
}
export interface MemoryPublicItem {
    id: string;
    scope: MemoryScope;
    workspaceId?: string;
    sessionId?: string;
    content: string;
    tags: string[];
    pinned: boolean;
    source: MemorySource;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
}
export declare const MEMORY_SENSITIVE_MESSAGE = "\u6B64\u5185\u5BB9\u770B\u8D77\u6765\u5305\u542B\u51ED\u636E\uFF0C\u4E0D\u5EFA\u8BAE\u4FDD\u5B58\u4E3A\u957F\u671F\u8BB0\u5FC6\u3002";
export declare class MemoryValidationError extends Error {
    readonly code: 'invalid' | 'sensitive' | 'capacity';
    constructor(message: string, code?: 'invalid' | 'sensitive' | 'capacity');
}
export declare function isSafeMemoryId(value: unknown): value is string;
export declare function isMemoryScope(value: unknown): value is MemoryScope;
export declare function isMemorySource(value: unknown): value is MemorySource;
/** Detect obvious credentials without returning or logging the matched text. */
export declare function containsSensitiveMemoryContent(content: string): boolean;
export declare function emptyMemorySnapshot(): MemorySnapshot;
/** Normalize a storage value by dropping malformed rows and bounding the list. */
export declare function normalizeMemorySnapshot(value: unknown, expectedPrincipalId?: PrincipalId): MemorySnapshot;
export declare function assertMemoryItem(value: unknown, expectedPrincipalId?: PrincipalId): asserts value is MemoryItem;
export declare function assertMemorySnapshot(value: unknown, expectedPrincipalId?: PrincipalId): asserts value is MemorySnapshot;
export declare function createMemoryItem(input: MemoryItemInput): MemoryItem;
export declare function toPublicMemoryItem(item: MemoryItem): MemoryPublicItem;
//# sourceMappingURL=schema.d.ts.map