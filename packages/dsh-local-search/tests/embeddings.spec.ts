import { expect, test, vi } from 'vitest'
import type { SearchDocument } from '../src/core/search.ts'
import { Embeddings } from '../src/host/embeddings.ts'

test('rechecks access for every remote embedding batch', async () => {
  let allowed = true
  const request = vi.fn(async (_url: URL, init: RequestInit) => {
    const { input } = JSON.parse(String(init.body)) as { input: string[] }
    allowed = false
    return Response.json({ data: input.map((_, index) => ({ index, embedding: [1, 2] })) })
  })
  vi.stubGlobal('fetch', request)
  try {
    const embeddings = new Embeddings('unused', { mode: 'api', baseUrl: 'https://embedding.example/v1', model: 'fixture' })
    const documents: SearchDocument[] = Array.from({ length: 13 }, (_, id) => ({
      id: String(id), title: 'fixture', scope: 'global', text: 'fixture content', updatedAt: 1,
    }))
    const indexed = await embeddings.documents(documents, () => allowed)
    expect(indexed).toHaveLength(13)
    expect(request).toHaveBeenCalledTimes(1)
    expect(indexed.at(-1)?.vector).toBeUndefined()
  } finally {
    vi.unstubAllGlobals()
  }
})
