import type { Context } from '@deepseek-ai/cordis';
import { type ImHubSettings } from './core/settings.ts';
import { ImHubManager } from './host/hub.ts';
import type { TurnRunner } from './host/core/harness-bridge.ts';
import type { FetchLike, WebSocketFactory } from './host/core/types.ts';
export { CHANNEL_IDS, PACKAGE_ID, ROUTE_PREFIX, SECRET_MASK, SETTINGS_FILE, defaultAccessPolicy, defaultSettings, normalizeSettings, redactSettingsForClient, } from './core/settings.ts';
export type { AccessMode, BusyMode, ChannelAccessPolicy, ChannelId, ChannelRuntimeState, ChannelStatusSnapshot, DiagnosticEvent, DingTalkChannelConfig, FeishuChannelConfig, ImHubSettings, WebhookChannelConfig, WeComChannelConfig, } from './core/settings.ts';
export { readSettings, resolveDshHome, writeSettingsAtomic } from './host/settings-store.ts';
export { evaluateAccess, isApprovalAuthorized } from './host/core/access-policy.ts';
export { ConversationQueue } from './host/core/conversation-queue.ts';
export { formatHelpMessage, parseControlCommand, splitMessageChunks } from './host/core/commands.ts';
export { ApprovalBridge, summarizeToolRequest } from './host/core/approval-bridge.ts';
export { HarnessBridge, buildConversationKey } from './host/core/harness-bridge.ts';
export { FeishuAdapter, extractFeishuTextContent, resolveFeishuBaseUrl } from './host/channels/feishu.ts';
export { DingTalkAdapter } from './host/channels/dingtalk.ts';
export { WeComAdapter, computeWeComSignature, decryptWeComPayload, encryptWeComPayload, extractXmlTag, verifyWeComSignature, } from './host/channels/wecom.ts';
export { GenericWebhookAdapter, signWebhookPayload, verifyWebhookSignature, } from './host/channels/webhook.ts';
export { ImHubManager } from './host/hub.ts';
export type { ImHubStateSnapshot } from './host/hub.ts';
export interface ApplyImHubOptions {
    home?: string;
    fetchImpl?: FetchLike;
    webSocketFactory?: WebSocketFactory;
    turnRunner?: TurnRunner;
    nowMs?: () => number;
    initialSettings?: ImHubSettings;
}
export declare function apply(ctx: Context, options?: ApplyImHubOptions): ImHubManager;
//# sourceMappingURL=index.d.ts.map