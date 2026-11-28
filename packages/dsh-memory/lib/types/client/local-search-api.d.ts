import type { MemoryMatchReason } from '../core/activity.ts';
export interface IndexStatus {
    status: {
        counts: {
            memory: number;
            sessions: number;
            knowledge: number;
        };
        engine: 'fts5' | 'typescript';
        vectorCount: number;
    };
    workspaces: Array<{
        id: string;
        title: string;
    }>;
    sources: Array<{
        path: string;
        kind: 'path' | 'document';
    }>;
    indexing: boolean;
}
export interface SessionMatch {
    sessionId: string;
    seq: number;
    turn: number;
    title: string;
    excerpt: string;
    timestamp: number;
    reasons: readonly MemoryMatchReason[];
}
export declare const LOCAL_SEARCH_UPDATED_EVENT = "dsh:local-search-updated";
export declare function postLocalSearch<T>(operation: string, body: object, signal?: AbortSignal): Promise<T>;
export declare function notifyLocalSearchUpdated(): void;
//# sourceMappingURL=local-search-api.d.ts.map