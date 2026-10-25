import type { ClientModuleSystem } from '@deepseek-ai/dsh-client-modules/client';
export interface BridgeOptions {
    entries: Pick<ClientModuleSystem['entries'], 'sync' | 'reload'>;
    fetch: typeof globalThis.fetch;
    report(message: string): void;
    retryDelayMs?: number;
}
export declare function startClientBridge(options: BridgeOptions): () => void;
//# sourceMappingURL=bridge.d.ts.map