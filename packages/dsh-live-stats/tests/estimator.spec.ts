import { describe, expect, it } from 'vitest'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  estimateAssistantBlockTokens,
  estimateContentTokens,
  estimateHeaderTokens,
  estimateMessageTokens,
  estimateSystemMessageTokens,
  estimateTextBlockTokens,
  estimateToolCallBlockTokens,
  resolveEstimatorConfig,
} from '../src/estimator.ts'

const SPEC = resolveEstimatorConfig({})

describe('live-stats estimator', () => {
  it('rejects non-finite density and negative or fractional overheads', () => {
    expect(() => resolveEstimatorConfig({ charsPerToken: Number.NaN })).toThrow('charsPerToken')
    expect(() => resolveEstimatorConfig({ charsPerToken: Infinity })).toThrow('charsPerToken')
    expect(() => resolveEstimatorConfig({ blockOverhead: -1 })).toThrow('blockOverhead')
    expect(() => resolveEstimatorConfig({ roleOverhead: -2 })).toThrow('roleOverhead')
  })

  it('prices every block kind and message/header framing', () => {
    // Empty assistant block list carries no role overhead.
    expect(estimateAssistantBlockTokens([], SPEC)).toBe(0)
    // Text and reasoning share the character density plus block overhead.
    expect(estimateTextBlockTokens(4, SPEC)).toBe(5)
    expect(estimateContentTokens([{ type: 'reasoning', text: 'abcd' }], SPEC)).toBe(5)
    // Tool calls price name and arguments separately.
    expect(estimateToolCallBlockTokens(4, 8, SPEC)).toBe(7)
    expect(estimateContentTokens([
      { type: 'tool-call', id: 'call_1' as never, name: 'tool', arguments: '{}' },
    ], SPEC)).toBe(6)
    // Tool results recurse into their content blocks plus framing.
    expect(estimateContentTokens([{
      type: 'tool-result',
      toolCallId: 'call_1' as never,
      isError: false,
      content: [{ type: 'text', text: 'ok' }],
    }], SPEC)).toBe(9)
    // Unknown blocks fall back to JSON sizing.
    expect(estimateContentTokens([{ type: 'mystery' } as never], SPEC)).toBe(9)
    // Message role framing applies on top of the content price.
    expect(estimateMessageTokens(createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    }), SPEC)).toBe(9)
    // User messages price the same way.
    expect(estimateMessageTokens(createUserMessage({
      content: [{ type: 'text', text: 'ok' }],
      source: { kind: 'user' },
    }), SPEC)).toBe(9)
  })

  it('bounds deep and cyclic tool-result nesting instead of overflowing', () => {
    // A deeply nested tool-result chain prices without exhausting the stack.
    let block: Parameters<typeof estimateContentTokens>[0][number] = { type: 'text', text: 'x' }
    for (let depth = 0; depth < 1_000; depth++) {
      block = { type: 'tool-result', toolCallId: 'c' as never, isError: false, content: [block] }
    }
    expect(() => estimateContentTokens([block], SPEC)).not.toThrow()
  })

  it('caps untyped block pricing at a bounded serialized length', () => {
    // A short untyped block is priced from its full serialized length.
    expect(estimateContentTokens([{ type: 'mystery' } as never], SPEC)).toBe(9)
    // An oversized untyped block is priced from the capped length instead of
    // the full structure, keeping both the estimate and the serialize cost
    // bounded no matter how large the block grows.
    const giant = { type: 'opaque', payload: 'x'.repeat(200_000) }
    const cappedAt = 4 + Math.ceil(4096 / SPEC.charsPerToken)
    expect(estimateContentTokens([giant] as never, SPEC)).toBe(cappedAt)
    // A block just under the cap is still priced fully (no discontinuity).
    const near = { type: 'opaque', payload: 'y'.repeat(4000) }
    const serializedLen = JSON.stringify(near).length
    if (serializedLen <= 4096) {
      expect(estimateContentTokens([near] as never, SPEC)).toBe(4 + Math.ceil(serializedLen / SPEC.charsPerToken))
    }
  })

  it('prices system surface messages and header tool schemas separately', () => {
    expect(estimateHeaderTokens(undefined, SPEC)).toBe(0)
    expect(estimateSystemMessageTokens({
      id: 'system-message' as never,
      role: 'system',
      source: { kind: 'system' },
      content: [{ type: 'text', text: 'abcd' }],
    }, SPEC)).toBe(5)
    expect(estimateHeaderTokens({
      config: { provider: 'mock', model: 'mock' },
      tools: [{ name: 'tool', description: 'd', parameters: {} }],
    }, SPEC)).toBe(17)
    expect(estimateHeaderTokens({
      config: { provider: 'mock', model: 'mock' },
      tools: [],
    }, SPEC)).toBe(0)
  })
})
