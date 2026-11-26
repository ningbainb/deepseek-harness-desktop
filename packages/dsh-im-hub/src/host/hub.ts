import type { Context } from '@deepseek-ai/cordis'
import {
  CHANNEL_IDS,
  ROUTE_PREFIX,
  defaultSettings,
  redactSettingsForClient,
  type ChannelId,
  type ChannelStatusSnapshot,
  type DiagnosticEvent,
  type ImHubSettings,
} from '../core/settings.ts'
import { DingTalkAdapter } from './channels/dingtalk.ts'
import { FeishuAdapter } from './channels/feishu.ts'
import { GenericWebhookAdapter } from './channels/webhook.ts'
import { WeComAdapter } from './channels/wecom.ts'
import { evaluateAccess } from './core/access-policy.ts'
import { ApprovalBridge } from './core/approval-bridge.ts'
import { formatHelpMessage, parseControlCommand } from './core/commands.ts'
import { ConversationQueue } from './core/conversation-queue.ts'
import { HarnessBridge, buildConversationKey, type TurnRunner } from './core/harness-bridge.ts'
import type {
  ChannelAdapter,
  FetchLike,
  InboundMessage,
  WebSocketFactory,
  WebhookHttpInput,
  WebhookHttpOutput,
} from './core/types.ts'

export interface ImHubManagerOptions {
  ctx?: Context
  initialSettings?: ImHubSettings
  fetchImpl?: FetchLike
  webSocketFactory?: WebSocketFactory
  turnRunner?: TurnRunner
  nowMs?: () => number
}

export interface ImHubStateSnapshot {
  settings: ImHubSettings
  channels: Record<ChannelId, ChannelStatusSnapshot>
  events: DiagnosticEvent[]
  pendingApprovals: number
  webhookEndpoints: {
    wecom: string
    webhook: string
  }
}

export class ImHubManager {
  private settings: ImHubSettings
  private readonly queue = new ConversationQueue(16)
  private readonly events: DiagnosticEvent[] = []
  private readonly adapters: Record<ChannelId, ChannelAdapter>
  readonly approvalBridge: ApprovalBridge
  readonly harnessBridge: HarnessBridge

  private lastContextByConversation = new Map<string, Record<string, unknown>>()
  private disposed = false

