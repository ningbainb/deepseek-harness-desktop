import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERSONAL_PROMPT } from '../src/core/config.ts'
import { persistPersonalPromptConfig } from '../src/client/persist-config.ts'

describe('personal prompt atomic settings persistence', () => {
  it('uses one mutation with the read revision and clears an absent active selection', async () => {
    const form = { mutate: vi.fn(async () => true) }
    expect(await persistPersonalPromptConfig(form, DEFAULT_PERSONAL_PROMPT, 7)).toBe(true)
    expect(form.mutate).toHaveBeenCalledExactlyOnceWith([
      { op: 'set', path: ['profiles'], value: DEFAULT_PERSONAL_PROMPT.profiles },
      { op: 'set', path: ['enabled'], value: DEFAULT_PERSONAL_PROMPT.enabled },
      { op: 'unset', path: ['activeProfileId'] },
    ], 7)
  })

  it('writes an explicit active selection in the same transaction', async () => {
    const form = { mutate: vi.fn(async () => true) }
    await persistPersonalPromptConfig(form, { ...DEFAULT_PERSONAL_PROMPT, activeProfileId: 'synthetic-selection' })
    expect(form.mutate).toHaveBeenCalledWith(expect.arrayContaining([{
      op: 'set', path: ['activeProfileId'], value: 'synthetic-selection',
    }]), undefined)
    expect(form.mutate).toHaveBeenCalledTimes(1)
  })

  it('preserves a Host refusal rather than treating it as a completed save', async () => {
    const form = { mutate: vi.fn(async () => false) }
    expect(await persistPersonalPromptConfig(form, DEFAULT_PERSONAL_PROMPT)).toBe(false)
    expect(form.mutate).toHaveBeenCalledTimes(1)
  })

  it('retains every profile field while emitting JSON-shaped values without undefined', async () => {
    const profile = {
      id: 'synthetic-profile', name: 'synthetic-name', content: 'synthetic-content',
      enabled: true, scope: 'session' as const, updatedAt: 1,
      workspaceId: 'synthetic-workspace', sessionId: 'synthetic-session',
    }
    const form = { mutate: vi.fn(async () => true) }
    await persistPersonalPromptConfig(form, { ...DEFAULT_PERSONAL_PROMPT, profiles: [profile] })
    expect(form.mutate).toHaveBeenCalledWith(expect.arrayContaining([{
      op: 'set', path: ['profiles'], value: [profile],
    }]), undefined)
  })

  it('propagates transport failure for the editor to retain its draft', async () => {
    const failure = new Error('synthetic transport failure')
    const form = { mutate: vi.fn(async () => { throw failure }) }
    await expect(persistPersonalPromptConfig(form, DEFAULT_PERSONAL_PROMPT)).rejects.toBe(failure)
  })
})
