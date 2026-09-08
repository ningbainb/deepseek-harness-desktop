import type { MemoryPublicItem } from './schema.ts';
export interface MemoryActivity {
    status: 'disabled' | 'empty-query' | 'loading' | 'no-match' | 'ready' | 'none';
    preparedAt?: number;
    sessionId?: string;
    ignoredCount: number;
    items: {
        item: MemoryPublicItem;
        reason: 'content' | 'tag' | 'content-and-tag';
        truncated: boolean;
    }[];
}
//# sourceMappingURL=activity.d.ts.map