  constructor(options: ImHubManagerOptions = {}) {
    this.settings = options.initialSettings ?? defaultSettings()

    this.harnessBridge = new HarnessBridge({
      ctx: options.ctx,
      getDefaultWorkspacePath: () => this.settings.defaultWorkspacePath,
      getMaxReplyChars: () => this.settings.maxReplyChars,
      turnRunner: options.turnRunner,
      onLog: (level, message) => this.pushEvent('hub', level, message),
    })

    this.approvalBridge = new ApprovalBridge({
      dualApproval: this.settings.dualApproval,
      onLog: (level, message) => this.pushEvent('hub', level, message),
      lookupBinding: (agentId) => {
        const binding = this.harnessBridge.getBindingByAgentId(agentId)
        if (!binding) return undefined
        const [channel, ...rest] = binding.conversationKey.split(':')
        const conversationId = rest.join(':')
        const adapter = this.adapters[channel as ChannelId]
        if (!adapter) return undefined
        return {
          conversationKey: binding.conversationKey,
          sendPrompt: (text: string) => adapter.send(conversationId, {
            text,
            replyContext: this.lastContextByConversation.get(binding.conversationKey) ?? binding.lastReplyContext,
          }),
        }
      },
    })

    const onInbound = (msg: InboundMessage) => this.handleInbound(msg)

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
    }
  }

  install(ctx: Context): () => void {
    const stopHarness = this.harnessBridge.install(ctx)
    const stopApproval = this.approvalBridge.install(ctx)
    return () => {
      stopApproval()
      stopHarness()
      void this.dispose()
    }
  }

  getSettings(): ImHubSettings {
    return this.settings
  }

  async applySettings(next: ImHubSettings): Promise<void> {
    this.settings = next
    this.approvalBridge.setDualApproval(next.dualApproval)

    if (!next.enabled) {
      await Promise.all(CHANNEL_IDS.map((id) => this.adapters[id].stop()))
      this.pushEvent('hub', 'info', 'IM Hub disabled; all channels stopped')
      return
    }

    await Promise.all(CHANNEL_IDS.map(async (id) => {
      const channelCfg = next.channels[id]
      if (channelCfg.enabled) {
        await this.adapters[id].start()
      } else {
        await this.adapters[id].stop()
      }
    }))
  }

  async restartChannel(channelId: ChannelId): Promise<ChannelStatusSnapshot> {
    const adapter = this.adapters[channelId]
    await adapter.stop()
    if (this.settings.enabled && this.settings.channels[channelId].enabled) {
      await adapter.start()
    }
    return adapter.getStatus()
  }

  async testChannel(channelId: ChannelId): Promise<{ ok: boolean; detail: string }> {
    return this.adapters[channelId].testConnection()
  }

  async handleWebhook(
    channelId: 'wecom' | 'webhook',
    req: WebhookHttpInput,
  ): Promise<WebhookHttpOutput> {
    if (!this.settings.enabled) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'im-hub disabled' }),
      }
    }
    const adapter = this.adapters[channelId]
    if (!adapter.handleWebhook) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'webhook not supported' }),
      }
    }
    return adapter.handleWebhook(req)
  }

  async handleInbound(message: InboundMessage): Promise<void> {
    if (this.disposed || !this.settings.enabled) return
    const policy = this.settings.channels[message.channel].access
    const access = evaluateAccess(message, policy)
    if (!access.allowed) {
      this.pushEvent(message.channel, 'warn', `blocked message from ${message.senderId}: ${access.reason}`)
      return
    }

    const key = buildConversationKey(message.channel, message.conversationId)
    if (message.replyContext) {
      this.lastContextByConversation.set(key, message.replyContext)
    }

    const adapter = this.adapters[message.channel]
    const sendReply = async (text: string) => {
      await adapter.send(message.conversationId, {
        text,
        replyContext: message.replyContext ?? this.lastContextByConversation.get(key),
      })
    }

    const cmd = parseControlCommand(message.text)
    if (cmd) {
      switch (cmd.kind) {
        case 'help':
          await sendReply(formatHelpMessage(message.channel))
          return
        case 'status': {
          const binding = this.harnessBridge.getBinding(key)
          const wsPath = this.harnessBridge.resolveWorkspacePath(key)
          const pending = this.approvalBridge.pendingForConversation(key)
          await sendReply([
            `📊 IM Hub 状态 (${message.channel})`,
            `- 会话绑定: ${binding ? `已连接 (${binding.sessionId})` : '未启动（发送消息后自动创建）'}`,
            `- 当前工作区: \`${wsPath}\``,
            `- 队列忙碌: ${this.queue.isBusy(key) ? '是' : '否'} (深度 ${this.queue.depth(key)})`,
            `- 待审工具调用: ${pending.length}`,
          ].join('\n'))
          return
        }
        case 'stop': {
          const stopped = await this.harnessBridge.stopConversation(key)
          await sendReply(stopped ? '⏹️ 已请求中止当前回复。' : 'ℹ️ 当前没有正在执行的回复。')
          return
        }
        case 'new': {
          this.approvalBridge.cancelConversation(key)
          await this.harnessBridge.resetConversation(key)
          await sendReply('🆕 已开启新对话上下文。')
          return
        }
        case 'workspace': {
          if (!cmd.path) {
            await sendReply(`📁 当前绑定工作区: \`${this.harnessBridge.resolveWorkspacePath(key)}\``)
            return
          }
          const updated = await this.harnessBridge.setWorkspace(key, cmd.path)
          await sendReply(`📁 已切换工作区为 \`${updated}\` 并重置会话上下文。`)
          return
        }
        case 'approve': {
          const result = this.approvalBridge.resolveFromIm(
            key,
            cmd.approvalId,
            'allowed-once',
            message.senderId,
            policy,
          )
          await sendReply(result.message)
          return
        }
        case 'reject': {
          const result = this.approvalBridge.resolveFromIm(
            key,
            cmd.approvalId,
            'rejected',
            message.senderId,
            policy,
          )
          await sendReply(result.message)
          return
        }
      }
    }

    if (this.settings.busyMode === 'steer' && this.queue.isBusy(key)) {
      await this.harnessBridge.stopConversation(key)
    }

    await this.queue.enqueue(key, async () => {
      try {
        await this.harnessBridge.runTurn(message, (reply) => adapter.send(message.conversationId, reply))
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        this.pushEvent(message.channel, 'error', `turn failed: ${msg}`)
        await sendReply(`⚠️ 处理消息时出现异常: ${msg}`).catch(() => {})
      }
    })
  }

  getStateSnapshot(): ImHubStateSnapshot {
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
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.approvalBridge.disposeAll()
    await Promise.all(CHANNEL_IDS.map((id) => this.adapters[id].stop()))
    await this.harnessBridge.disposeAll()
  }

  private pushEvent(
    channel: ChannelId | 'hub',
    level: 'info' | 'warn' | 'error',
    message: string,
  ): void {
    this.events.unshift({
      ts: Date.now(),
      channel,
      level,
      message,
    })
    if (this.events.length > 50) {
      this.events.length = 50
    }
  }
}
