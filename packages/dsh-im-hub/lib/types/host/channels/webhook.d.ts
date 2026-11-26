import type { ChannelStatusSnapshot, WebhookChannelConfig } from '../../core/settings.ts';
import type { ChannelAdapter, FetchLike, InboundMessage, OutboundReply, WebhookHttpInput, WebhookHttpOutput } from './../core/types.ts';
export interface GenericWebhookAdapterOptions {
    getConfig: () => WebhookChannelConfig;
    onMessage: (message: InboundMessage) => Promise<void> | void;
    onEvent?: (level: 'info' | 'warn' | 'error', message: string) => void;
    fetchImpl?: FetchLike;
    nowMs?: () => number;
}
export declare function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string;
export declare function verifyWebhookSignature(options: {
    secret: string;
    timestamp: string | undefined;
    signature: string | undefined;
    rawBody: string;
    nowMs?: number;
    replayWindowSec?: number;
}): {
    ok: boolean;
    reason?: string;
};
export declare class GenericWebhookAdapter implements ChannelAdapter {
    readonly id: "webhook";
    private readonly getConfig;
    private readonly onMessage;
    private readonly onEvent?;
    private readonly fetchImpl;
    private readonly nowMs;
    private readonly dedupIds;
    private status;
    constructor(options: GenericWebhookAdapterOptions);
    getStatus(): ChannelStatusSnapshot;
    start(): Promise<void>;
    stop(): Promise<void>;
    send(conversationId: string, reply: OutboundReply): Promise<void>;
    handleWebhook(req: WebhookHttpInput): Promise<WebhookHttpOutput>;
    testConnection(): Promise<{
        ok: boolean;
        detail: string;
    }>;
    private recordSeen;
}
//# sourceMappingURL=webhook.d.ts.map