import { describe, expect, it, vi } from 'vitest'
import { scopeTarget } from '@deepseek-ai/dsh-scope'

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
}))

import { apply } from '../src/index.ts'

describe('personal prompt host contribution', () => {
  it('registers the official SystemPrompt section and variable without context injection', () => {
    const sections: any[] = []
    const variables: any[] = []
    const userScope = {
      availabilityState: () => 'ready',
      localPrincipal: () => ({ id: 'principal-local' }),
      snapshot: () => ({ sessions: [] }),
    }
    const ctx: any = {
      settings: { installSection: mocks.install },
      userScope,
      inject: vi.fn((_dependencies: string[], callback: (scope: unknown) => unknown) => callback({
        settings: { installSection: mocks.install },
        workspaceRegistry: { list: () => [] },
      })),
      on: vi.fn(),
      effect: (effect: () => unknown) => effect(),
      systemPrompt: {
        section: vi.fn((spec: unknown) => { sections.push(spec); return vi.fn() }),
        variable: vi.fn((name: string, provider: unknown) => { variables.push({ name, provider }); return vi.fn() }),
      },
    }

    apply(ctx, {
      version: 1,
      enabled: true,
      profiles: [{ id: 'global', name: 'Global', content: 'keep responses concise', enabled: true, scope: 'global', updatedAt: 1 }],
    })

    expect(mocks.install).toHaveBeenCalledWith(ctx, 'personal-prompt', expect.anything(), expect.anything(), expect.objectContaining({ validate: expect.any(Function) }))
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ name: 'dsh:personal-prompt', order: 50 })
    expect(variables).toHaveLength(1)
    expect(variables[0]?.name).toBe('dsh_personal_prompt')
    expect(sections[0]?.text({ scope: undefined })).toContain('{{dsh_personal_prompt}}')
    expect(variables[0]?.provider({ scope: undefined })).toContain('keep responses concise')
  })

  it('fails closed when the local user-scope service is unavailable', () => {
    const sections: any[] = []
    const variables: any[] = []
    const ctx: any = {
      settings: { installSection: mocks.install },
      userScope: {
        availabilityState: () => 'unavailable',
        localPrincipal: () => ({ id: 'principal-local' }),
        snapshot: () => ({ sessions: [] }),
      },
      inject: (_dependencies: string[], callback: (scope: unknown) => unknown) => callback({
        settings: { installSection: mocks.install },
        workspaceRegistry: { list: () => [] },
      }),
      on: vi.fn(),
      effect: (effect: () => unknown) => effect(),
      systemPrompt: {
        section: vi.fn((spec: unknown) => { sections.push(spec); return vi.fn() }),
        variable: vi.fn((name: string, provider: unknown) => { variables.push({ name, provider }); return vi.fn() }),
      },
    }

    apply(ctx, {
      version: 1,
      enabled: true,
      profiles: [{ id: 'global', name: 'Global', content: 'must not cross owner boundary', enabled: true, scope: 'global', updatedAt: 1 }],
    })

    expect(sections[0]?.text({ scope: undefined })).toBe('')
    expect(variables[0]?.provider({ scope: undefined })).toBe('')
  })

  it('resolves workspace profiles only through the official session carrier and keeps remote requests closed', () => {
    const sections: any[] = []
    const variables: any[] = []
    const listeners = new Map<string, (this: unknown, session: { id: string }) => void>()
    const userScope = {
      availabilityState: () => 'ready',
      localPrincipal: () => ({ id: 'principal-local' }),
      snapshot: () => ({ sessions: [{ sessionId: 'session-a', createdByPrincipalId: 'principal-local' }] }),
      currentScope: (): { source: 'remote' } | undefined => undefined,
    }
    const ctx: any = {
      settings: { installSection: mocks.install },
      userScope,
      inject: vi.fn((_dependencies: string[], callback: (scope: unknown) => unknown) => callback({
        settings: { installSection: mocks.install },
        workspaceRegistry: { list: () => [{ id: 'workspace-a', sessionIds: ['session-a'] }] },
      })),
      on: vi.fn((event: string, listener: (this: unknown, session: { id: string }) => void) => { listeners.set(event, listener) }),
      effect: (effect: () => unknown) => effect(),
      systemPrompt: {
        section: vi.fn((spec: unknown) => { sections.push(spec); return vi.fn() }),
        variable: vi.fn((name: string, provider: unknown) => { variables.push({ name, provider }); return vi.fn() }),
      },
    }

    apply(ctx, {
      version: 1,
      enabled: true,
      profiles: [
        { id: 'global', name: 'Global', content: 'global preference', enabled: true, scope: 'global', updatedAt: 1 },
        { id: 'workspace', name: 'Workspace', content: 'workspace preference', enabled: true, scope: 'workspace', workspaceId: 'workspace-a', updatedAt: 2 },
      ],
    })

    const session = { id: 'session-a' }
    const scope = {}
    listeners.get('session/created')?.call(scopeTarget(session, scope), session)
    expect(variables[0]?.provider({ scope })).toContain('workspace preference')

    userScope.currentScope = () => ({ source: 'remote' })
    expect(variables[0]?.provider({ scope: undefined })).toBe('')
  })

  it('fails closed for unknown ownership and for sessions created in a remote scope', () => {
    const variables: any[] = []
    const listeners = new Map<string, (this: unknown, session: { id: string }) => void>()
    let source: string | undefined
    const userScope = {
      availabilityState: () => 'ready',
      localPrincipal: () => ({ id: 'principal-local' }),
      snapshot: () => ({ sessions: [{ sessionId: 'session-remote', createdByPrincipalId: 'principal-remote' }] }),
      currentScope: () => source === undefined ? undefined : ({ source }),
    }
    const ctx: any = {
      settings: { installSection: mocks.install },
      userScope,
      inject: (_dependencies: string[], callback: (scope: unknown) => unknown) => callback({
        settings: { installSection: mocks.install },
        workspaceRegistry: { list: () => [] },
      }),
      on: (event: string, listener: (this: unknown, session: { id: string }) => void) => { listeners.set(event, listener) },
      effect: (effect: () => unknown) => effect(),
      systemPrompt: {
        section: vi.fn(() => vi.fn()),
        variable: vi.fn((_name: string, provider: unknown) => { variables.push(provider); return vi.fn() }),
      },
    }

    apply(ctx, {
      version: 1,
      enabled: true,
      profiles: [{ id: 'global', name: 'Global', content: 'must not cross owner boundary', enabled: true, scope: 'global', updatedAt: 1 }],
    })

    const unknownScope = {}
    listeners.get('session/created')?.call(scopeTarget({ id: 'session-unknown' }, unknownScope), { id: 'session-unknown' })
    expect(variables[0]?.({ scope: unknownScope })).toBe('')

    source = 'remote'
    const remoteScope = {}
    listeners.get('session/created')?.call(scopeTarget({ id: 'session-remote' }, remoteScope), { id: 'session-remote' })
    expect(variables[0]?.({ scope: remoteScope })).toBe('')
  })

  it('degrades to the safe global profile when WorkspaceRegistry lookup fails', () => {
    const sections: any[] = []
    const variables: any[] = []
    const listeners = new Map<string, (this: unknown, session: { id: string }) => void>()
    const ctx: any = {
      settings: { installSection: mocks.install },
      userScope: {
        availabilityState: () => 'ready',
        localPrincipal: () => ({ id: 'principal-local' }),
        snapshot: () => ({ sessions: [{ sessionId: 'session-a', createdByPrincipalId: 'principal-local' }] }),
      },
      inject: (_dependencies: string[], callback: (scope: unknown) => unknown) => callback({
        settings: { installSection: mocks.install },
        workspaceRegistry: { list: () => { throw new Error('registry unavailable') } },
      }),
      on: (event: string, listener: (this: unknown, session: { id: string }) => void) => { listeners.set(event, listener) },
      effect: (effect: () => unknown) => effect(),
      systemPrompt: {
        section: vi.fn((spec: unknown) => { sections.push(spec); return vi.fn() }),
        variable: vi.fn((name: string, provider: unknown) => { variables.push({ name, provider }); return vi.fn() }),
      },
    }

    apply(ctx, {
      version: 1,
      enabled: true,
      profiles: [{ id: 'global', name: 'Global', content: 'safe global preference', enabled: true, scope: 'global', updatedAt: 1 }],
    })
    const session = { id: 'session-a' }
    const scope = {}
    listeners.get('session/created')?.call(scopeTarget(session, scope), session)
    expect(variables[0]?.provider({ scope })).toContain('safe global preference')
    expect(sections[0]?.text({ scope })).toContain('{{dsh_personal_prompt}}')
  })
})
