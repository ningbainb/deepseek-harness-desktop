import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply, name, inject, VALUE_MODE_SECTION_NAME } from '../src/index.ts'

describe('ValueMode Host Plugin', () => {
  let ctx: Context
  let registeredTools: unknown[]
  let registeredSections: unknown[]

  beforeEach(() => {
    ctx = new Context()
    registeredTools = []
    registeredSections = []

    ctx.tools = {
      register: vi.fn().mockImplementation((tool) => registeredTools.push(tool)),
    } as never
    ctx.systemPrompt = {
      section: vi.fn().mockImplementation((sec) => registeredSections.push(sec)),
    } as never
    ctx.settings = {
      register: vi.fn().mockReturnValue({
        get: () => ({}),
        watch: () => () => {},
        update: async () => {},
        replace: async () => {},
      }),
    } as never
    ctx.llm = {
      listProviders: vi.fn().mockReturnValue([]),
      listModels: vi.fn().mockResolvedValue([]),
    } as never
  })

  it('declares correct plugin name and inject dependencies', () => {
    expect(name).toBe('value-mode')
    expect(inject).toContain('tools')
    expect(inject).toContain('systemPrompt')
    expect(inject).toContain('settings')
    expect(inject).toContain('llm')
    expect(inject).toContain('agentDefaultModel')
  })

  it('registers consult_expert tool and systemPrompt section upon apply', () => {
    apply(ctx, {
      enabled: true,
      strategy: 'balanced',
      executor: { provider: 'p1', model: 'm1' },
      expert: { provider: 'p2', model: 'm2' },
    })

    expect(ctx.tools.register).toHaveBeenCalled()
    expect(registeredTools.length).toBe(1)
    expect((registeredTools[0] as { name: string }).name).toBe('consult_expert')

    expect(ctx.systemPrompt.section).toHaveBeenCalled()
    expect(registeredSections.length).toBe(1)
    expect((registeredSections[0] as { name: string }).name).toBe(VALUE_MODE_SECTION_NAME)
  })
})
