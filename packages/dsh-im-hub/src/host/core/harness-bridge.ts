import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  getHostService,
  type AgentDefaultModelServiceLike,
  type AgentHandleLike,
  type AgentLike,
  type AgentsServiceLike,
  type LlmServiceLike,
  type WorkspaceRegistryLike,
} from '../../core/host-types.ts'
import { splitMessageChunks } from './commands.ts'
import type { InboundMessage, OutboundReply } from './types.ts'

export interface ConversationBinding {
  conversationKey: string
  sessionId: string
  agentId: string
  agent: AgentLike
  handle?: AgentHandleLike
  workspacePath: string
  lastActivity: number
  lastReplyContext?: Record<string, unknown>
}

export type TurnRunner = (
  message: InboundMessage,
  bindingKey: string,
  workspacePath: string,
) => Promise<string>

export interface HarnessBridgeOptions {
  ctx?: Context
  getDefaultWorkspacePath: () => string
  getMaxReplyChars: () => number
  turnRunner?: TurnRunner
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

function extractTextBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const rec = block as Record<string, unknown>
    if (rec.type === 'text' && typeof rec.text === 'string' && rec.text.trim()) {
      parts.push(rec.text)
    }
  }
  return parts.join('\n')
}

export function buildConversationKey(channel: string, conversationId: string): string {
  return `${channel}:${conversationId}`
}

export class HarnessBridge {
  private readonly ctx?: Context
  private readonly getDefaultWorkspacePath: () => string
  private readonly getMaxReplyChars: () => number
  private readonly customTurnRunner?: TurnRunner
  private readonly onLog?: (level: 'info' | 'warn' | 'error', message: string) => void

  private readonly bindings = new Map<string, ConversationBinding>()
  private readonly sessionToKey = new Map<string, string>()
  private readonly workspaceOverrides = new Map<string, string>()
  private readonly inflightOpen = new Map<string, Promise<ConversationBinding>>()
  private readonly turnCollectors = new Map<string, { chunks: string[]; error?: string }>()

  constructor(options: HarnessBridgeOptions) {
    this.ctx = options.ctx
    this.getDefaultWorkspacePath = options.getDefaultWorkspacePath
    this.getMaxReplyChars = options.getMaxReplyChars
    this.customTurnRunner = options.turnRunner
    this.onLog = options.onLog
  }

  install(ctx: Context): () => void {
    const registrar = ctx as unknown as {
      on: (
        event: string,
        listener: (session: { header?: { id?: string }; id?: string }, event: Record<string, unknown>) => void,
      ) => () => void
    }
    const dispose = registrar.on('session/event', (session, event) => {
      const sessionId = session?.header?.id ?? session?.id
      if (!sessionId) return
      const collector = this.turnCollectors.get(sessionId)
      if (!collector) return
      const data = (event.data && typeof event.data === 'object' ? event.data : event) as Record<string, unknown>
      if (event.type === 'assistant/message') {
        const messageObj = (data.message && typeof data.message === 'object' ? data.message : data) as Record<string, unknown>
        const text = extractTextBlocks(messageObj.content)
        if (text) collector.chunks.push(text)
      } else if (event.type === 'turn/end') {
        const reason = data.reason as Record<string, unknown> | undefined
        if (reason && reason.kind === 'error') {
          const detail = (reason.error ?? reason.failure) as Record<string, unknown> | undefined
          const msg = typeof detail?.message === 'string'
            ? detail.message
            : typeof reason.message === 'string'
              ? reason.message
              : 'turn failed'
          collector.error = msg
        }
      }
    })
    return () => {
      dispose()
      void this.disposeAll()
    }
  }

  getBinding(conversationKey: string): ConversationBinding | undefined {
    return this.bindings.get(conversationKey)
  }

  getBindingByAgentId(agentId: string): ConversationBinding | undefined {
    const key = this.sessionToKey.get(agentId)
    if (key) return this.bindings.get(key)
    for (const binding of this.bindings.values()) {
      if (binding.agentId === agentId || binding.sessionId === agentId) return binding
    }
    return undefined
  }

  resolveWorkspacePath(conversationKey: string): string {
    const override = this.workspaceOverrides.get(conversationKey)
    if (override) return override
    const configured = this.getDefaultWorkspacePath().trim()
    if (configured) return configured
    if (this.ctx) {
      const registry = getHostService<WorkspaceRegistryLike>(this.ctx, 'workspaceRegistry')
      const first = registry?.list?.()?.[0]?.path
      if (first) return first
    }
    return process.cwd()
  }

  async setWorkspace(conversationKey: string, nextPath: string): Promise<string> {
    const resolved = nextPath.trim()
    if (!resolved) {
      return this.resolveWorkspacePath(conversationKey)
    }
    this.workspaceOverrides.set(conversationKey, resolved)
    await this.resetConversation(conversationKey)
    return resolved
  }

  async stopConversation(conversationKey: string): Promise<boolean> {
    const binding = this.bindings.get(conversationKey)
    if (!binding) return false
    binding.agent.cancel?.({ kind: 'user' })
    return true
  }

