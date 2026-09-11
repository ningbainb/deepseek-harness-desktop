import { afterEach, expect, it, vi } from 'vitest'
import { createModelCatalogLoader, MODEL_CATALOG_TIMEOUT_MS } from '../src/client/model-catalog.ts'
import { zh } from '../src/client/locales.ts'

const result = (id = 'configured') => ({ ok: true, value: { groups: [{ id, models: [{ id: 'model', name: 'Model' }] }], failures: [] } })
const disposers: (() => void)[] = []
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.useRealTimers() })

function fixture(request = vi.fn().mockResolvedValue(result())) {
  const listeners = new Map<string, () => void>()
  const subscribe = (name: string, fn: () => void) => { listeners.set(name, fn); return () => { listeners.delete(name) } }
  const ctx = {
    on: subscribe,
    remote: { session: { modelCatalog: request }, $on: subscribe },
    get: () => ({ generation: { subscribe: (fn: () => void) => subscribe('generation', fn) } }),
    effect: (fn: () => () => void) => { disposers.push(fn()) },
  }
  return { load: createModelCatalogLoader(ctx as never, key => zh[key]), request, listeners }
}

it('deduplicates concurrent and repeated opens; refreshes after the short reuse window', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const one = f.load(), two = f.load()
  expect(one).toBe(two)
  expect(await one).toEqual(result().value)
  await f.load()
  expect(f.request).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(30_001)
  await f.load()
  expect(f.request).toHaveBeenCalledTimes(2)
})

it.each(['connection/reset', 'generation', 'llm/adapters-updated', 'settings/document-updated', 'credentials/reference-updated'])('invalidates model reuse on %s', async event => {
  const f = fixture()
  await f.load()
  f.listeners.get(event)!()
  f.request.mockResolvedValue(result('replacement'))
  expect((await f.load()).groups[0].id).toBe('replacement')
  expect(f.request).toHaveBeenCalledTimes(2)
})

it('bounds a hanging read, permits retry and ignores the late obsolete result', async () => {
  vi.useFakeTimers()
  let finish!: (value: unknown) => void
  const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(result('retry'))
  const f = fixture(request)
  const first = expect(f.load()).rejects.toThrow(zh.catalogTimeout)
  await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TIMEOUT_MS)
  await first
  expect((await f.load()).groups[0].id).toBe('retry')
  finish(result('old'))
  await Promise.resolve()
  expect((await f.load()).groups[0].id).toBe('retry')
  expect(vi.getTimerCount()).toBe(0)
})

it('rejects an old runtime result and releases subscriptions on disposal', async () => {
  const request = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(result('new-host'))
  const f = fixture(request)
  const old = expect(f.load()).rejects.toThrow(zh.catalogChanged)
  await Promise.resolve()
  f.listeners.get('generation')!()
  await old
  expect((await f.load()).groups[0].id).toBe('new-host')
  disposers.splice(0).forEach(dispose => dispose())
  expect(f.listeners.size).toBe(0)
  await expect(f.load()).rejects.toThrow(zh.catalogUnavailable)
})

it('preserves provider-local failures and retries whole-request failures', async () => {
  const failure = { id: 'offline', name: 'Offline', message: 'not available' }
  const request = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: 'denied' } })
    .mockResolvedValue({ ok: true, value: { groups: result().value.groups, failures: [failure] } })
  const f = fixture(request)
  await expect(f.load()).rejects.toThrow('denied')
  expect((await f.load()).failures).toEqual([failure])
  expect(f.request).toHaveBeenCalledTimes(2)
})
