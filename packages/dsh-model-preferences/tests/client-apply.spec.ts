import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

function fakeSettingsScope() {
  const value = {
    version: 1 as const,
    pinnedModels: [],
    providerOrder: [],
    disabledProviders: [],
    recentModels: [],
  }
  return {
    getSnapshot: () => ({ value, revision: 0, writable: true }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
  }
}

describe('model preference client registration', () => {
  it('uses the public /model decoration, the official Models page extension, and a lower-priority composer seat', async () => {
    const settingsScope = fakeSettingsScope()
    const locale = {
      register: vi.fn(),
      bind: vi.fn(() => (key: string) => key),
      resolveText: vi.fn(function (this: unknown, text: string | { en: string; zh: string }) {
        expect(this).toBe(locale)
        return typeof text === 'string' ? text : text.zh
      }),
    }
    const command = {
      register: vi.fn(() => () => {}),
      decorate: vi.fn(() => () => {}),
    }
    const directory = {
      store: {
        getSnapshot: () => ({
          current: null,
          routable: null,
          groups: [],
          failures: [],
          status: 'idle' as const,
          error: null,
        }),
      },
      load: vi.fn(async () => ({ groups: [], failures: [] })),
      select: vi.fn(async () => {}),
    }
    const models = { directoryFor: vi.fn(() => directory) }
    const modelCatalog = vi.fn(async () => ({
      ok: true as const,
      value: {
        groups: [{ id: 'openai-codex', name: 'OpenAI Codex', models: [{ id: 'gpt-test', name: 'GPT Test' }] }],
        failures: [],
      },
    }))
    let workingDirectory = 'D:/fixture/worktree'
    const sessions = {
      subagentAddress: vi.fn(() => undefined),
      binding: () => ({ session: { projections: { faceOf: () => ({ getSnapshot: () => workingDirectory }) } } }),
      list: { getSnapshot: () => ({ byId: { 'session-a': { cwd: 'D:/fixture/project' } } }) },
    }
    const stopCatalogChanges = vi.fn()
    const subscribeRemote = vi.fn((_event: string, _callback: (key: string) => void) => stopCatalogChanges)
    const slotRegistrations: Array<{ contribution: any; component: unknown }> = []
    const dependencySets: string[][] = []
    const slots = {
      register: vi.fn((contribution: any, component: unknown) => {
        slotRegistrations.push({ contribution, component })
        return contribution
      }),
      inject: vi.fn((_name: string, factory: () => unknown) => factory()),
    }
    const scopeFor = (dependencies: string[]) => {
      if (dependencies.includes('commandUi')) {
        return {
          get: (name: string) => name === 'commandUi' ? command : models,
          sessions,
          effect: (effect: () => unknown) => effect(),
        }
      }
      return { slots, modelDirectories: models, sessions, get: (name: string) => name === 'modelDirectories' ? models : undefined }
    }
    const ctx: any = {
      locale,
      settingsScope,
      remote: { session: { modelCatalog }, $on: subscribeRemote },
      effect: (effect: () => unknown) => effect(),
      get: (name: string) => name === 'webUiSettings' ? { bind: vi.fn(() => settingsScope) } : undefined,
      inject: (dependencies: string[], callback: (scope: unknown) => unknown) => {
        dependencySets.push(dependencies)
        return callback(scopeFor(dependencies))
      },
    }

    apply(ctx)

    expect(inject).toContain('sessions')
    expect(inject).toContain('remote.session')
    expect(dependencySets.filter(set => set.includes('modelDirectories'))).toSatisfy(
      sets => sets.every(set => set.includes('remote.session')),
    )
    expect(locale.register).toHaveBeenCalledWith('model-preferences', expect.any(Object))
    expect(command.register).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'model' }))
    expect(command.decorate).toHaveBeenCalledWith(expect.objectContaining({ name: 'model' }))
    expect(slotRegistrations.map(entry => entry.contribution.name)).not.toContain('settings.section')
    expect(slotRegistrations.map(entry => entry.contribution.name)).not.toContain('web-ui.plugin.item')
    expect(slotRegistrations.map(entry => entry.contribution.name)).toContain('settings.models.footer')
    expect(slotRegistrations.find(entry => entry.contribution.name === 'settings.models.footer')?.contribution).toMatchObject({ id: 'model-preferences', order: 10, children: { 'model-preferences.onboarding': { kind: 'list', scope: 'root' } } })
    const settingsContribution = slotRegistrations.find(entry => entry.contribution.name === 'settings.models.footer')?.contribution
    await expect(settingsContribution.inject().loadCatalog()).resolves.toEqual({
      groups: [{ id: 'openai-codex', name: 'OpenAI Codex', models: [{ id: 'gpt-test', name: 'GPT Test' }] }],
      failures: [],
    })
    expect(modelCatalog).toHaveBeenCalledOnce()
    const onCatalogChanged = vi.fn()
    expect(settingsContribution.inject().subscribeCatalogChanges(onCatalogChanged)).toBe(stopCatalogChanges)
    expect(subscribeRemote).toHaveBeenCalledWith('credentials/record-updated', expect.any(Function))
    const notify = subscribeRemote.mock.calls[0]![1]
    notify('llm-pi-ai/other-provider')
    expect(onCatalogChanged).not.toHaveBeenCalled()
    notify('llm-pi-ai/openai-codex')
    expect(onCatalogChanged).toHaveBeenCalledOnce()
    expect(slotRegistrations.map(entry => entry.contribution.name)).toContain('conversation.input.model')
    const modelContribution = slotRegistrations.find(entry => entry.contribution.name === 'conversation.input.model')?.contribution
    expect(modelContribution?.priority).toBe(-10)
    expect(modelContribution?.children).toEqual({
      'model-preferences.menu.options': { kind: 'list', scope: 'session' },
      'model-preferences.menu.pane': { kind: 'keyed', scope: 'session' },
    })
    const composer = modelContribution?.inject('session-a')
    expect(composer.directory).toBe(directory.store)
    expect(composer.getSessionCwd?.()).toBe('D:/fixture/worktree')
    workingDirectory = 'D:/fixture/other-worktree'
    expect(composer.getSessionCwd?.()).toBe(workingDirectory)
    expect(composer.resolveText({ en: 'Recommended', zh: '推荐' })).toBe('推荐')
    expect(composer.resolveText('Provider label')).toBe('Provider label')
  })
})
