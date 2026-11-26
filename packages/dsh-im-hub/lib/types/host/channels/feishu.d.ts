import type { ChannelStatusSnapshot, FeishuChannelConfig } from '../../core/settings.ts';
import type { ChannelAdapter, FetchLike, InboundMessage, OutboundReply, WebSocketFactory } from './../core/types.ts';
export interface FeishuAdapterOptions {
    getConfig: () => FeishuChannelConfig;
    onMessage: (message: InboundMessage) => Promise<void> | void;
    onEvent?: (level: 'info' | 'warn' | 'error', message: string) => void;
    fetchImpl?: FetchLike;
    webSocketFactory?: WebSocketFactory;
}
export declare function resolveFeishuBaseUrl(domain: FeishuChannelConfig['domain']): string;
export declare function extractFeishuTextContent(rawContent: string | undefined): string;
export declare class FeishuAdapter implements ChannelAdapter {
    readonly id: "feishu";
    private readonly getConfig;
    private readonly onMessage;
    private readonly onEvent?;
    private readonly fetchImpl;
    private readonly webSocketFactory;
    private tokenCache;
    private ws;
    private pingTimer;
    private reconnectTimer;
    private stopping;
    private reconnectAttempts;
    private readonly dedupIds;
    private status;
    constructor(options: FeishuAdapterOptions);
    getStatus(): ChannelStatusSnapshot;
    start(): Promise<void>;
    stop(): Promise<void>;
    fetchTenantAccessToken(cfg?: FeishuChannelConfig): Promise<string>;
    send(conversationId: string, reply: OutboundReply): Promise<void>;
    testConnection(): Promise<{
        ok: boolean;
        detail: string;
    }>;
    private requestWsEndpoint;
    private openWebSocket;
    private scheduleReconnect;
    private handleWsFrame;
    private recordSeen;
}
//# sourceMappingURL=feishu.d.ts.map