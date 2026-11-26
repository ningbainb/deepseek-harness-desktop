export interface StorageReference {
    readonly refId: string;
    readonly createdAt: number;
    readonly ttlMs: number;
    readonly producerTool: string;
    readonly totalItems: number;
    readonly totalBytes: number;
    readonly preview: string;
}
export interface PageResult {
    readonly ok: boolean;
    readonly refId: string;
    readonly items?: readonly Record<string, unknown>[];
    readonly totalFiltered?: number;
    readonly offset?: number;
    readonly nextOffset?: number | null;
    readonly complete?: boolean;
    readonly error?: string;
}
export declare class ResultCache {
    private readonly entries;
    private totalBytes;
    private readonly getMaxRefs;
    private readonly now;
    constructor(options?: {
        getMaxRefs?: () => number;
        now?: () => number;
    });
    private isExpired;
    private deleteEntry;
    private prune;
    put(params: {
        sessionId: string;
        producerTool: string;
        items: readonly Record<string, unknown>[];
        ttlMs: number;
        preview?: string;
    }): StorageReference;
    page(params: {
        sessionId: string;
        refId: string;
        offset?: number;
        limit?: number;
        maxBytes?: number;
        fields?: readonly string[];
        equals?: Record<string, unknown>;
    }): PageResult;
    release(sessionId: string, refId: string): boolean;
    clearSession(sessionId: string): number;
    reclaimAll(): number;
    stats(): {
        totalRefs: number;
        totalBytes: number;
        totalItems: number;
    };
}
//# sourceMappingURL=result-cache.d.ts.map