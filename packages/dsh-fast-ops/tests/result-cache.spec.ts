import { describe, expect, it } from 'vitest'
import { ResultCache } from '../src/host/result-cache.ts'

describe('dsh-fast-ops ResultCache', () => {
  it('supports equals filtering, fields projection, byte-bounded paging, and session isolation', () => {
    let now = 1000
    const cache = new ResultCache({ getMaxRefs: () => 2, now: () => now })

    const ref = cache.put({
      sessionId: 'sess-a',
      producerTool: 'fast_search',
      ttlMs: 5000,
      items: [
        { path: 'a.ts', line: 10, kind: 'error' },
        { path: 'b.ts', line: 20, kind: 'warn' },
        { path: 'c.ts', line: 30, kind: 'error' },
        { path: 'd.ts', line: 40, kind: 'error' },
      ],
    })

    // Cross-session read must fail.
    expect(cache.page({ sessionId: 'sess-b', refId: ref.refId })).toEqual({
      ok: false,
      refId: ref.refId,
      error: 'reference-not-found',
    })

    const page1 = cache.page({
      sessionId: 'sess-a',
      refId: ref.refId,
      equals: { kind: 'error' },
      fields: ['path', 'line'],
      offset: 0,
      limit: 2,
    })
    expect(page1.ok).toBe(true)
    expect(page1.totalFiltered).toBe(3)
    expect(page1.items).toEqual([
      { path: 'a.ts', line: 10 },
      { path: 'c.ts', line: 30 },
    ])
    expect(page1.nextOffset).toBe(2)
    expect(page1.complete).toBe(false)

    const page2 = cache.page({
      sessionId: 'sess-a',
      refId: ref.refId,
      equals: { kind: 'error' },
      fields: ['path'],
      offset: page1.nextOffset!,
      limit: 2,
    })
    expect(page2.items).toEqual([{ path: 'd.ts' }])
    expect(page2.complete).toBe(true)
    expect(page2.nextOffset).toBeNull()

    // TTL expiry removes stale references.
    now += 6000
    expect(cache.page({ sessionId: 'sess-a', refId: ref.refId }).ok).toBe(false)
  })

  it('evicts least-recently-accessed references when exceeding maxCachedRefs', () => {
    let now = 1000
    const cache = new ResultCache({ getMaxRefs: () => 2, now: () => ++now })
    const r1 = cache.put({ sessionId: 's', producerTool: 't', items: [{ id: 1 }], ttlMs: 60000 })
    const r2 = cache.put({ sessionId: 's', producerTool: 't', items: [{ id: 2 }], ttlMs: 60000 })
    cache.page({ sessionId: 's', refId: r1.refId }) // touch r1 so r2 is LRU
    const r3 = cache.put({ sessionId: 's', producerTool: 't', items: [{ id: 3 }], ttlMs: 60000 })

    expect(cache.page({ sessionId: 's', refId: r2.refId }).ok).toBe(false)
    expect(cache.page({ sessionId: 's', refId: r1.refId }).ok).toBe(true)
    expect(cache.page({ sessionId: 's', refId: r3.refId }).ok).toBe(true)
  })
})
