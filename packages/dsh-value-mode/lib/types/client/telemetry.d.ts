export type ValueModeProductTelemetryEvent = {
    kind: 'entry';
    configured: boolean;
} | {
    kind: 'onboarding';
    outcome: 'shown' | 'completed' | 'dismissed' | 'failed';
    surface: 'hero' | 'header' | 'settings';
} | {
    kind: 'state';
    state: 'enabled' | 'disabled' | 'failed';
    source: 'onboarding' | 'manual' | 'auto' | 'settings';
} | {
    kind: 'strategy';
    strategy: 'saver' | 'balanced' | 'powerful';
};
/**
 * Best-effort renderer-to-main bridge. The renderer can only construct the
 * closed TypeScript vocabulary above; Electron performs the runtime validation
 * again before passing an event to ProductMetricsRecorder.
 */
export declare function reportValueModeTelemetry(event: ValueModeProductTelemetryEvent, dedupeKey?: string): void;
export declare function resetValueModeTelemetryDedupeForTests(): void;
//# sourceMappingURL=telemetry.d.ts.map