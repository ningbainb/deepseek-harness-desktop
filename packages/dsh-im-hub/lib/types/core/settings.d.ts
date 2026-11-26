export declare const PACKAGE_ID = "@ningbainb/dsh-im-hub";
export declare const ROUTE_PREFIX = "/api/dsh-im-hub";
export declare const SETTINGS_FILE = "im-hub.json";
export declare const SECRET_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
export declare const CHANNEL_IDS: readonly ["feishu", "dingtalk", "wecom", "webhook"];
export type ChannelId = (typeof CHANNEL_IDS)[number];
export type AccessMode = 'allowlist' | 'open';
export type BusyMode = 'queue' | 'steer';
export type FeishuDomain = 'feishu' | 'lark';
export type WeComMode = 'webhook' | 'app';
export interface ChannelAccessPolicy {
    mode: AccessMode;
    allowUsers: string[];
    allowGroups: string[];
    groupMentionOnly: boolean;
}
export interface FeishuChannelConfig {
    enabled: boolean;
    appId: string;
    appSecret: string;
    domain: FeishuDomain;
    access: ChannelAccessPolicy;
}
export interface DingTalkChannelConfig {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    robotCode: string;
    access: ChannelAccessPolicy;
}
export interface WeComChannelConfig {
    enabled: boolean;
    mode: WeComMode;
    webhookUrl: string;
    corpId: string;
    corpSecret: string;
    agentId: string;
    token: string;
    encodingAesKey: string;
    access: ChannelAccessPolicy;
}
export interface WebhookChannelConfig {
    enabled: boolean;
    signingSecret: string;
    outboundUrl: string;
    outboundHeaders: Record<string, string>;
    replayWindowSec: number;
    access: ChannelAccessPolicy;
}
export interface ImHubSettings {
    version: 1;
    enabled: boolean;
    busyMode: BusyMode;
    dualApproval: boolean;
    maxReplyChars: number;
    defaultWorkspacePath: string;
    channels: {
        feishu: FeishuChannelConfig;
        dingtalk: DingTalkChannelConfig;
        wecom: WeComChannelConfig;
        webhook: WebhookChannelConfig;
    };
}
export type ChannelRuntimeState = 'disabled' | 'idle' | 'connecting' | 'connected' | 'webhook-ready' | 'error';
export interface ChannelStatusSnapshot {
    id: ChannelId;
    enabled: boolean;
    state: ChannelRuntimeState;
    detail?: string;
    lastEventAt?: number;
    lastError?: string;
    messageCount: number;
}
export interface DiagnosticEvent {
    ts: number;
    channel: ChannelId | 'hub';
    level: 'info' | 'warn' | 'error';
    message: string;
}
export declare function defaultAccessPolicy(): ChannelAccessPolicy;
export declare function defaultSettings(): ImHubSettings;
export declare function normalizeSettings(raw: unknown, existing?: ImHubSettings): {
    settings: ImHubSettings;
    problems: string[];
};
export declare function redactSettingsForClient(settings: ImHubSettings): ImHubSettings;
//# sourceMappingURL=settings.d.ts.map