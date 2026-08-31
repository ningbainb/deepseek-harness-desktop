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
})
