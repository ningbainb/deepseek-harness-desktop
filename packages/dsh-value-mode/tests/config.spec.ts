import { describe, it, expect } from 'vitest'
import { Config } from '../src/core/schema.ts'
import {
  isConfigured,
  isEffectivelyActive,
  resolveResolvedConfig,
  DEFAULT_STRATEGY,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_CONTEXT_CHARS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_ALLOW_REVIEW,
  DEFAULT_SHOW_EXPERT_ACTIVITY,
} from '../src/core/config.ts'

describe('ValueMode Config', () => {
  it('has valid defaults in schema', () => {
    const parsed = Config({})
    expect((parsed.enabled as unknown as { get(): boolean }).get()).toBe(false)
    expect((parsed.strategy as unknown as { get(): string }).get()).toBe(DEFAULT_STRATEGY)
    expect((parsed.maxOutputTokens as unknown as { get(): number }).get()).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect((parsed.maxContextChars as unknown as { get(): number }).get()).toBe(DEFAULT_MAX_CONTEXT_CHARS)
    expect((parsed.maxDepth as unknown as { get(): number }).get()).toBe(DEFAULT_MAX_DEPTH)
    expect((parsed.allowReview as unknown as { get(): boolean }).get()).toBe(DEFAULT_ALLOW_REVIEW)
    expect((parsed.showExpertActivity as unknown as { get(): boolean }).get()).toBe(DEFAULT_SHOW_EXPERT_ACTIVITY)
  })

  it('correctly judges isConfigured', () => {
    expect(isConfigured(undefined)).toBe(false)
    expect(isConfigured({})).toBe(false)
    expect(isConfigured({ executor: { provider: 'deepseek', model: 'deepseek-chat' } })).toBe(false)
    expect(
      isConfigured({
        executor: { provider: 'deepseek', model: 'deepseek-chat' },
        expert: { provider: 'openai', model: 'gpt-4o' },
      }),
    ).toBe(true)
    expect(
      isConfigured({
        executor: { provider: '   ', model: 'deepseek-chat' },
        expert: { provider: 'openai', model: 'gpt-4o' },
      }),
    ).toBe(false)

    expect(isConfigured(
      { executor: { provider: 'deepseek', model: 'deepseek-chat' } },
      { provider: 'deepseek', model: 'deepseek-reasoner' },
    )).toBe(true)
    expect(isConfigured(
      {
        executor: { provider: 'deepseek', model: 'deepseek-chat' },
        expert: { provider: 'openai', model: 'gpt-4o' },
      },
      { provider: 'deepseek', model: 'deepseek-reasoner' },
    )).toBe(true)
  })

  it('correctly judges isEffectivelyActive', () => {
    expect(isEffectivelyActive(undefined)).toBe(false)
    expect(
      isEffectivelyActive({
        enabled: false,
        executor: { provider: 'deepseek', model: 'deepseek-chat' },
        expert: { provider: 'openai', model: 'gpt-4o' },
      }),
    ).toBe(false)
    expect(
      isEffectivelyActive({
        enabled: true,
        executor: { provider: 'deepseek', model: 'deepseek-chat' },
        expert: { provider: 'openai', model: 'gpt-4o' },
      }),
    ).toBe(true)
  })

  it('resolves full config with strategy-specific defaults', () => {
    const saver = resolveResolvedConfig({
      strategy: 'saver',
    })
    expect(saver.strategy).toBe('saver')
    expect(saver.allowReview).toBe(false) // saver turns off allowReview by default

    const balanced = resolveResolvedConfig({
      strategy: 'balanced',
    })
    expect(balanced.strategy).toBe('balanced')
    expect(balanced.allowReview).toBe(true)

    const powerful = resolveResolvedConfig({
      strategy: 'powerful',
    })
    expect(powerful.strategy).toBe('powerful')
    expect(powerful.allowReview).toBe(true)
  })
})
