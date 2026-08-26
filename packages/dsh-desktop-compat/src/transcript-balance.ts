import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'

export interface TranscriptBalanceDiagnostic {
  readonly outcome: 'balanced' | 'stripped-trailing-assistant'
  readonly droppedCallIds: readonly string[]
  readonly droppedMessagesCount: number
}

interface ExtractedToolCall {
  id: string
  name?: string
}

export function extractToolCallsFromAssistantMessage(message: Message): ExtractedToolCall[] {
  const results: ExtractedToolCall[] = []
  if (message.role !== 'assistant') return results

  // 1. Check message.tool_calls (OpenAI style)
  const candidateToolCalls = (message as unknown as { tool_calls?: Array<{ id?: string; name?: string; function?: { name?: string } }> }).tool_calls
  if (Array.isArray(candidateToolCalls)) {
    for (const call of candidateToolCalls) {
      if (typeof call?.id === 'string' && call.id.length > 0) {
        results.push({ id: call.id, name: call.name ?? call.function?.name })
      }
    }
  }

  // 2. Check message.content (DSH ContentBlock style)
  if (Array.isArray(message.content)) {
    for (const block of message.content as ContentBlock[]) {
      if (block && typeof block === 'object' && block.type === 'tool-call') {
        const toolCallBlock = block as { id?: string; name?: string }
        if (typeof toolCallBlock.id === 'string' && toolCallBlock.id.length > 0) {
          results.push({ id: toolCallBlock.id, name: toolCallBlock.name })
        }
      }
    }
  }

  return results
}

export function balanceTranscriptMessages(
  messages: readonly Message[] | undefined,
): { messages: readonly Message[]; diagnostic?: TranscriptBalanceDiagnostic } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: messages ?? [] }
  }

  const lastMessage = messages.at(-1)
  if (lastMessage?.role === 'assistant') {
    const trailingCalls = extractToolCallsFromAssistantMessage(lastMessage)
    if (trailingCalls.length > 0) {
      const repaired = messages.slice(0, -1)
      return {
        messages: repaired,
        diagnostic: {
          outcome: 'stripped-trailing-assistant',
          droppedCallIds: trailingCalls.map((c) => c.id),
          droppedMessagesCount: 1,
        },
      }
    }
  }

  return { messages }
}

export function installTranscriptBalanceGuard(ctx: Context): void {
  ctx.on('llm/stream', (options, next) => {
    if (options && Array.isArray(options.messages)) {
      const balanced = balanceTranscriptMessages(options.messages)
      if (balanced.diagnostic) {
        ctx.logger?.warn?.(
          `[dsh-desktop-compat] transcript balance: dropped trailing assistant message with ${balanced.diagnostic.droppedCallIds.length} incomplete tool call(s)`,
        )
        options.messages = balanced.messages as Message[]
      }
    }
    return next()
  }, { global: true })
}
