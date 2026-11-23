import { randomUUID } from 'node:crypto'
import type { GenerateOptions, ToolCallBlock, ToolCallId } from '@deepseek-ai/dsh-llm/types'

const open = '<dsh-tool-call>'
const close = '</dsh-tool-call>'

export function formatPrompt(options: GenerateOptions): string {
  const tools = options.tools ?? []
  const protocol = tools.length === 0 ? '' : [
    'Only DSH may execute tools. To request a declared DSH tool, emit a block in the response:',
    open + '{"name":"declared_tool","arguments":{"example":"value"}}' + close,
    'Emit one block per call without Markdown fences, then end your response and wait for the tool results. Never use Antigravity tools.',
    'DSH tool declarations: ' + JSON.stringify(tools),
  ].join('\n')
  return [
    'Respond to the ordered DSH conversation below. Do not use Antigravity tools.',
    protocol,
    JSON.stringify({
      system: options.system,
      messages: options.messages.map(message => ({
        role: message.role,
        ...(message.role === 'tool' ? { toolCallId: message.toolCallId } : {}),
        content: message.content.map(block => {
          if (block.type === 'image' || block.type === 'file') return { type: 'text', text: `[DSH ${block.type} attachment]` }
          if (block.type === 'text' || block.type === 'tool-call') return block
          return { type: block.type }
        }),
      })),
    }),
  ].filter(Boolean).join('\n\n')
}

export class ToolBridge {
  private pending = ''
  constructor(private readonly names: ReadonlySet<string>) {}

  *push(delta: string, final = false): Generator<string | ToolCallBlock> {
    if (this.names.size === 0) {
      if (delta) yield delta
      return
    }
    this.pending += delta
    while (this.pending) {
      const start = this.pending.indexOf(open)
      if (start < 0) {
        let keep = final ? 0 : Math.min(open.length - 1, this.pending.length)
        while (keep && !open.startsWith(this.pending.slice(-keep))) keep--
        const emit = this.pending.slice(0, this.pending.length - keep)
        this.pending = this.pending.slice(emit.length)
        if (emit) yield emit
        return
      }
      if (start > 0) {
        yield this.pending.slice(0, start)
        this.pending = this.pending.slice(start)
      }
      let end = this.pending.indexOf(close, open.length)
      let raw
      while (end >= 0 && end <= 64 * 1024) {
        try {
          raw = JSON.parse(this.pending.slice(open.length, end))
          break
        } catch {
          // A closing marker may occur inside a JSON string argument.
          end = this.pending.indexOf(close, end + close.length)
        }
      }
      if (end < 0) {
        if (final || this.pending.length > 64 * 1024) throw new Error('Invalid or incomplete Antigravity DSH tool call.')
        return
      }
      if (end > 64 * 1024) throw new Error('Antigravity DSH tool call exceeds the size limit.')
      if (typeof raw?.name !== 'string' || !this.names.has(raw.name) || !raw.arguments
        || typeof raw.arguments !== 'object' || Array.isArray(raw.arguments)) {
        throw new Error('Antigravity requested an invalid or undeclared DSH tool.')
      }
      this.pending = this.pending.slice(end + close.length)
      yield { type: 'tool-call', id: randomUUID() as ToolCallId, name: raw.name, arguments: JSON.stringify(raw.arguments) }
    }
  }
}
