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
    ctx.settings = {
      installSection: vi.fn().mockImplementation((_ctx, _namespace, _schema, initial, options) => {
        options.setSource(() => initial)
      }),
    } as never
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

  it.each(['controller', 'subagent'])('does not carry source effort into an undeclared %s target', async role => {
    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o' },
    })
    const source = Object.freeze({ provider: 'source', model: 'reasoner', reasoningEffort: 'high', temperature: 0.3 })
    const result = await ctx.bail('agent/request', {
      agent: { id: `effort-${role}`, session: { header: {
        agentPreset: 'value-mode', ...(role === 'subagent' ? { origin: 'subagent' } : {}),
      } } }, turn: 1, step: 1, signal: new AbortController().signal,
    } as never, async () => source as LlmCallConfig)
    expect(result.provider).toBe(role === 'subagent' ? 'deepseek' : 'openai')
    expect(result.model).toBe(role === 'subagent' ? 'deepseek-chat' : 'gpt-4o')
    expect(Object.hasOwn(result, 'reasoningEffort')).toBe(false)
    expect(result.temperature).toBe(0.3)
    expect(source.reasoningEffort).toBe('high')
  })

  it.each([
    { efforts: ['high'], want: 'high' },
    { efforts: ['low'], want: undefined },
    { efforts: [], want: undefined },
  ])('uses the exact target declared efforts $efforts', async ({ efforts, want }) => {
    ctx.llm.resolveModelInfo = async () => ({ provider: 'openai', id: 'gpt-4o', name: 'Target model',
      reasoning: { efforts: efforts.map(id => ({ id, name: id })) } }) as never
    apply(ctx, { enabled: true, executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o' } })
    const result = await ctx.bail('agent/request', {
      agent: { id: 'declared-effort', session: { header: { agentPreset: 'value-mode' } } },
      turn: 1, step: 1, signal: new AbortController().signal,
    } as never, async () => ({ provider: 'source', model: 'reasoner', reasoningEffort: 'high' }))
    expect(result.reasoningEffort).toBe(want)
  })

  it('preserves effort when the resolved request already has the exact target route', async () => {
    apply(ctx, { enabled: true, executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o' } })
    const result = await ctx.bail('agent/request', {
      agent: { id: 'same-route', session: { header: { agentPreset: 'value-mode' } } },
      turn: 1, step: 1, signal: new AbortController().signal,
    } as never, async () => ({ provider: 'openai', model: 'gpt-4o', reasoningEffort: 'high' }))
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

  it('never inherits or routes to restricted providers like antigravity-cli', async () => {
    ctx.agentDefaultModel = {
      currentSelection: () => ({ provider: 'antigravity-cli', model: 'gemini-pro' }),
    } as never
    ctx.llm = {
      listProviders: vi.fn().mockReturnValue([
        { id: 'deepseek', displayName: 'DeepSeek' },
        { id: 'antigravity-cli', displayName: 'Antigravity CLI (Gemini)' },
      ]),
    } as never

    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
    })

    const initialConfig: LlmCallConfig = {
      provider: 'default-prov',
      model: 'default-model',
    }
    const result = await ctx.bail('agent/request', {
      agent: { id: 'restricted-expert', session: { header: { agentPreset: 'value-mode' } } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => initialConfig)
    expect(result.provider).toBe('default-prov')
    expect(result.model).toBe('default-model')

    apply(ctx, {
      enabled: true,
      executor: { provider: 'antigravity-cli', model: 'gemini-flash' },
      expert: { provider: 'deepseek', model: 'deepseek-reasoner' },
    })
    const subResult = await ctx.bail('agent/request', {
      agent: { id: 'restricted-subagent', session: { header: { agentPreset: 'value-mode', origin: 'subagent' } } },
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => initialConfig)
    expect(subResult.provider).toBe('default-prov')
    expect(subResult.model).toBe('default-model')
  })

  it('tracks live preset switches in and out of value-mode despite frozen session headers', async () => {
    let sectionText: ((assembly: unknown) => string) | undefined
    ctx.systemPrompt = {
      section: vi.fn((sec: { text: (assembly: unknown) => string }) => {
        sectionText = sec.text
      }),
    } as never

    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o' },
    })

    // Switch IN: session started as standard, user switched to value-mode before first turn.
    const switchInAgent = { id: 'switch-in', session: { header: { agentPreset: 'standard' } } }
    ;(ctx as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit('agent-preset/selected', 'switch-in', 'value-mode')

    const switchedInResult = await ctx.bail('agent/request', {
      agent: switchInAgent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ provider: 'default-prov', model: 'default-model' }))
    expect(switchedInResult.provider).toBe('openai')
    expect(switchedInResult.model).toBe('gpt-4o')
    expect(sectionText?.({ agent: switchInAgent })).not.toBe('')

    // Switch OUT: session started as value-mode, user switched to standard before first turn.
    const switchOutAgent = { id: 'switch-out', session: { header: { agentPreset: 'value-mode' } } }
    ;(ctx as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit('agent-preset/selected', 'switch-out', 'standard')

    const switchedOutResult = await ctx.bail('agent/request', {
      agent: switchOutAgent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ provider: 'default-prov', model: 'default-model' }))
    expect(switchedOutResult.provider).toBe('default-prov')
    expect(switchedOutResult.model).toBe('default-model')
    expect(sectionText?.({ agent: switchOutAgent })).toBe('')
  })

  it('prefers live agentPresets.presetForSession projection across reloads', async () => {
    let sectionText: ((assembly: unknown) => string) | undefined
    ctx.systemPrompt = {
      section: vi.fn((sec: { text: (assembly: unknown) => string }) => {
        sectionText = sec.text
      }),
    } as never
    const projectedPresets = new Map<unknown, string>()
    ;(ctx as unknown as { agentPresets: unknown }).agentPresets = {
      presetForSession: (session: unknown) => projectedPresets.get(session),
    }

    apply(ctx, {
      enabled: true,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'openai', model: 'gpt-4o' },
    })

    const restoredOutSession = { header: { agentPreset: 'value-mode' } }
    projectedPresets.set(restoredOutSession, 'standard')
    const restoredOutAgent = { id: 'restored-out', session: restoredOutSession }
    const outRes = await ctx.bail('agent/request', {
      agent: restoredOutAgent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ provider: 'default-prov', model: 'default-model' }))
    expect(outRes.provider).toBe('default-prov')
    expect(sectionText?.({ agent: restoredOutAgent })).toBe('')

    const restoredInSession = { header: { agentPreset: 'standard' } }
    projectedPresets.set(restoredInSession, 'value-mode')
    const restoredInAgent = { id: 'restored-in', session: restoredInSession }
    const inRes = await ctx.bail('agent/request', {
      agent: restoredInAgent,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ provider: 'default-prov', model: 'default-model' }))
    expect(inRes.provider).toBe('openai')
    expect(sectionText?.({ agent: restoredInAgent })).not.toBe('')
  })
})
