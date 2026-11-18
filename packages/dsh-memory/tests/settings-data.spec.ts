import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemoryPublicItem } from '../src/core/schema.ts'
import { filterMemoryItems, readMemoryCatalog } from '../src/client/settings-data.ts'

const item = (id: string, changes: Partial<MemoryPublicItem> = {}): MemoryPublicItem => ({
  id, scope: 'global', content: 'Short summaries', tags: ['Preference'], pinned: false,
  source: 'explicit', createdAt: 100, updatedAt: 100, ...changes,
})

describe('memory settings list', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('searches content, tags and known targets in the selected scope', () => {
    const items = [
      item('global'),
      item('another-workspace', { scope: 'workspace', workspaceId: 'bravo' }),
      item('workspace', { scope: 'workspace', workspaceId: 'alpha', tags: ['Engineering'] }),
      item('session', { scope: 'session', sessionId: 'alpha', tags: ['Engineering'] }),
    ]
    expect(filterMemoryItems(items, 'workspace', ' ALPHA  engineering Short ')).toEqual([items[2]])
    expect(filterMemoryItems(items, 'session', 'alpha')).toEqual([items[3]])
  })

  it('shows pinned items first and newest edits within each group without changing source order', () => {
    const items = [item('old'), item('recent', { updatedAt: 300 }), item('pinned', { pinned: true })]
    expect(filterMemoryItems(items, 'all', '')).toEqual([items[2], items[1], items[0]])
    expect(items.map(entry => entry.id)).toEqual(['old', 'recent', 'pinned'])
  })

  it('passes cancellation to both principal-scoped reads and preserves a real empty result', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, items: [] }))
    vi.stubGlobal('fetch', fetch)
    const { signal } = new AbortController()
    await expect(readMemoryCatalog(signal)).resolves.toEqual({ items: [], pending: [] })
    expect(fetch.mock.calls).toEqual([
      ['/api/dsh-memory/items?view=manage&refresh=1', { cache: 'no-store', signal }],
      ['/api/dsh-memory/pending', { cache: 'no-store', signal }],
    ])
  })

  it('rejects an incomplete or failed result in place of presenting an empty catalog', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, items: [item('allowed')] }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ ok: false, code: 'scope-unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true, items: [] }))
    vi.stubGlobal('fetch', fetch)
    const { signal } = new AbortController()
    await expect(readMemoryCatalog(signal)).rejects.toThrow('invalid memory response')
    await expect(readMemoryCatalog(signal)).rejects.toMatchObject({ code: 'scope-unavailable' })
  })
})
