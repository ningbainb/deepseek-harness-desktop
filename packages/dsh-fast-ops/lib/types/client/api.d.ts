import type { FastOpsSettings } from '../core/settings.ts';
export interface FastOpsStateResponse {
    settings: FastOpsSettings;
    astAvailable: boolean;
    counters: {
        batchCalls: number;
        filesReadInBatches: number;
        cacheSpills: number;
        toolsActivated: number;
        astCalls: number;
        denoiseTokensSaved: number;
    };
    cache: {
        totalRefs: number;
        totalBytes: number;
        totalItems: number;
    };
}
export declare function fetchFastOpsState(): Promise<FastOpsStateResponse>;
export declare function saveFastOpsSettings(settings: FastOpsSettings): Promise<{
    settings: FastOpsSettings;
    problems: string[];
}>;
export declare function reclaimFastOpsCache(): Promise<{
    reclaimed: number;
    cache: FastOpsStateResponse['cache'];
}>;
//# sourceMappingURL=api.d.ts.map