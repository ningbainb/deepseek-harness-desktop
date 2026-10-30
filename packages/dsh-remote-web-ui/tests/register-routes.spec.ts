import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it } from 'vitest'
import { registerRoutesAtomically } from '../src/register-routes.ts'

const route = (path: string): WebRoute => ({ kind: 'exact', path, handler: (_req, res) => { res.end() } })

describe('route registration transaction', () => {
  it('rolls back a partially registered batch in reverse order and preserves the collision', () => {
    const collision = new Error('duplicate /api/update/status')
    const live = new Set(['/api/update/status'])
    const removed: string[] = []
    const register = (entry: WebRoute): (() => void) => {
      if (live.has(entry.path)) throw collision
      live.add(entry.path)
      return () => { removed.push(entry.path); live.delete(entry.path) }
    }
    expect(() => registerRoutesAtomically(register, [route('/pair'), route('/m'), route('/api/update/status')]))
      .toThrow(collision)
    expect(removed).toEqual(['/m', '/pair'])
    expect([...live]).toEqual(['/api/update/status'])
  })

  it('attempts every rollback even when a disposer fails, retaining the registration error as cause', () => {
    const collision = new Error('duplicate')
    const cleanupError = new Error('cleanup failed')
    const removed: string[] = []
    const register = (entry: WebRoute): (() => void) => {
      if (entry.path === '/collision') throw collision
      return () => {
        removed.push(entry.path)
        if (entry.path === '/second') throw cleanupError
      }
    }
    let failure: unknown
    try { registerRoutesAtomically(register, [route('/first'), route('/second'), route('/collision')]) }
    catch (error) { failure = error }
    expect(removed).toEqual(['/second', '/first'])
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).cause).toBe(collision)
    expect((failure as AggregateError).errors).toEqual([collision, cleanupError])
  })

  it('disposes a successful batch in reverse order only once', () => {
    const removed: string[] = []
    const dispose = registerRoutesAtomically(entry => () => { removed.push(entry.path) }, [route('/first'), route('/second')])
    dispose()
    dispose()
    expect(removed).toEqual(['/second', '/first'])
  })

  it('finishes normal cleanup after a failure and does not repeat stale disposers', () => {
    const cleanupError = new Error('cleanup failed')
    const removed: string[] = []
    const dispose = registerRoutesAtomically(entry => () => {
      removed.push(entry.path)
      if (entry.path === '/second') throw cleanupError
    }, [route('/first'), route('/second')])
    expect(dispose).toThrow(cleanupError)
    expect(removed).toEqual(['/second', '/first'])
    expect(dispose).not.toThrow()
    expect(removed).toEqual(['/second', '/first'])
  })
})
