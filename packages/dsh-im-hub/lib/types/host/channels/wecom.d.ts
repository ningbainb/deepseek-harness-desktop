import type { ChannelStatusSnapshot, WeComChannelConfig } from '../../core/settings.ts';
import type { ChannelAdapter, FetchLike, InboundMessage, OutboundReply, WebhookHttpInput, WebhookHttpOutput } from './../core/types.ts';
export interface WeComAdapterOptions {
    getConfig: () => WeComChannelConfig;
    onMessage: (message: InboundMessage) => Promise<void> | void;
    onEvent?: (level: 'info' | 'warn' | 'error', message: string) => void;
    fetchImpl?: FetchLike;
}
export declare function computeWeComSignature(token: string, timestamp: string, nonce: string, encrypt?: string): string;
export declare function verifyWeComSignature(expectedSig: string, token: string, timestamp: string, nonce: string, encrypt?: string): boolean;
export declare function decryptWeComPayload(encodingAesKey: string, cipherBase64: string): {
    message: string;
    receiveId: string;
};
export declare function encryptWeComPayload(encodingAesKey: string, plainText: string, corpId: string): string;
export declare function extractXmlTag(xml: string, tag: string): string | undefined;
export declare class WeComAdapter implements ChannelAdapter {
    readonly id: "wecom";
    private readonly getConfig;
    private readonly onMessage;
    private readonly onEvent?;
    private readonly fetchImpl;
    private tokenCache;
    private readonly dedupIds;
    private status;
    constructor(options: WeComAdapterOptions);
    getStatus(): ChannelStatusSnapshot;
    start(): Promise<void>;
    stop(): Promise<void>;
    fetchAccessToken(cfg?: WeComChannelConfig): Promise<string>;
    send(conversationId: string, reply: OutboundReply): Promise<void>;
    handleWebhook(req: WebhookHttpInput): Promise<WebhookHttpOutput>;
    testConnection(): Promise<{
        ok: boolean;
        detail: string;
    }>;
    private recordSeen;
}
//# sourceMappingURL=wecom.d.ts.map