import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createConsultExpertTool, parseExpertResponse } from '../src/core/expert.ts'
import { valueModeState } from '../src/core/state.ts'
import type { ValueModeConfig } from '../src/core/config.ts'

describe('consult_expert Tool', () => {
  let ctx: Context
  let config: ValueModeConfig

  beforeEach(() => {
    ctx = new Context()
    valueModeState.resetAll()
    config = {
      enabled: true,
      executor: { provider: 'prov1', model: 'exec-model' },
      expert: { provider: 'prov2', model: 'expert-model' },
      maxOutputTokens: 2048,
      maxContextChars: 1000,
      maxDepth: 1,
    }
  })

  it('returns fallback when Value Mode is disabled', async () => {
    config.enabled = false
    const tool = createConsultExpertTool(ctx, () => config)
    const result = await tool.execute(
      {
        purpose: 'debug',
        question: 'Why is it failing?',
        context: 'Error 500',
      },
      { signal: new AbortController().signal } as never,
    )

    expect(result.success).toBe(false)
    expect(result.fallbackNote).toContain('not active')
  })

  it('returns fallback when expert model is not configured', async () => {
    config.expert = undefined
    const tool = createConsultExpertTool(ctx, () => config)
    const result = await tool.execute(
      {
        purpose: 'architecture',
        question: 'How to design?',
        context: 'Design context',
      },
      { signal: new AbortController().signal } as never,
    )

    expect(result.success).toBe(false)
  })

  it('executes expert consultation successfully via ctx.llm.stream', async () => {
    const mockChunks = [
      { type: 'text-delta', text: '### Root Cause\nMemory leak in event emitter.\n\n' },
      { type: 'text-delta', text: '### Recommendations\nUnregister listener on dispose.' },
      { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } },
    ]

    ctx.llm = {
      stream: vi.fn().mockImplementation(async function* () {
        for (const chunk of mockChunks) {
          yield chunk
        }
      }),
    } as never

    const tool = createConsultExpertTool(ctx, () => config)
    const result = await tool.execute(
      {
        purpose: 'debug',
        question: 'Why is memory growing?',
        context: 'Heap snapshot shows listeners retaining objects.',
      },
      { signal: new AbortController().signal } as never,
    )

    expect(result.success).toBe(true)
    expect(result.purpose).toBe('debug')
    expect(result.model).toBe('prov2/expert-model')
    expect(result.rootCause).toContain('Memory leak')
    expect(result.recommendation).toContain('Unregister listener')

    const stats = valueModeState.getGlobalMetrics()
    expect(stats.expertCalls).toBe(1)
  })

  it('truncates context exceeding maxContextChars', async () => {
    let capturedOptions: unknown
    ctx.llm = {
      stream: vi.fn().mockImplementation(async function* (options: unknown) {
        capturedOptions = options
        yield { type: 'text-delta', text: 'Analysis complete.' }
      }),
    } as never

    const tool = createConsultExpertTool(ctx, () => config)
    const longContext = 'A'.repeat(2500)
    await tool.execute(
      {
        purpose: 'plan',
        question: 'Refactor plan',
        context: longContext,
      },
      { signal: new AbortController().signal } as never,
    )

    const promptText = (capturedOptions as { messages: [{ content: [{ text: string }] }] }).messages[0].content[0].text
    expect(promptText).toContain('Context truncated: exceeded maxContextChars limit of 1000')
  })

  it('enforces recursion depth guardrail', async () => {
    const tool = createConsultExpertTool(ctx, () => config)
    valueModeState.enterExpertCall('test-session') // simulate depth 1

    const result = await tool.execute(
      {
        purpose: 'architecture',
        question: 'Nested call?',
        context: 'ctx',
      },
      { signal: new AbortController().signal, sessionId: 'test-session' } as never,
    )

    expect(result.success).toBe(false)
    expect(result.fallbackNote).toContain('Maximum consultation depth')
  })

  it('gracefully handles LLM stream error without throwing', async () => {
    ctx.llm = {
      stream: vi.fn().mockImplementation(() => {
        throw new Error('Rate limit exceeded (429)')
      }),
    } as never

    const tool = createConsultExpertTool(ctx, () => config)
    const result = await tool.execute(
      {
        purpose: 'review',
        question: 'Review PR',
        context: 'Diff here',
      },
      { signal: new AbortController().signal } as never,
    )

    expect(result.success).toBe(false)
    expect(result.summary).toContain('专家模型咨询失败')
    expect(result.fallbackNote).toContain('Rate limit exceeded (429)')
  })

  it('parses expert structured response sections correctly', () => {
    const raw = `
### Root Cause
Missing index on query column.

### Recommendations
Add B-Tree index on created_at.

### Risks
Index creation may lock large tables temporarily.

### Verification
Run EXPLAIN ANALYZE on query.
`
    const parsed = parseExpertResponse(raw, 'debug')
    expect(parsed.rootCause).toContain('Missing index')
    expect(parsed.recommendation).toContain('Add B-Tree index')
    expect(parsed.risks).toContain('lock large tables')
    expect(parsed.verification).toContain('EXPLAIN ANALYZE')
  })
})
