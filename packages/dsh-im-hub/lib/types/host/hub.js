import { CHANNEL_IDS, ROUTE_PREFIX, defaultSettings, redactSettingsForClient, } from "../core/settings.js";
import { DingTalkAdapter } from "./channels/dingtalk.js";
import { FeishuAdapter } from "./channels/feishu.js";
import { GenericWebhookAdapter } from "./channels/webhook.js";
import { WeComAdapter } from "./channels/wecom.js";
import { evaluateAccess } from "./core/access-policy.js";
import { ApprovalBridge } from "./core/approval-bridge.js";
import { formatHelpMessage, parseControlCommand } from "./core/commands.js";
import { ConversationQueue } from "./core/conversation-queue.js";
import { HarnessBridge, buildConversationKey } from "./core/harness-bridge.js";
export class ImHubManager {
    settings;
    queue = new ConversationQueue(16);
    events = [];
    adapters;
    approvalBridge;
    harnessBridge;
    lastContextByConversation = new Map();
    disposed = false;
    constructor(options = {}) {
        this.settings = options.initialSettings ?? defaultSettings();
        this.harnessBridge = new HarnessBridge({
            ctx: options.ctx,
            getDefaultWorkspacePath: () => this.settings.defaultWorkspacePath,
            getMaxReplyChars: () => this.settings.maxReplyChars,
            turnRunner: options.turnRunner,
            onLog: (level, message) => this.pushEvent('hub', level, message),
        });
        this.approvalBridge = new ApprovalBridge({
            dualApproval: this.settings.dualApproval,
            onLog: (level, message) => this.pushEvent('hub', level, message),
            lookupBinding: (agentId) => {
                const binding = this.harnessBridge.getBindingByAgentId(agentId);
                if (!binding)
                    return undefined;
                const [channel, ...rest] = binding.conversationKey.split(':');
                const conversationId = rest.join(':');
                const adapter = this.adapters[channel];
                if (!adapter)
                    return undefined;
                return {
                    conversationKey: binding.conversationKey,
                    sendPrompt: (text) => adapter.send(conversationId, {
                        text,
                        replyContext: this.lastContextByConversation.get(binding.conversationKey) ?? binding.lastReplyContext,
                    }),
                };
            },
        });
        const onInbound = (msg) => this.handleInbound(msg);
        this.adapters = {
            feishu: new FeishuAdapter({
                getConfig: () => this.settings.channels.feishu,
                onMessage: onInbound,
                onEvent: (level, message) => this.pushEvent('feishu', level, message),
                fetchImpl: options.fetchImpl,
                webSocketFactory: options.webSocketFactory,
            }),
            dingtalk: new DingTalkAdapter({
                getConfig: () => this.settings.channels.dingtalk,
                onMessage: onInbound,
                onEvent: (level, message) => this.pushEvent('dingtalk', level, message),
                fetchImpl: options.fetchImpl,
                webSocketFactory: options.webSocketFactory,
            }),
            wecom: new WeComAdapter({
                getConfig: () => this.settings.channels.wecom,
                onMessage: onInbound,
                onEvent: (level, message) => this.pushEvent('wecom', level, message),
                fetchImpl: options.fetchImpl,
            }),
            webhook: new GenericWebhookAdapter({
                getConfig: () => this.settings.channels.webhook,
                onMessage: onInbound,
                onEvent: (level, message) => this.pushEvent('webhook', level, message),
                fetchImpl: options.fetchImpl,
                nowMs: options.nowMs,
            }),
        };
    }
    install(ctx) {
        const stopHarness = this.harnessBridge.install(ctx);
        const stopApproval = this.approvalBridge.install(ctx);
        return () => {
            stopApproval();
            stopHarness();
            void this.dispose();
        };
    }
    getSettings() {
        return this.settings;
    }
    async applySettings(next) {
        this.settings = next;
        this.approvalBridge.setDualApproval(next.dualApproval);
        if (!next.enabled) {
            await Promise.all(CHANNEL_IDS.map((id) => this.adapters[id].stop()));
            this.pushEvent('hub', 'info', 'IM Hub disabled; all channels stopped');
            return;
        }
        await Promise.all(CHANNEL_IDS.map(async (id) => {
            const channelCfg = next.channels[id];
            if (channelCfg.enabled) {
                await this.adapters[id].start();
            }
            else {
                await this.adapters[id].stop();
            }
        }));
    }
    async restartChannel(channelId) {
        const adapter = this.adapters[channelId];
        await adapter.stop();
        if (this.settings.enabled && this.settings.channels[channelId].enabled) {
            await adapter.start();
        }
        return adapter.getStatus();
    }
    async testChannel(channelId) {
        return this.adapters[channelId].testConnection();
    }
    async handleWebhook(channelId, req) {
        if (!this.settings.enabled) {
            return {
                status: 404,
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ error: 'im-hub disabled' }),
            };
        }
        const adapter = this.adapters[channelId];
        if (!adapter.handleWebhook) {
            return {
                status: 404,
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ error: 'webhook not supported' }),
            };
        }
        return adapter.handleWebhook(req);
    }
    async handleInbound(message) {
        if (this.disposed || !this.settings.enabled)
            return;
        const policy = this.settings.channels[message.channel].access;
        const access = evaluateAccess(message, policy);
        if (!access.allowed) {
            this.pushEvent(message.channel, 'warn', `blocked message from ${message.senderId}: ${access.reason}`);
            return;
        }
        const key = buildConversationKey(message.channel, message.conversationId);
        if (message.replyContext) {
            this.lastContextByConversation.set(key, message.replyContext);
        }
        const adapter = this.adapters[message.channel];
        const sendReply = async (text) => {
            await adapter.send(message.conversationId, {
                text,
                replyContext: message.replyContext ?? this.lastContextByConversation.get(key),
            });
        };
        const cmd = parseControlCommand(message.text);
        if (cmd) {
            switch (cmd.kind) {
                case 'help':
                    await sendReply(formatHelpMessage(message.channel));
                    return;
                case 'status': {
                    const binding = this.harnessBridge.getBinding(key);
                    const wsPath = this.harnessBridge.resolveWorkspacePath(key);
                    const pending = this.approvalBridge.pendingForConversation(key);
                    await sendReply([
                        `📊 IM Hub 状态 (${message.channel})`,
                        `- 会话绑定: ${binding ? `已连接 (${binding.sessionId})` : '未启动（发送消息后自动创建）'}`,
                        `- 当前工作区: \`${wsPath}\``,
                        `- 队列忙碌: ${this.queue.isBusy(key) ? '是' : '否'} (深度 ${this.queue.depth(key)})`,
                        `- 待审工具调用: ${pending.length}`,
                    ].join('\n'));
                    return;
                }
                case 'stop': {
                    const stopped = await this.harnessBridge.stopConversation(key);
                    await sendReply(stopped ? '⏹️ 已请求中止当前回复。' : 'ℹ️ 当前没有正在执行的回复。');
                    return;
                }
                case 'new': {
                    this.approvalBridge.cancelConversation(key);
                    await this.harnessBridge.resetConversation(key);
                    await sendReply('🆕 已开启新对话上下文。');
                    return;
                }
                case 'workspace': {
                    if (!cmd.path) {
                        await sendReply(`📁 当前绑定工作区: \`${this.harnessBridge.resolveWorkspacePath(key)}\``);
                        return;
                    }
                    const updated = await this.harnessBridge.setWorkspace(key, cmd.path);
                    await sendReply(`📁 已切换工作区为 \`${updated}\` 并重置会话上下文。`);
                    return;
                }
                case 'approve': {
                    const result = this.approvalBridge.resolveFromIm(key, cmd.approvalId, 'allowed-once', message.senderId, policy);
                    await sendReply(result.message);
                    return;
                }
                case 'reject': {
                    const result = this.approvalBridge.resolveFromIm(key, cmd.approvalId, 'rejected', message.senderId, policy);
                    await sendReply(result.message);
                    return;
                }
            }
        }
        if (this.settings.busyMode === 'steer' && this.queue.isBusy(key)) {
            await this.harnessBridge.stopConversation(key);
        }
        await this.queue.enqueue(key, async () => {
            try {
                await this.harnessBridge.runTurn(message, (reply) => adapter.send(message.conversationId, reply));
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                this.pushEvent(message.channel, 'error', `turn failed: ${msg}`);
                await sendReply(`⚠️ 处理消息时出现异常: ${msg}`).catch(() => { });
            }
        });
    }
    getStateSnapshot() {
        return {
            settings: redactSettingsForClient(this.settings),
            channels: {
                feishu: this.adapters.feishu.getStatus(),
                dingtalk: this.adapters.dingtalk.getStatus(),
                wecom: this.adapters.wecom.getStatus(),
                webhook: this.adapters.webhook.getStatus(),
            },
            events: [...this.events],
            pendingApprovals: this.approvalBridge.pendingCount(),
            webhookEndpoints: {
                wecom: `${ROUTE_PREFIX}/webhook/wecom`,
                webhook: `${ROUTE_PREFIX}/webhook/generic`,
            },
        };
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.approvalBridge.disposeAll();
        await Promise.all(CHANNEL_IDS.map((id) => this.adapters[id].stop()));
        await this.harnessBridge.disposeAll();
    }
    pushEvent(channel, level, message) {
        this.events.unshift({
            ts: Date.now(),
            channel,
            level,
            message,
        });
        if (this.events.length > 50) {
            this.events.length = 50;
        }
    }
}
