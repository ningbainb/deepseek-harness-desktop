// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
import { BranchChip } from '../src/client/chips/BranchChip.tsx'

/**
 * A minimal SlotRegistry stand-in: inject resolves synchronously for
 * declared slots and otherwise parks the callback until a declaration
 * lands (mirroring the service's declaration-lifetime semantics).
 */
function makeSlotSystem(declared: Set<string>) {
  const register = vi.fn(() => () => undefined)
  const pending = new Map<string, () => () => void>()
  const inject = vi.fn((name: string, callback: () => () => void) => {
    if (declared.has(name)) {
      callback()
      return () => undefined
    }
    pending.set(name, callback)
    return () => { pending.delete(name) }
  })
  /** A declaration lands: run the parked wait for the name, if any. */
  const declare = (name: string): void => {
    const callback = pending.get(name)
    if (callback !== undefined) {
      pending.delete(name)
      callback()
    }
  }
  return { register, inject, declare }
}

/** Assemble the ctx/scope stubs, run apply, and hand back the instruments. */
function setup(declared: Set<string>) {
  const slotSystem = makeSlotSystem(declared)
  const disposers: (() => void)[] = []
  const scope = {
    slots: slotSystem,
    conversation: {},
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
  }
  const ctx = {
    effect: vi.fn((fn: () => unknown) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return () => {}
    }),
    locale: { register: vi.fn() },
    inject: vi.fn((_services: unknown, callback: (s: typeof scope) => void) => { callback(scope) }),
  }

  apply(ctx as never)
  return { ...slotSystem, ctx, disposers }
}

describe('client apply()', () => {
  it.each([
    ['conversation.input.left'],
    ['conversation.input.left', 'conversation.input.dock'],
    ['conversation.input.left', 'conversation.input.dock', 'conversation.input.selector.context'],
  ])('mounts only the native tool when available alongside other slots (%s)', (...slots) => {
    const { register, inject } = setup(new Set(slots))
    expect(inject).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      name: 'conversation.input.left', id: 'git-graph', order: 100,
    }), BranchChip)
  })

  it('waits for a late declaration without occupying a separate composer row', () => {
    const { register, declare } = setup(new Set(['conversation.input.dock', 'conversation.input.selector.context']))
    expect(register).not.toHaveBeenCalled()
    declare('conversation.input.left')
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: 'conversation.input.left' }), BranchChip)
  })
})
