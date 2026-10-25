import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/invariant.ts'

describe('legacy invariant companion', () => {
  it('preserves registration and disposal without importing a retired SDK', async () => {
    const dispose = vi.fn()
    const register = vi.fn<(packageName: string, installer: () => void) => () => void>(() => dispose)
    const ctx = { invariants: { register } } as unknown as Context
    expect(inject).toEqual(['invariants'])
    expect(await apply(ctx)).toBe(dispose)
    expect(register).toHaveBeenCalledOnce()
    expect(register.mock.calls[0]?.[0]).toBe('@linxin666/dsh-remote-web-ui')
    const installer = register.mock.calls[0]?.[1] as unknown as () => void
    expect(installer()).toBeUndefined()
  })

  it('does not silently ignore a failed registration', () => {
    const failure = new Error('registration failed')
    const ctx = { invariants: { register: () => { throw failure } } } as unknown as Context
    expect(() => apply(ctx)).toThrow(failure)
  })
})
