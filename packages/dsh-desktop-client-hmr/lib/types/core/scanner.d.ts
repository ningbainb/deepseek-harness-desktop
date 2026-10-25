export interface BundleMetadata {
    readonly mtimeMs: number;
    readonly ctimeMs: number;
    readonly size: number;
}
export interface BundleBaseline extends BundleMetadata {
    readonly path: string;
}
export interface WatcherOptions {
    snapshot(): Iterable<readonly [string, BundleBaseline]>;
    stat(path: string): Promise<BundleMetadata>;
    publish(id: string): BundleBaseline | undefined;
    schedule(callback: () => void, milliseconds: number): () => void;
    yieldControl(): Promise<void>;
    report(error: unknown): void;
    pollIntervalMs: number;
}
export declare function createBundleWatcher(options: WatcherOptions): {
    refresh: () => void;
    dispose(): void;
};
//# sourceMappingURL=scanner.d.ts.map