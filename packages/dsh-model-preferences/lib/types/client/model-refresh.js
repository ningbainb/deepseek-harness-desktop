/** Event-driven model reconciliation for visible Desktop renderer windows. */
export const MODEL_REFRESH_CHANNEL = 'dsh-model-selection-confirmed-v1';
/**
 * Re-read confirmed host state on visibility/network recovery and after a
 * sibling Desktop window confirms a selection. This owns no polling timer.
 */
export function installModelRefreshBridge(options) {
    const windowTarget = options.windowTarget ?? window;
    const documentTarget = options.documentTarget ?? document;
    const schedule = options.schedule ?? queueMicrotask;
    const now = options.now ?? Date.now;
    const minIntervalMs = options.minIntervalMs ?? 30_000;
    if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0 || minIntervalMs > 10 * 60_000) {
        throw new TypeError('model refresh minimum interval is invalid');
    }
    const channelFactory = options.channelFactory ?? (typeof BroadcastChannel === 'function' ? name => new BroadcastChannel(name) : undefined);
    let disposed = false;
    let queued = false;
    // ModelSelect performs the initial read before this bridge mounts. Treat the
    // bridge installation as that read's timestamp so the focus event caused by
    // opening the window does not immediately start a duplicate catalog load.
    let lastRefreshAt = now();
    const requestRefresh = (force = false) => {
        if (disposed || queued)
            return;
        if (!force && now() - lastRefreshAt < minIntervalMs)
            return;
        queued = true;
        schedule(() => {
            queued = false;
            if (!disposed) {
                lastRefreshAt = now();
                options.refresh();
            }
        });
    };
    const onVisible = () => {
        if (documentTarget.visibilityState === undefined || documentTarget.visibilityState === 'visible')
            requestRefresh();
    };
    const onRecovery = () => requestRefresh();
    documentTarget.addEventListener('visibilitychange', onVisible);
    windowTarget.addEventListener('focus', onRecovery);
    windowTarget.addEventListener('online', onRecovery);
    let channel;
    try {
        channel = channelFactory?.(MODEL_REFRESH_CHANNEL);
        if (channel !== undefined) {
            channel.onmessage = event => {
                const message = event.data;
                if (typeof message === 'object' && message !== null
                    && message.sessionId === options.sessionId)
                    requestRefresh(true);
            };
        }
    }
    catch {
        channel = undefined;
    }
    return {
        announce: () => {
            try {
                channel?.postMessage({ sessionId: options.sessionId });
            }
            catch { /* another renderer still reloads on focus */ }
        },
        dispose: () => {
            if (disposed)
                return;
            disposed = true;
            documentTarget.removeEventListener('visibilitychange', onVisible);
            windowTarget.removeEventListener('focus', onRecovery);
            windowTarget.removeEventListener('online', onRecovery);
            if (channel !== undefined) {
                channel.onmessage = null;
                try {
                    channel.close();
                }
                catch { /* already closed */ }
            }
        },
    };
}
