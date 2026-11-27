import type { MemoryPublicItem } from './schema.ts';
export type MemoryMatchReason = 'keyword' | 'vector' | 'tags' | 'pinned';
export interface MemoryActivity {
    status: 'disabled' | 'empty-query' | 'loading' | 'no-match' | 'ready' | 'none';
    preparedAt?: number;
    sessionId?: string;
    ignoredCount: number;
    items: {
        item: MemoryPublicItem;
        reason: 'content' | 'tag' | 'content-and-tag';
        truncated: boolean;
        score?: number;
        reasons?: readonly MemoryMatchReason[];
    }[];
}
//# sourceMappingURL=activity.d.ts.map