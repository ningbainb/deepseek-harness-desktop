export interface MirrorCandidate {
    readonly id: string;
    readonly label: string;
    readonly indexUrl: string;
    readonly official: boolean;
}
export interface WheelEntry {
    readonly filename: string;
    readonly version: string;
    readonly url: string;
}
export interface MirrorProbeResult {
    readonly id: string;
    readonly label: string;
    readonly indexUrl: string;
    readonly official: boolean;
    readonly ok: boolean;
    readonly indexMs?: number;
    readonly downloadMs?: number;
    readonly bytes?: number;
    readonly speedBps?: number;
    readonly version?: string;
    readonly error?: string;
}
export interface ProbeMirrorsOptions {
    version?: string | null;
    timeoutMs?: number;
    sampleBytes?: number;
    concurrency?: number;
    fetchImpl?: typeof fetch;
    candidates?: readonly MirrorCandidate[];
}
export declare const MIRROR_CANDIDATES: readonly MirrorCandidate[];
export declare function projectIndexUrl(indexUrl: string, project?: string): string;
/** Parse PEP 503 Simple API links for wheels or source archives. */
export declare function parseSimpleIndex(html: string, baseUrl: string): WheelEntry[];
export declare function pickWheelEntry(entries: readonly WheelEntry[], version?: string | null): WheelEntry | null;
/** Rank mirrors by throughput descending then index latency ascending, keeping official fallback last. */
export declare function probeMirrors(options?: ProbeMirrorsOptions): Promise<MirrorProbeResult[]>;
//# sourceMappingURL=mirrors.d.ts.map