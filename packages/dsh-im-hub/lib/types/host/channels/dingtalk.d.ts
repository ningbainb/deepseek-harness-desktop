import type { ChannelStatusSnapshot, DingTalkChannelConfig } from '../../core/settings.ts';
import type { ChannelAdapter, FetchLike, InboundMessage, OutboundReply, WebSocketFactory } from './../core/types.ts';
export interface DingTalkAdapterOptions {
    getConfig: () => DingTalkChannelConfig;
    onMessage: (message: InboundMessage) => Promise<void> | void;
    onEvent?: (level: 'info' | 'warn' | 'error', message: string) => void;
    fetchImpl?: FetchLike;
    webSocketFactory?: WebSocketFactory;
}
export declare class DingTalkAdapter implements ChannelAdapter {
    readonly id: "dingtalk";
    private readonly getConfig;
    private readonly onMessage;
    private readonly onEvent?;
    private readonly fetchImpl;
    private readonly webSocketFactory;
    private tokenCache;
    private ws;
    private reconnectTimer;
    private stopping;
    private reconnectAttempts;
    private readonly dedupIds;
    private status;
    constructor(options: DingTalkAdapterOptions);
    getStatus(): ChannelStatusSnapshot;
    start(): Promise<void>;
    stop(): Promise<void>;
    fetchAccessToken(cfg?: DingTalkChannelConfig): Promise<string>;
    send(conversationId: string, reply: OutboundReply): Promise<void>;
    testConnection(): Promise<{
        ok: boolean;
        detail: string;
    }>;
    private openGatewayConnection;
    private openWebSocket;
    private scheduleReconnect;
    private handleStreamFrame;
    private recordSeen;
}
//# sourceMappingURL=dingtalk.d.ts.map