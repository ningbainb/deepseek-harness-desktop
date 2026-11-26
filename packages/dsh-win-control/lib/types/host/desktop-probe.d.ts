import { spawn } from 'node:child_process';
export declare const UPSTREAM_UIA_ISSUE = "https://github.com/CursorTouch/Windows-MCP/issues/607";
export declare const PROBE_TIMEOUT_MS = 6000;
export interface DesktopProbeMeasurement {
    readonly uiaWindows: number | null;
    readonly windowHandles: number | null;
    readonly displayScale: number | null;
}
export type DesktopProbeOutcome = DesktopProbeMeasurement | {
    readonly error: string;
} | {
    readonly skipped: string;
};
/** Read the last valid JSON metrics object from probe stdout. */
export declare function parseProbeOutput(text: string): DesktopProbeMeasurement | null;
/** Format a probe outcome and emit actionable UIA/DPI advisories. */
export declare function describeProbe(probe: DesktopProbeOutcome | null | undefined): {
    line: string;
    notes: string[];
};
/** Run the read-only desktop UIA & DPI probe once without throwing. */
export declare function probeDesktop(options?: {
    timeoutMs?: number;
    platform?: NodeJS.Platform;
    spawnImpl?: typeof spawn;
}): Promise<DesktopProbeOutcome>;
//# sourceMappingURL=desktop-probe.d.ts.map