import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import type { Session } from '@deepseek-ai/dsh-session'
import * as personalPrompt from '../src/index.ts'
import type { PersonalPromptConfig } from '../src/core/config.ts'

it('updates through official assembly without duplicate sections or changing native inputs', async () => {
  const ctx = new Context()
  let current: PersonalPromptConfig = {
    version: 1, enabled: true,
    profiles: [{ id: 'fixture', name: 'Fixture', scope: 'global', enabled: true, updatedAt: 1, content: 'fixture preference {{literal_reference}}' }],
  }
  let requestSource: 'desktop' | 'remote' = 'desktop'
  const source = {
    availabilityState: () => 'ready',
    currentScope: () => ({ source: requestSource }),
    localPrincipal: () => ({ id: 'fixture-local' }),
    snapshot: () => ({ sessions: [{ sessionId: 'fixture-session', createdByPrincipalId: 'fixture-local' }] }),
  }
  ctx.provide('userScope', source as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('settings', {
    installSection(_owner: unknown, _namespace: string, _schema: unknown, _config: unknown, hooks: { setSource(provider: () => PersonalPromptConfig): void }) {
      hooks.setSource(() => current)
    },
  } as never)
  try {
    await ctx.plugin(SystemPrompt, { personaPrefix: 'fixture-native-policy' })
    ctx.systemPrompt.context({ name: 'fixture:context', order: 1, text: 'fixture-runtime-context' })
    ctx.systemPrompt.tools(() => ({ schemas: [{ name: 'fixture_tool', description: 'fixture', parameters: { type: 'object' } }] }))
    const baseline = await ctx.systemPrompt.assemble()
    const plugin = await ctx.plugin(personalPrompt, current)
    const first = await ctx.systemPrompt.assemble()
    expect(first.sections.filter(section => section.name === personalPrompt.PERSONAL_PROMPT_SECTION_NAME).length).toBe(1)
    expect(renderPrompt(first).includes(current.profiles[0].content)).toBe(true)
    expect(first.contexts).toEqual(baseline.contexts)
    expect(first.tools).toEqual(baseline.tools)

    current = { ...current, profiles: [{ ...current.profiles[0], content: 'fixture changed preference', updatedAt: 2 }] }
    const second = await ctx.systemPrompt.assemble()
    expect(renderPrompt(second).includes(current.profiles[0].content)).toBe(true)
    expect(renderPrompt(second).includes('{{literal_reference}}')).toBe(false)
    expect(second.sections.filter(section => section.name === personalPrompt.PERSONAL_PROMPT_SECTION_NAME).length).toBe(1)
    expect(second.sections.filter(section => section.name !== personalPrompt.PERSONAL_PROMPT_SECTION_NAME)).toEqual(baseline.sections)
    expect(second.tools).toEqual(first.tools)
    expect(second.contexts).toEqual(first.contexts)

    const disposeComplete = ctx.systemPrompt.section({ name: 'fixture:complete', order: 1, text: 'fixture complete native preset', complete: true })
    const complete = await ctx.systemPrompt.assemble()
    expect(complete.sections.length).toBe(1)
    expect(renderPrompt(complete).includes(current.profiles[0].content)).toBe(false)
    disposeComplete()
    current = { ...current, enabled: false }
    expect(renderPrompt(await ctx.systemPrompt.assemble()).includes(current.profiles[0].content)).toBe(false)
    current = { ...current, enabled: true }

    // The contribution only reads the session identity; storage is outside this fixture.
    const session = { id: 'fixture-session' } as Session
    const scope = {}
    ctx.emit(scopeTarget(session, scope), 'session/created', session)
    expect(renderPrompt(await ctx.systemPrompt.assemble({ scope })).includes(current.profiles[0].content)).toBe(true)
    expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: {} })).includes(current.profiles[0].content)).toBe(false)
    requestSource = 'remote'
    expect(renderPrompt(await ctx.systemPrompt.assemble({ scope })).includes(current.profiles[0].content)).toBe(false)
    requestSource = 'desktop'
    ctx.emit(scopeTarget(session, scope), 'session/disposed', session)
    expect(renderPrompt(await ctx.systemPrompt.assemble({ scope })).includes(current.profiles[0].content)).toBe(false)

    await plugin.dispose()
    const disposed = await ctx.systemPrompt.assemble()
    expect(disposed.sections).toEqual(baseline.sections)
    expect(Object.hasOwn(disposed.variables, personalPrompt.PERSONAL_PROMPT_VARIABLE)).toBe(false)
    const reloaded = await ctx.plugin(personalPrompt, current)
    expect((await ctx.systemPrompt.assemble()).sections.filter(section => section.name === personalPrompt.PERSONAL_PROMPT_SECTION_NAME).length).toBe(1)
    await reloaded.dispose()
  } finally { await ctx.fiber.dispose() }
})
