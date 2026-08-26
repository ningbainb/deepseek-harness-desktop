import { describe, expect, it } from 'vitest'

import {
  balanceTranscriptMessages,
  extractToolCallsFromAssistantMessage,
} from '../src/transcript-balance.ts'

describe('transcript balance guard', () => {
  it('identifies tool calls from assistant message content blocks and tool_calls field', () => {
    const dshBlockMsg = {
      role: 'assistant' as const,
      content: [
        { type: 'text', text: 'Thinking...' },
        { type: 'tool-call', id: 'call_123', name: 'read_file', arguments: '{}' },
      ],
    }
    expect(extractToolCallsFromAssistantMessage(dshBlockMsg as any)).toEqual([
      { id: 'call_123', name: 'read_file' },
    ])

    const openAiMsg = {
      role: 'assistant' as const,
      content: '',
      tool_calls: [
        { id: 'call_456', type: 'function', function: { name: 'run_cmd', arguments: '{}' } },
      ],
    }
    expect(extractToolCallsFromAssistantMessage(openAiMsg as any)).toEqual([
      { id: 'call_456', name: 'run_cmd' },
    ])
  })

  it('strips trailing assistant message if it contains unresponded tool calls', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      {
        role: 'assistant' as const,
        content: [
          { type: 'tool-call', id: 'call_pending', name: 'search', arguments: '{}' },
        ],
      },
    ]

    const result = balanceTranscriptMessages(messages as any)
    expect(result.messages.length).toBe(1)
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello' })
    expect(result.diagnostic).toEqual({
      outcome: 'stripped-trailing-assistant',
      droppedCallIds: ['call_pending'],
      droppedMessagesCount: 1,
    })
  })

  it('leaves complete conversation histories with paired tool results intact', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      {
        role: 'assistant' as const,
        content: [
          { type: 'tool-call', id: 'call_done', name: 'search', arguments: '{}' },
        ],
      },
      { role: 'tool' as const, tool_call_id: 'call_done', content: 'results' },
      { role: 'assistant' as const, content: 'Here are the results' },
    ]

    const result = balanceTranscriptMessages(messages as any)
    expect(result.messages.length).toBe(4)
    expect(result.diagnostic).toBeUndefined()
  })

  it('handles empty or non-array messages safely', () => {
    expect(balanceTranscriptMessages(undefined).messages).toEqual([])
    expect(balanceTranscriptMessages([]).messages).toEqual([])
  })
})
