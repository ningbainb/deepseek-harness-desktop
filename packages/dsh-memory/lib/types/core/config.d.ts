export interface MemoryConfig {
    version: 1;
    enabled: boolean;
}
export declare const DEFAULT_MEMORY_CONFIG: MemoryConfig;
export declare function assertMemoryConfig(value: unknown): asserts value is MemoryConfig;
export declare function normalizeMemoryConfig(value: unknown): MemoryConfig;
//# sourceMappingURL=config.d.ts.map