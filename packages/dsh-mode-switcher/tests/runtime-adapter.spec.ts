import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { ModeSwitcherController } from '../src/client/mode-controller.ts'
import { modeSwitcherDependencies } from '../src/client/runtime-adapter.ts'
import { sessionPreset } from '../src/client/session-preset.ts'
import { apply } from '../src/client/index.ts'

function nativeFixture(blank = false) {
  const state = { current: 'old' as string | undefined,
    byId: { old: { id: 'old', cwd: 'C:/project', blank,
      projectionValues: { agentPreset: 'standard' } } } as Record<string, any> }
  const remote = {
    agentPresets: {
      list: vi.fn(async () => ({ ok: true, value: { presets: [
        { id: 'standard', isDefault: true }, { id: 'minimal' }, { id: 'broken', broken: 'unavailable' },
      ] } })),
      select: vi.fn(async (_id: string, preset: string) => ({ ok: true, value: preset })),
    },
    session: { create: vi.fn(async (_request: unknown) => ({ ok: true, value: { sessionId: 'new', agentPreset: 'minimal' } })) },
    settings: { update: vi.fn() },
  }
  const sessions = {
    list: { getSnapshot: () => state },
    refresh: vi.fn(async () => {
      if (blank) state.byId.old.projectionValues.agentPreset = 'minimal'
      else state.byId.new = { id: 'new', blank: true, cwd: 'C:/project', projectionValues: { agentPreset: 'minimal' } }
    }),
    clear: vi.fn(() => { state.current = undefined }),
    open: vi.fn((id: string) => { state.current = id }),
  }
  const get = vi.fn((name: string) => {
    if (name === 'remote.agentPresets') return remote.agentPresets
    if (name === 'remote.session') return remote.session
    throw new Error(`modern branch must not read ${name}`)
  })
  const ctx = { get, sessions,
    workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace', path: 'C:/project' }] }) } },
  } as unknown as Context
  return { ctx, state, remote, sessions }
}

describe('official mode Runtime adapter', () => {
  it('waits for declared native Remote namespaces before mounting the UI', () => {
    const f = nativeFixture()
    const inject = vi.fn()
    const slots = { inject: vi.fn(), register: vi.fn() }
    const ctx = { ...f.ctx, inject, slots } as unknown as Context
    apply(ctx)
    expect(inject).toHaveBeenCalledOnce()
    expect(inject.mock.calls[0][0]).toEqual(['remote.agentPresets', 'remote.session'])
    expect(slots.inject).not.toHaveBeenCalled()
    expect(f.ctx.get).not.toHaveBeenCalled()
    inject.mock.calls[0][1](ctx)
    expect(slots.inject).toHaveBeenCalledOnce()
  })

  it('loads the official zero-argument roster and preserves broken-preset filtering', async () => {
    const f = nativeFixture()
    const controller = new ModeSwitcherController(modeSwitcherDependencies(f.ctx))
    expect((await controller.list()).map(preset => preset.id)).toEqual(['standard', 'minimal'])
    expect(f.remote.agentPresets.list).toHaveBeenCalledWith()
  })

  it('uses official create and refresh without removed noteAgentPreset or global settings writes', async () => {
    const f = nativeFixture()
    const deps = modeSwitcherDependencies(f.ctx)
    expect(deps.sessions.noteAgentPreset).toBeUndefined()
    expect(deps.api.settings).toBeUndefined()
    await expect(new ModeSwitcherController(deps).switch('old', 'minimal')).resolves.toBe('new')
    expect(f.remote.session.create).toHaveBeenCalledWith({ workspaceId: 'workspace', agentPreset: 'minimal' })
    expect(f.sessions.refresh).toHaveBeenCalledOnce()
    expect(f.state.current).toBe('new')
    expect(sessionPreset(f.state.byId.new)).toBe('minimal')
    expect(f.remote.settings.update).not.toHaveBeenCalled()
  })

  it('accepts the native select string result and refreshes the blank session projection', async () => {
    const f = nativeFixture(true)
    await expect(new ModeSwitcherController(modeSwitcherDependencies(f.ctx)).switch('old', 'minimal')).resolves.toBe('old')
    expect(f.remote.agentPresets.select).toHaveBeenCalledWith('old', 'minimal')
    expect(f.remote.session.create).not.toHaveBeenCalled()
    expect(sessionPreset(f.state.byId.old)).toBe('minimal')
    expect(f.remote.settings.update).not.toHaveBeenCalled()
  })

  it('leaves the original view selected when native create fails', async () => {
    const f = nativeFixture()
    f.remote.session.create.mockRejectedValueOnce(new Error('native create failed'))
    await expect(new ModeSwitcherController(modeSwitcherDependencies(f.ctx)).switch('old', 'minimal')).rejects.toThrow('native create failed')
    expect(f.state.current).toBe('old')
    expect(f.sessions.clear).not.toHaveBeenCalled()
  })

  it('keeps the explicit old-host API boundary when typed Remote is unavailable', () => {
    const f = nativeFixture()
    const api = { sessions: { create: vi.fn() }, agentPresets: { list: vi.fn(), select: vi.fn() }, settings: { update: vi.fn() } }
    const sessions = { ...f.sessions, noteAgentPreset: vi.fn() }
    const legacy = { ...f.ctx, sessions, get: (name: string) => name === 'connection' ? { api } : undefined } as unknown as Context
    const deps = modeSwitcherDependencies(legacy)
    expect(deps.api).toBe(api)
    expect(deps.sessions).toBe(sessions)
    expect(deps.api.settings?.update).toBe(api.settings.update)
  })
})

describe('session preset projection', () => {
  it('reads the official projection before a stale legacy label', () => {
    expect(sessionPreset({ agentPreset: 'standard', projectionValues: { agentPreset: 'minimal' } })).toBe('minimal')
  })
  it('does not revive a stale label when a native projection is absent or invalid', () => {
    expect(sessionPreset({ agentPreset: 'standard', projectionValues: {} })).toBeUndefined()
    expect(sessionPreset({ projectionValues: { agentPreset: 42 } })).toBeUndefined()
  })
  it('preserves the legacy field and handles missing sessions', () => {
    expect(sessionPreset({ agentPreset: 'standard' })).toBe('standard')
    expect(sessionPreset(undefined)).toBeUndefined()
  })
})