  async resetConversation(conversationKey: string): Promise<boolean> {
    const binding = this.bindings.get(conversationKey)
    if (!binding) return false
    this.bindings.delete(conversationKey)
    this.sessionToKey.delete(binding.sessionId)
    this.sessionToKey.delete(binding.agentId)
    this.turnCollectors.delete(binding.sessionId)
    binding.agent.cancel?.({ kind: 'user' })
    await binding.handle?.dispose().catch(() => {})
    return true
  }

  async runTurn(
    message: InboundMessage,
    sendReply: (reply: OutboundReply) => Promise<void>,
  ): Promise<void> {
    const key = buildConversationKey(message.channel, message.conversationId)
    const workspacePath = this.resolveWorkspacePath(key)

    let replyText = ''
    if (this.customTurnRunner) {
      replyText = await this.customTurnRunner(message, key, workspacePath)
    } else {
      const binding = await this.getOrCreateBinding(key, workspacePath)
      binding.lastActivity = Date.now()
      binding.lastReplyContext = message.replyContext
      replyText = await this.executeAgentTurn(binding, message)
    }

    const chunks = splitMessageChunks(replyText, this.getMaxReplyChars())
    for (const chunk of chunks) {
      await sendReply({
        text: chunk,
        replyContext: message.replyContext,
      })
    }
  }

  async disposeAll(): Promise<void> {
    const keys = [...this.bindings.keys()]
    for (const key of keys) {
      await this.resetConversation(key)
    }
  }

  private async getOrCreateBinding(
    conversationKey: string,
    workspacePath: string,
  ): Promise<ConversationBinding> {
    const existing = this.bindings.get(conversationKey)
    if (existing) return existing

    const inflight = this.inflightOpen.get(conversationKey)
    if (inflight) return inflight

    const task = this.createBinding(conversationKey, workspacePath)
    this.inflightOpen.set(conversationKey, task)
    try {
      return await task
    } finally {
      this.inflightOpen.delete(conversationKey)
    }
  }

  private async resolveDefaultAgentOptions(): Promise<{
    provider: string
    model: string
    reasoningEffort?: string
  } | undefined> {
    if (!this.ctx) return undefined
    const defaultModel = getHostService<AgentDefaultModelServiceLike>(this.ctx, 'agentDefaultModel')
    const selection = defaultModel?.currentSelection?.()
    if (selection?.provider && selection?.model) {
      return {
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
      }
    }
    const llm = getHostService<LlmServiceLike>(this.ctx, 'llm')
    const providers = llm?.listProviders?.() ?? []
    for (const entry of providers) {
      const providerId = typeof entry === 'string' ? entry : entry?.id
      if (!providerId) continue
      try {
        const models = (await llm?.listModels?.(providerId)) ?? []
        const firstModel = models[0]
        if (firstModel?.id) {
          return { provider: providerId, model: firstModel.id }
        }
      } catch {
        // Ignore individual provider lookup errors and try next provider.
      }
    }
    return undefined
  }

  private async createBinding(
    conversationKey: string,
    workspacePath: string,
  ): Promise<ConversationBinding> {
    const agents = this.ctx ? getHostService<AgentsServiceLike>(this.ctx, 'agents') : undefined
    if (!agents?.create) {
      throw new Error('DSH agents service is unavailable')
    }

    const sessionId = `session-${randomUUID()}`
    const agentOptions = await this.resolveDefaultAgentOptions()
    const created = await agents.create({
      sessionId,
      meta: { cwd: workspacePath },
      ...(agentOptions ? { agentOptions } : {}),
    })

    const binding: ConversationBinding = {
      conversationKey,
      sessionId,
      agentId: created.agent.id,
      agent: created.agent,
      handle: created,
      workspacePath,
      lastActivity: Date.now(),
    }
    this.bindings.set(conversationKey, binding)
    this.sessionToKey.set(sessionId, conversationKey)
    this.sessionToKey.set(created.agent.id, conversationKey)
    return binding
  }

  private async executeAgentTurn(
    binding: ConversationBinding,
    message: InboundMessage,
  ): Promise<string> {
    const collector = { chunks: [] as string[], error: undefined as string | undefined }
    this.turnCollectors.set(binding.sessionId, collector)

    const senderPrefix = message.chatType === 'group'
      ? `[${message.senderName ?? message.senderId} (${message.senderId})] `
      : ''
    const promptText = `${senderPrefix}${message.text}`

    try {
      binding.agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: promptText }],
        source: { kind: 'user' },
      })
      await binding.agent.whenIdle()
    } catch (error) {
      this.onLog?.('warn', `turn interrupted for ${binding.conversationKey}: ${error instanceof Error ? error.message : String(error)}`)
      if (collector.chunks.length === 0) {
        return `⚠️ 执行中断: ${error instanceof Error ? error.message : String(error)}`
      }
    } finally {
      this.turnCollectors.delete(binding.sessionId)
    }

    const body = collector.chunks.join('\n\n').trim()
    if (collector.error && !body) {
      return `⚠️ 本轮执行异常: ${collector.error}`
    }
    if (collector.error && body) {
      return `${body}\n\n⚠️ ${collector.error}`
    }
    return body || '（无文本输出）'
  }
}
