export declare const VALUE_MODE_RUNTIME_TELEMETRY_PREFIX = "DSH_VALUE_MODE_METRIC ";
export type ValueModeRuntimeTelemetry = {
    event: 'call';
    outcome: 'started' | 'failed';
    role: 'controller' | 'subagent';
};
/**
 * Send only a fixed, privacy-safe route marker to the Desktop main process.
 * Product transport remains owned by Electron; this plugin never performs a
 * network request and never writes model, session, prompt, or error details.
 */
export declare function emitValueModeRuntimeTelemetry(payload: ValueModeRuntimeTelemetry): void;
//# sourceMappingURL=runtime-telemetry.d.ts.map