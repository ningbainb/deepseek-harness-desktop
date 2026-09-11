import { describe, expect, it, vi } from 'vitest'
import { ModeSwitcherController, type ModeSwitcherDeps } from '../src/client/mode-controller.ts'

function createDeps(blank = false): ModeSwitcherDeps & { state: { current: string | undefined; byId: Record<string, any> } } {
  const state = {
    current: 'old' as string | undefined,
    byId: { old: { id: 'old', cwd: 'C:/repo', blank, agentPreset: 'standard' } } as Record<string, any>,
  }
  return {
    state,
    sessions: {
      list: { getSnapshot: () => state },
      open: vi.fn((id: string) => { state.current = id }),
      refresh: vi.fn(async () => {}),
      clear: vi.fn(() => { state.current = undefined }),
      noteAgentPreset: vi.fn(),
    },
    workspaces: {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace', path: 'C:/repo', sessionIds: ['old'] }] }) },
    },
    api: {
      sessions: {
        create: vi.fn(async ({ agentPreset }) => ({ result: { ok: true, value: { sessionId: 'new', agentPreset } } })),
      },
      agentPresets: {
        list: vi.fn(async () => ({ result: { ok: true, value: { presets: [] } } })),
        select: vi.fn(async ({ agentPreset }) => ({ result: { ok: true, value: { agentPreset } } })),
      },
    },
  }
}

describe('ModeSwitcherController regressions', () => {
  it('does not reuse history when a cold blank hint disagrees with the loaded native projection', async () => {
    const deps = createDeps(true)
    deps.state.byId.old.projectionValues = { sessionListMetadata: { blank: false, lastPromptAt: 100 } }
    await expect(new ModeSwitcherController(deps).switch('old', 'minimal')).resolves.toBe('new')
    expect(deps.api.agentPresets.select).not.toHaveBeenCalled()
    expect(deps.api.sessions.create).toHaveBeenCalledWith({ workspaceId: 'workspace', agentPreset: 'minimal' })
  })

  it('does not let an older blank projection downgrade an engaged list row', async () => {
    const deps = createDeps(false)
    deps.state.byId.old.projectionValues = { sessionListMetadata: { blank: true, lastPromptAt: null } }
    await expect(new ModeSwitcherController(deps).switch('old', 'minimal')).resolves.toBe('new')
    expect(deps.api.agentPresets.select).not.toHaveBeenCalled()
  })

  it('retains in-place switching for a genuinely blank native session', async () => {
    const deps = createDeps(true)
    deps.state.byId.old.projectionValues = { sessionListMetadata: { blank: true, lastPromptAt: null } }
    await expect(new ModeSwitcherController(deps).switch('old', 'minimal')).resolves.toBe('old')
    expect(deps.api.sessions.create).not.toHaveBeenCalled()
  })

  it('creates a target-preset session instead of racing a standard blank draft', async () => {
    const deps = createDeps()
    const result = await new ModeSwitcherController(deps).switch('old', 'value-mode')

    expect(result).toBe('new')
    expect(deps.api.sessions.create).toHaveBeenCalledWith({ workspaceId: 'workspace', agentPreset: 'value-mode' })
    expect(deps.api.agentPresets.select).not.toHaveBeenCalled()
    expect(deps.sessions.clear).toHaveBeenCalledOnce()
    expect(deps.sessions.open).toHaveBeenCalledWith('new')
  })

  it('falls back to cwd when a legacy host does not expose workspace membership', async () => {
    const deps = createDeps()
    deps.workspaces.list.getSnapshot = () => ({ items: [] })
    deps.state.byId.old = { id: 'old', cwd: 'C:/legacy', blank: false, agentPreset: 'standard' }

    await expect(new ModeSwitcherController(deps).switch('old', 'value-mode')).resolves.toBe('new')
    expect(deps.api.sessions.create).toHaveBeenCalledWith({ cwd: 'C:/legacy', agentPreset: 'value-mode' })
  })

  it('retries a transient preset selection failure for an existing blank session', async () => {
    const deps = createDeps(true)
    const select = vi.fn()
      .mockResolvedValueOnce({ result: { ok: false, error: { message: 'session is still loading' } } })
      .mockResolvedValueOnce({ result: { ok: false, error: { message: 'session is still loading' } } })
      .mockResolvedValueOnce({ result: { ok: true, value: { agentPreset: 'value-mode' } } })
    deps.api.agentPresets.select = select

    await expect(new ModeSwitcherController(deps).switch('old', 'value-mode')).resolves.toBe('old')
    expect(select).toHaveBeenCalledTimes(3)
    expect(deps.sessions.noteAgentPreset).toHaveBeenCalledWith('old', 'value-mode')
  })

  it('uses the original cwd instead of an unrelated first workspace', async () => {
    const deps = createDeps()
    deps.workspaces.list.getSnapshot = () => ({ items: [{ workspaceId: 'unrelated', path: 'D:/another-project' }] })

    await expect(new ModeSwitcherController(deps).switch('old', 'value-mode')).resolves.toBe('new')
    expect(deps.api.sessions.create).toHaveBeenCalledWith({ cwd: 'C:/repo', agentPreset: 'value-mode' })
  })

  it('refuses to create in an unrelated workspace when the original cwd is missing', async () => {
    const deps = createDeps()
    deps.state.byId.old = { id: 'old', blank: false, agentPreset: 'standard' }
    deps.workspaces.list.getSnapshot = () => ({ items: [{ workspaceId: 'unrelated', path: 'D:/another-project' }] })

    await expect(new ModeSwitcherController(deps).switch('old', 'value-mode')).rejects.toThrow('工作区')
    expect(deps.api.sessions.create).not.toHaveBeenCalled()
    expect(deps.state.current).toBe('old')
  })

  it('keeps the original conversation selected when target session creation fails', async () => {
    const deps = createDeps()
    deps.api.sessions.create = vi.fn(async () => ({ result: { ok: false, error: { message: 'temporary create failure' } } }))

    await expect(new ModeSwitcherController(deps).switch('old', 'value-mode')).rejects.toThrow('temporary create failure')
    expect(deps.state.current).toBe('old')
    expect(deps.sessions.open).not.toHaveBeenCalledWith('new')
    expect(deps.state.byId.old.cwd).toBe('C:/repo')
  })

  it('keeps the original conversation selected when the post-create refresh fails', async () => {
    const deps = createDeps()
    deps.sessions.refresh = vi.fn(async () => { throw new Error('temporary refresh failure') })

    await expect(new ModeSwitcherController(deps).switch('old', 'value-mode')).rejects.toThrow('temporary refresh failure')
    expect(deps.state.current).toBe('old')
    expect(deps.sessions.open).not.toHaveBeenCalledWith('new')
  })

  it('does not replace a conversation the user opened while creation was pending', async () => {
    const deps = createDeps()
    const create = vi.fn(async () => {
      deps.state.byId.other = { id: 'other', cwd: 'D:/another-project', blank: false, agentPreset: 'standard' }
      deps.state.current = 'other'
      return { result: { ok: true, value: { sessionId: 'new', agentPreset: 'value-mode' } } }
    })
    deps.api.sessions.create = create

    await expect(new ModeSwitcherController(deps).switch('old', 'value-mode')).resolves.toBe('new')
    expect(deps.state.current).toBe('other')
    expect(deps.sessions.open).not.toHaveBeenCalledWith('new')
    expect(deps.sessions.noteAgentPreset).toHaveBeenCalledWith('new', 'value-mode')
  })
})
