import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { getHostService } from '../src/core/host-types.ts'

describe('optional Cordis services', () => {
  it('reads the current scoped service with its receiver and falls back on a nullish result', () => {
    const host = {
      current: undefined as unknown,
      tools: 'legacy',
      get(name: string) { return name === 'tools' ? this.current : undefined },
    }
    const context = host as unknown as Context
    for (const value of [null, undefined]) {
      host.current = value
      expect(getHostService(context, 'tools')).toBe('legacy')
    }
    for (const value of [false, 0, '', { provider: 'replacement' }]) {
      host.current = value
      expect(getHostService(context, 'tools')).toBe(value)
    }
  })

  it('supports property-only hosts and treats lookup failures as unavailable', () => {
    expect(getHostService({ tools: 'legacy' } as unknown as Context, 'tools')).toBe('legacy')
    expect(getHostService({} as Context, 'tools')).toBeUndefined()
    const broken = { get() { throw new Error('unavailable') }, tools: 'legacy' }
    expect(getHostService(broken as unknown as Context, 'tools')).toBeUndefined()
    const inaccessible = { get tools() { throw new Error('unavailable') } }
    expect(getHostService(inaccessible as unknown as Context, 'tools')).toBeUndefined()
  })
})
