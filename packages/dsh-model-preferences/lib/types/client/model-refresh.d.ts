/** Event-driven model reconciliation for visible Desktop renderer windows. */
export declare const MODEL_REFRESH_CHANNEL = "dsh-model-selection-confirmed-v1";
interface ChannelLike {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage(value: unknown): void;
    close(): void;
}
export interface ModelRefreshBridgeOptions {
    sessionId: string;
    refresh(): void;
    windowTarget?: EventTarget;
    documentTarget?: EventTarget & {
        visibilityState?: string;
    };
    channelFactory?: (name: string) => ChannelLike;
    schedule?: (callback: () => void) => void;
    now?: () => number;
    minIntervalMs?: number;
}
/**
 * Re-read confirmed host state on visibility/network recovery and after a
 * sibling Desktop window confirms a selection. This owns no polling timer.
 */
export declare function installModelRefreshBridge(options: ModelRefreshBridgeOptions): {
    announce(): void;
    dispose(): void;
};
export {};
//# sourceMappingURL=model-refresh.d.ts.map