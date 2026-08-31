export const VALUE_MODE_RUNTIME_TELEMETRY_PREFIX = 'DSH_VALUE_MODE_METRIC ';
/**
 * Send only a fixed, privacy-safe route marker to the Desktop main process.
 * Product transport remains owned by Electron; this plugin never performs a
 * network request and never writes model, session, prompt, or error details.
 */
export function emitValueModeRuntimeTelemetry(payload) {
    const runtimeProcess = globalThis.process;
    if (runtimeProcess?.env?.DSH_DESKTOP_PRODUCT_METRICS_BRIDGE !== '1' || typeof runtimeProcess.stdout?.write !== 'function')
        return;
    try {
        runtimeProcess.stdout.write(`${VALUE_MODE_RUNTIME_TELEMETRY_PREFIX}${JSON.stringify(payload)}\n`);
    }
    catch {
        // Telemetry must never change routing behavior.
    }
}
