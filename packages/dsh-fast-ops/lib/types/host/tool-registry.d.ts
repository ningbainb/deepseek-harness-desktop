import type { Context } from '@deepseek-ai/cordis';
import { type AgentLike } from '../core/host-types.ts';
import type { FastOpsSettings } from '../core/settings.ts';
import { ResultCache } from './result-cache.ts';
export declare const RESIDENT_TOOLS: readonly ["fast_read_files", "fast_search", "fast_edit_batch", "fast_discover"];
export declare const SPECIALIZED_TOOLS: readonly ["fast_stat", "fast_diff", "fast_replace", "fast_read_table", "fast_result"];
export declare const ALL_FAST_OPS_TOOLS: readonly ["fast_read_files", "fast_search", "fast_edit_batch", "fast_discover", "fast_stat", "fast_diff", "fast_replace", "fast_read_table", "fast_result"];
export interface FastOpsCounters {
    batchCalls: number;
    filesReadInBatches: number;
    cacheSpills: number;
    toolsActivated: number;
}
export declare class FastOpsController {
    readonly cache: ResultCache;
    readonly counters: FastOpsCounters;
    private readonly activated;
    private readonly applied;
    private readonly liveAgents;
    private applying;
    private readonly ctx;
    private readonly getSettings;
    constructor(options: {
        ctx: Context;
        getSettings: () => FastOpsSettings;
    });
    private resolveWorkspaceRoot;
    private activatedSetFor;
    private denyListFor;
    private releaseAgent;
    applyToAgent(agent: AgentLike | undefined): void;
    reapply(agent?: AgentLike): void;
    mount(): () => void;
}
//# sourceMappingURL=tool-registry.d.ts.map