import { describe, expect, it, vi } from 'vitest'
import { ModeSwitcherController, type ModeSwitcherDeps } from '../src/client/mode-controller.ts'

function deps(blank: boolean, withOfficialDefault = false): ModeSwitcherDeps {
  const state = { current: 'old' as string | undefined, byId: { old: { id: 'old', cwd: 'C:/repo', blank, agentPreset: 'code' } } as Record<string, any> }
  return {
    sessions: {
      list: { getSnapshot: () => state },
      open: vi.fn((id: string) => { state.current = id }),
      refresh: vi.fn(async () => {
        if (!state.byId.new) state.byId.new = { id: 'new', cwd: 'C:/repo', blank: true, agentPreset: 'plan' }
      }),
      clear: vi.fn(() => { state.current = undefined }),
      noteAgentPreset: vi.fn((id: string, agentPreset: string) => { state.byId[id] = { ...state.byId[id], id, blank: true, agentPreset } }),
    },
    workspaces: {
      list: { getSnapshot: () => ({ items: [{ id: 'workspace', path: 'C:/repo' }] }) },
    },
    api: {
      sessions: {
        create: vi.fn(async ({ agentPreset }) => ({ result: { ok: true, value: { sessionId: 'new', agentPreset } } })),
      },
      agentPresets: {
        list: vi.fn(async () => ({
          result: {
            ok: true,
            value: {
              presets: withOfficialDefault
                ? [{ id: 'standard', isDefault: true }, { id: 'plan' }, { id: 'value-mode' }]
                : [],
            },
          },
        })),
        select: vi.fn(async ({ agentPreset }) => ({ result: { ok: true, value: { agentPreset } } })),
      },
      settings: {
        update: vi.fn(async () => ({ result: { ok: true, value: {} } })),
      },
    },
  }
}

describe('ModeSwitcherController', () => {
  it('switches an empty session in place', async () => {
    const d = deps(true)
    const controller = new ModeSwitcherController(d)
    await expect(controller.switch('old', 'plan')).resolves.toBe('old')
    expect(d.sessions.clear).not.toHaveBeenCalled()
    expect(d.api.sessions.create).not.toHaveBeenCalled()
    expect(d.api.agentPresets.select).toHaveBeenCalledWith({ sessionId: 'old', agentPreset: 'plan' })
  })

  it('creates and opens a same-workspace session with the requested preset', async () => {
    const d = deps(false)
    const controller = new ModeSwitcherController(d)
    const result = await controller.switch('old', 'plan')
    expect(result).toBe('new')
    expect(d.api.sessions.create).toHaveBeenCalledWith({ workspaceId: 'workspace', agentPreset: 'plan' })
    expect(d.sessions.refresh).toHaveBeenCalledOnce()
    expect(d.sessions.open).toHaveBeenCalledWith('new')
    expect(d.api.agentPresets.select).not.toHaveBeenCalled()
  })

  it('refreshes the official hero for the target and restores the user default', async () => {
    const d = deps(false, true)
    const result = await new ModeSwitcherController(d).switch('old', 'value-mode')
    expect(result).toBe('new')

    const update = d.api.settings?.update
    expect(update).toHaveBeenNthCalledWith(1, { ns: 'agent-presets', patch: { default: 'value-mode' } })
    expect(update).toHaveBeenNthCalledWith(2, { ns: 'agent-presets', patch: { default: 'standard' } })
    expect(update).toHaveBeenCalledTimes(2)
    expect((update as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((d.api.sessions.create as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
    expect((update as ReturnType<typeof vi.fn>).mock.invocationCallOrder[1]).toBeGreaterThan((d.sessions.open as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
  })
})
