export declare const VALUE_MODE_RUNTIME_TELEMETRY_PREFIX = "DSH_VALUE_MODE_METRIC ";
export type RouteParameters = {
    role: 'main' | 'subagent';
    result: 'started' | 'success' | 'failure' | 'cancelled';
    strategy: 'saving' | 'balanced' | 'stronger' | 'unknown';
    model: string;
    error_type: 'none' | 'auth' | 'rate_limit' | 'timeout' | 'network' | 'provider' | 'invalid_request' | 'cancelled' | 'unknown';
};
export type ValueModeRuntimeTelemetry = {
    event: 'call';
    outcome: 'started' | 'failed';
    role: 'controller' | 'subagent';
} | {
    event: 'cost_mode_route';
    params: RouteParameters;
    timestamp: string;
};
export declare function routeErrorType(failure: unknown): RouteParameters['error_type'];
export declare function routeParameters(role: 'main' | 'subagent', strategy: string, model: string): RouteParameters;
/**
 * Send only a fixed, privacy-safe route marker to the Desktop main process.
 * Product transport remains owned by Electron; this plugin never performs a
 * network request. Only bounded model IDs and error categories leave the host;
 * session IDs, provider error text, prompts and credentials are excluded.
 */
export declare function emitValueModeRuntimeTelemetry(payload: ValueModeRuntimeTelemetry): void;
//# sourceMappingURL=runtime-telemetry.d.ts.map