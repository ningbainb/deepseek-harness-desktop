import type { Context } from '@deepseek-ai/cordis';
import { type ChannelId, type ChannelStatusSnapshot, type DiagnosticEvent, type ImHubSettings } from '../core/settings.ts';
import { ApprovalBridge } from './core/approval-bridge.ts';
import { HarnessBridge, type TurnRunner } from './core/harness-bridge.ts';
import type { FetchLike, InboundMessage, WebSocketFactory, WebhookHttpInput, WebhookHttpOutput } from './core/types.ts';
export interface ImHubManagerOptions {
    ctx?: Context;
    initialSettings?: ImHubSettings;
    fetchImpl?: FetchLike;
    webSocketFactory?: WebSocketFactory;
    turnRunner?: TurnRunner;
    nowMs?: () => number;
}
export interface ImHubStateSnapshot {
    settings: ImHubSettings;
    channels: Record<ChannelId, ChannelStatusSnapshot>;
    events: DiagnosticEvent[];
    pendingApprovals: number;
    webhookEndpoints: {
        wecom: string;
        webhook: string;
    };
}
export declare class ImHubManager {
    private settings;
    private readonly queue;
    private readonly events;
    private readonly adapters;
    readonly approvalBridge: ApprovalBridge;
    readonly harnessBridge: HarnessBridge;
    private lastContextByConversation;
    private disposed;
    constructor(options?: ImHubManagerOptions);
    install(ctx: Context): () => void;
    getSettings(): ImHubSettings;
    applySettings(next: ImHubSettings): Promise<void>;
    restartChannel(channelId: ChannelId): Promise<ChannelStatusSnapshot>;
    testChannel(channelId: ChannelId): Promise<{
        ok: boolean;
        detail: string;
    }>;
    handleWebhook(channelId: 'wecom' | 'webhook', req: WebhookHttpInput): Promise<WebhookHttpOutput>;
    handleInbound(message: InboundMessage): Promise<void>;
    getStateSnapshot(): ImHubStateSnapshot;
    dispose(): Promise<void>;
    private pushEvent;
}
//# sourceMappingURL=hub.d.ts.map