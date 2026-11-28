import { type FastOpsStateResponse } from './api.ts';
import { type FastOpsLocaleKey } from './locales.ts';
export interface LiveTokenProjectionLike {
    uncachedInputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface FastOpsDockBadgeProps {
    t?: (key: FastOpsLocaleKey) => string;
    useProjection?: (key: string) => LiveTokenProjectionLike | undefined;
}
export type FastOpsBadgeCounters = FastOpsStateResponse['counters'];
export interface FastOpsBadgeSummary {
    active: boolean;
    totalSaved: number;
    label: string;
}
/** Format a token count with compact B/M/K suffixes matching the bottom stats row. */
export declare function formatCompactTokens(value: number): string;
/** Derive compact badge copy and active emphasis state from fast-ops counters. */
export declare function summarizeFastOpsBadge(counters: Partial<FastOpsBadgeCounters> | undefined, t?: (key: FastOpsLocaleKey) => string): FastOpsBadgeSummary;
/** Render the always-visible nbfast savings pill and breakdown popover in the composer dock. */
export declare const FastOpsDockBadge: import("react").MemoExoticComponent<({ t, useProjection, }: FastOpsDockBadgeProps) => import("react").JSX.Element | null>;
//# sourceMappingURL=FastOpsDockBadge.d.ts.map