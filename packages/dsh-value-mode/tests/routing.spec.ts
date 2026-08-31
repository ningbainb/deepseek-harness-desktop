import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { valueModeState } from '../src/core/state.ts'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'

describe('ValueMode Request Routing', () => {
  let ctx: Context

  beforeEach(() => {
    ctx = new Context()
    valueModeState.resetAll()

    // Mock services
    ctx.tools = { register: vi.fn() } as never
    ctx.systemPrompt = { section: vi.fn() } as never
    ctx.settings = { register: vi.fn() } as never
    ctx.llm = {
      listProviders: vi.fn().mockReturnValue([
        { id: 'deepseek', displayName: 'DeepSeek' },
        { id: 'openai', displayName: 'OpenAI' },
      ]),
      listModels: vi.fn().mockResolvedValue([]),
    } as never
  })

  it('leaves request untouched when Value Mode is disabled', async () => {
    apply(ctx, {
      enabled: false,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o', reasoningEffort: 'low' },
    })

    const initialConfig: LlmCallConfig = {
      provider: 'default-prov',
      model: 'default-model',
    }

    const payload = {
      agent: { id: 'session-1', session: { header: {} } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }

    const result = await ctx.bail('agent/request', payload as never, async () => initialConfig)
    expect(result.provider).toBe('default-prov')
    expect(result.model).toBe('default-model')
  })

  it('routes the top-level request to the expert controller model', async () => {
    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'low' },
      expert: { provider: 'openai', model: 'gpt-4o', reasoningEffort: 'low' },
    })

    const initialConfig: LlmCallConfig = {
      provider: 'default-prov',
      model: 'default-model',
    }

    const payload = {
      agent: { id: 'session-1', session: { header: { agentPreset: 'value-mode' } } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }

    const result = await ctx.bail('agent/request', payload as never, async () => initialConfig)
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o')
    expect(result.reasoningEffort).toBe('low')

    const stats = valueModeState.getSessionMetrics('session-1')
    expect(stats.controllerCalls).toBe(1)
    expect(stats.expertCalls).toBe(1)
  })

  it('routes delegated subagent sessions to the executor worker model', async () => {
    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'low' },
      expert: { provider: 'openai', model: 'gpt-4o' },
    })

    const result = await ctx.bail('agent/request', {
      agent: { id: 'child-1', session: { header: { agentPreset: 'value-mode', origin: 'subagent' } } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ provider: 'default-prov', model: 'default-model' }))

    expect(result.provider).toBe('deepseek')
    expect(result.model).toBe('deepseek-chat')
    expect(valueModeState.getSessionMetrics('child-1').subagentCalls).toBe(1)
    expect(valueModeState.getSessionMetrics('child-1').controllerCalls).toBe(0)
  })

  it('uses the host default model as the expert controller fallback', async () => {
    ctx.agentDefaultModel = {
      currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' }),
    } as never

    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
    })

    const result = await ctx.bail('agent/request', {
      agent: { id: 'default-expert', session: { header: { agentPreset: 'value-mode' } } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ provider: 'default-prov', model: 'default-model' }))

    expect(result.provider).toBe('deepseek')
    expect(result.model).toBe('deepseek-reasoner')
    expect(result.reasoningEffort).toBe('high')
  })

  it('safely degrades and does not crash when provider is unavailable', async () => {
    // LLM runtime has only 'deepseek' provider, but executor is configured for 'missing-prov'
    ctx.llm = {
      listProviders: vi.fn().mockReturnValue([{ id: 'deepseek', displayName: 'DeepSeek' }]),
    } as never

    apply(ctx, {
      enabled: true,
      executor: { provider: 'missing-prov', model: 'some-model' },
      expert: { provider: 'deepseek', model: 'deepseek-reasoner' },
    })

    const initialConfig: LlmCallConfig = {
      provider: 'default-prov',
      model: 'default-model',
    }

    const payload = {
      agent: { id: 'session-1', session: { header: { agentPreset: 'value-mode' } } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }

    const result = await ctx.bail('agent/request', payload as never, async () => initialConfig)
    expect(result.provider).toBe('default-prov')
    expect(result.model).toBe('default-model')
  })

  it('does not route ordinary sessions even when Value Mode is enabled', async () => {
    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o' },
    })

    const result = await ctx.bail('agent/request', {
      agent: { id: 'standard-session', session: { header: { agentPreset: 'standard' } } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ provider: 'default-prov', model: 'default-model' }))

    expect(result.provider).toBe('default-prov')
    expect(result.model).toBe('default-model')
    expect(valueModeState.getSessionMetrics('standard-session').executorCalls).toBe(0)
  })
})
