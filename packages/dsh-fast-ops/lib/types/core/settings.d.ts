export declare const PACKAGE_ID = "@ningbainb/dsh-fast-ops";
export declare const ROUTE_PREFIX = "/api/dsh-fast-ops";
export declare const SETTINGS_FILE = "dsh-fast-ops.settings.json";
export declare const SETTINGS_VERSION = 1;
export declare const INLINE_BYTE_OPTIONS: readonly [8192, 16384, 32768, 65536];
export declare const TTL_MS_OPTIONS: readonly [900000, 3600000, 21600000];
export interface FastOpsSettings {
    version: number;
    enabled: boolean;
    lazySpecializedTools: boolean;
    batchingGuidance: boolean;
    maxInlineBytes: number;
    resultCacheTtlMs: number;
    maxCachedRefs: number;
    denoise: {
        enabled: boolean;
        git: boolean;
        test: boolean;
        build: boolean;
    };
}
export declare function defaultSettings(): FastOpsSettings;
/** Coerce arbitrary settings input into valid clamped FastOpsSettings. */
export declare function normalizeSettings(input: unknown): {
    settings: FastOpsSettings;
    problems: string[];
};
//# sourceMappingURL=settings.d.ts.map