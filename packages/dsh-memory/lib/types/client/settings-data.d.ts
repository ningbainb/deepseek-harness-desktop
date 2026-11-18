import type { MemoryPublicItem, MemoryScope } from '../core/schema.ts';
export interface PendingMemoryItem {
    id: string;
    item: MemoryPublicItem;
    createdAt: number;
}
export interface MemoryCatalog {
    items: MemoryPublicItem[];
    pending: PendingMemoryItem[];
}
export declare function isMemoryItem(value: unknown): value is MemoryPublicItem;
export declare function memoryRequestErrorCode(reason: unknown): unknown;
export declare function readMemoryCatalog(signal: AbortSignal): Promise<MemoryCatalog>;
export declare function postMemoryJson(path: string, body: unknown): Promise<Record<string, unknown>>;
export declare function filterMemoryItems(items: readonly MemoryPublicItem[], scope: MemoryScope | 'all', query: string): MemoryPublicItem[];
//# sourceMappingURL=settings-data.d.ts.map