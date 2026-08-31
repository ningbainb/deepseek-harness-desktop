import { describe, it, expect } from 'vitest'
import { buildSystemPromptGuidance, buildExpertSystemPrompt } from '../src/core/policy.ts'

describe('ValueMode Policy', () => {
  it('returns empty string when disabled', () => {
    expect(buildSystemPromptGuidance({ enabled: false })).toBe('')
  })

  it('generates compact policy prompt for each strategy', () => {
    const saver = buildSystemPromptGuidance({
      enabled: true,
      strategy: 'saver',
      executor: { provider: 'p1', model: 'm1' },
      expert: { provider: 'p2', model: 'm2' },
    })
    expect(saver).toContain('更省')
    expect(saver).toContain('专家主控')
    expect(saver).toContain('subagent')
    expect(saver).not.toContain('consult_expert')
    expect(saver.length).toBeLessThan(350) // must stay short and concise

    const balanced = buildSystemPromptGuidance({
      enabled: true,
      strategy: 'balanced',
      executor: { provider: 'p1', model: 'm1' },
      expert: { provider: 'p2', model: 'm2' },
    })
    expect(balanced).toContain('智能平衡')
    expect(balanced).toContain('专家主控')
    expect(balanced).toContain('subagent')
    expect(balanced).not.toContain('consult_expert')
    expect(balanced.length).toBeLessThan(450)

    const powerful = buildSystemPromptGuidance({
      enabled: true,
      strategy: 'powerful',
      executor: { provider: 'p1', model: 'm1' },
      expert: { provider: 'p2', model: 'm2' },
    })
    expect(powerful).toContain('更强')
    expect(powerful).toContain('专家主控')
    expect(powerful).toContain('subagent')
    expect(powerful).not.toContain('consult_expert')
    expect(powerful.length).toBeLessThan(450)
  })

  it('gives delegated child agents a bounded worker role', () => {
    const prompt = buildSystemPromptGuidance({ enabled: true }, { role: 'subagent' })
    expect(prompt).toContain('副模型子代理')
    expect(prompt).toContain('不要再次派发')
    expect(prompt).toContain('consult_expert')
  })

  it('generates expert system prompt with requested purpose', () => {
    const prompt = buildExpertSystemPrompt('architecture')
    expect(prompt).toContain('senior technical expert consultant')
    expect(prompt).toContain('architecture')
    expect(prompt).toContain('Do not perform tool calls')
  })
})
