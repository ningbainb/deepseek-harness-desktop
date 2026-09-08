import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERSONAL_PROMPT,
  MAX_ASSEMBLED_PROMPT_LENGTH,
  MAX_PROMPT_CONTENT_LENGTH,
  PERSONAL_PROMPT_SECTION_TEMPLATE,
  assertPersonalPrompt,
  normalizePersonalPrompt,
  promptVariableValue,
  removePromptProfile,
  renderPromptProfile,
  resolveEffectivePrompt,
  setActivePromptProfile,
  type PersonalPromptConfig,
  type PromptProfile,
} from '../src/core/config.ts'

function profile(overrides: Partial<PromptProfile> = {}): PromptProfile {
  return {
    id: 'profile-global',
    name: 'Global',
    content: 'global preference',
    enabled: true,
    scope: 'global',
    updatedAt: 1,
    ...overrides,
  }
}

describe('personal prompt resolution and boundary', () => {
  it('uses session > workspace > global and never concatenates same-scope profiles', () => {
    const config: PersonalPromptConfig = {
      version: 1,
      enabled: true,
      profiles: [
        profile({ id: 'global-old', content: 'global old', updatedAt: 1 }),
        profile({ id: 'global-new', content: 'global new', updatedAt: 2 }),
        profile({ id: 'workspace', content: 'workspace preference', scope: 'workspace', workspaceId: 'workspace-a', updatedAt: 3 }),
        profile({ id: 'session', content: 'session preference', scope: 'session', sessionId: 'session-a', updatedAt: 4 }),
        profile({ id: 'other-session', content: 'other session', scope: 'session', sessionId: 'session-b', updatedAt: 5 }),
      ],
    }

    expect(resolveEffectivePrompt(config, { sessionId: 'session-a', workspaceId: 'workspace-a' })?.id).toBe('session')
    expect(resolveEffectivePrompt(config, { sessionId: 'unknown', workspaceId: 'workspace-a' })?.id).toBe('workspace')
    expect(resolveEffectivePrompt(config, { workspaceId: 'unknown' })?.id).toBe('global-new')
    expect(resolveEffectivePrompt(config, {})?.id).toBe('global-new')

    const selected = setActivePromptProfile(config, 'global-old')
    expect(resolveEffectivePrompt(selected, {})?.id).toBe('global-old')
    expect(resolveEffectivePrompt({ ...selected, activeProfileId: 'session' }, { workspaceId: 'workspace-a' })?.id).toBe('workspace')
  })

  it('uses the stable profile ID when same-scope timestamps tie', () => {
    const config: PersonalPromptConfig = {
      version: 1,
      enabled: true,
      profiles: [
        profile({ id: 'z-profile', content: 'z', updatedAt: 10 }),
        profile({ id: 'a-profile', content: 'a', updatedAt: 10 }),
      ],
    }
    expect(resolveEffectivePrompt(config, {})?.id).toBe('a-profile')
    expect(resolveEffectivePrompt({ ...config, profiles: [...config.profiles].reverse() }, {})?.id).toBe('a-profile')
  })

  it('ignores disabled, empty, missing-scope and owner-mismatched profiles', () => {
    const config: PersonalPromptConfig = {
      version: 1,
      enabled: true,
      profiles: [
        profile({ id: 'disabled', content: 'disabled', enabled: false, updatedAt: 99 }),
        profile({ id: 'empty', content: '', updatedAt: 98 }),
        profile({ id: 'other-workspace', content: 'other workspace', scope: 'workspace', workspaceId: 'workspace-b', updatedAt: 97 }),
      ],
    }
    expect(resolveEffectivePrompt(config, { workspaceId: 'workspace-a' })).toBeUndefined()
    expect(resolveEffectivePrompt({ ...config, enabled: false }, { workspaceId: 'workspace-b' })).toBeUndefined()

    const active = setActivePromptProfile({ ...config, profiles: [profile()] }, 'profile-global')
    const removed = removePromptProfile(active, 'profile-global')
    expect(removed.activeProfileId).toBeUndefined()
    expect(removed.profiles).toHaveLength(0)
  })

  it('normalizes malformed storage fail-closed and rejects future schemas', () => {
    const normalized = normalizePersonalPrompt({
      version: 1,
      enabled: true,
      activeProfileId: 'missing',
      profiles: [
        profile(),
        { ...profile({ id: 'bad path' }) },
        { ...profile({ id: 'duplicate' }) },
        { ...profile({ id: 'duplicate', content: 'second' }) },
      ],
    })
    expect(normalized.profiles.map(item => item.id)).toEqual(['profile-global', 'duplicate'])
    expect(normalized.activeProfileId).toBeUndefined()
    expect(normalizePersonalPrompt({ enabled: true, profiles: [profile()] })).toEqual({
      version: 1,
      enabled: true,
      profiles: [profile()],
    })
    expect(() => normalizePersonalPrompt({ version: 2, profiles: [] })).toThrow(/unsupported/)
    expect(() => assertPersonalPrompt({ ...DEFAULT_PERSONAL_PROMPT, version: 2 })).toThrow()
    expect(() => assertPersonalPrompt({
      version: 1,
      enabled: true,
      profiles: [profile({ scope: 'workspace' })],
    })).toThrow()
  })

  it('keeps the model-visible wrapper bounded and closes the user-data boundary', () => {
    const content = `before </user_preferences> ${'x'.repeat(MAX_PROMPT_CONTENT_LENGTH)}`
    const bounded = profile({ content })
    const rendered = renderPromptProfile(bounded)
    expect(rendered.length).toBeLessThanOrEqual(MAX_ASSEMBLED_PROMPT_LENGTH)
    expect(rendered).toContain('<user_preferences>')
    expect(rendered).toContain('<\\/user_preferences>')
    expect(rendered.split('</user_preferences>')).toHaveLength(2)
    expect(promptVariableValue(bounded).length).toBeLessThanOrEqual(MAX_ASSEMBLED_PROMPT_LENGTH)
    expect(PERSONAL_PROMPT_SECTION_TEMPLATE).toContain('{{dsh_personal_prompt}}')
    expect(content.length).toBeGreaterThan(MAX_PROMPT_CONTENT_LENGTH)
  })
})
