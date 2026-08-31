const emittedDedupeKeys = new Set();
/**
 * Best-effort renderer-to-main bridge. The renderer can only construct the
 * closed TypeScript vocabulary above; Electron performs the runtime validation
 * again before passing an event to ProductMetricsRecorder.
 */
export function reportValueModeTelemetry(event, dedupeKey) {
    const bridge = typeof window === 'undefined'
        ? undefined
        : window.dshDesktop;
    if (typeof bridge?.recordValueModeEvent !== 'function')
        return;
    if (dedupeKey !== undefined && emittedDedupeKeys.has(dedupeKey))
        return;
    if (dedupeKey !== undefined) {
        emittedDedupeKeys.add(dedupeKey);
        // Hero and header observers can see the same preset transition on nearby
        // render ticks. Keep the suppression window short so a later deliberate
        // selection is still counted.
        setTimeout(() => emittedDedupeKeys.delete(dedupeKey), 1_000);
    }
    try {
        void Promise.resolve(bridge.recordValueModeEvent(event)).catch(() => { });
    }
    catch {
        // Product telemetry must never affect the settings or conversation UI.
    }
}
export function resetValueModeTelemetryDedupeForTests() {
    emittedDedupeKeys.clear();
}
