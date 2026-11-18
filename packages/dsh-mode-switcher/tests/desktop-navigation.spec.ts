// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
vi.mock('../src/client/runtime-adapter.ts', () => ({ modeSwitcherDependencies: () => ({}) }))
afterEach(() => { delete (window as typeof window & { dshDesktop?: unknown }).dshDesktop })
it('Desktop retains the official preset owner without a community header chooser', () => {
  Object.assign(window, { dshDesktop: { onDesktopToolOpen: vi.fn() } })
  const ctx = { sessions: { noteAgentPreset: vi.fn() }, inject: vi.fn(), slots: { inject: vi.fn(), register: vi.fn() } }
  apply(ctx as never)
  expect(ctx.slots.inject).not.toHaveBeenCalled()
  expect(ctx.inject).not.toHaveBeenCalled()
  expect(ctx.sessions.noteAgentPreset).not.toHaveBeenCalled()
})
it('Web retains the community header and existing mode controller actions', () => {
  const register = vi.fn(), ctx = { sessions: { noteAgentPreset: vi.fn() },
    slots: { register, inject: vi.fn((_slot, callback) => callback()) } }
  apply(ctx as never)
  expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: 'conversation.session.header.actions', id: 'mode-switcher', inject: expect.any(Function) }), expect.any(Function))
})
