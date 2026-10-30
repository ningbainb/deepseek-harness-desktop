import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { expect, it, vi } from 'vitest'
import { makeCustomProviderKeyPreflight, type CustomProviderCredentialRef as CredentialRef } from '../src/custom-provider-key-sdk-adapter.ts'

function fixture() {
  let value: string | undefined
  const credentials = {
    describe: vi.fn(async (_ref: CredentialRef) => ({ configured: value !== undefined, writable: true })),
    set: vi.fn(async (_ref: CredentialRef, next: string) => { value = next }),
  }
  const route = makeCustomProviderKeyPreflight(credentials)
  return { credentials, route, value: () => value, persist: (next: string) => { value = next } }
}

async function invoke(route: ReturnType<typeof makeCustomProviderKeyPreflight>, body: unknown, options: {
  host?: string; origin?: string; remote?: string; method?: string; raw?: string
} = {}) {
  const req = Readable.from([options.raw ?? JSON.stringify(body)]) as unknown as IncomingMessage
  Object.defineProperties(req, {
    method: { value: options.method ?? 'POST' },
    headers: { value: { host: options.host ?? 'localhost:3080', origin: options.origin ?? 'http://localhost:3080' } },
    socket: { value: { remoteAddress: options.remote ?? '127.0.0.1' } },
  })
  let status = 0, payload = ''
  const res = { writeHead: (code: number) => { status = code }, end: (text: string) => { payload = text } } as unknown as ServerResponse
  await route.handler(req, res)
  return { status, payload, body: JSON.parse(payload) }
}

it('saves through the official SDK and confirms presence with a value-free response', async () => {
  const state = fixture()
  expect(await invoke(state.route, { ref: 'CUSTOM_API_KEY', value: 'synthetic-a' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(state.value()).toBe('synthetic-a')
  expect(state.credentials.describe).toHaveBeenCalledTimes(2)
})

it('serializes two windows and separately mounted routes so a stale unconfigured read cannot overwrite the first key', async () => {
  const state = fixture()
  let finish!: () => void
  state.credentials.set.mockImplementationOnce(async (_ref, next) => {
    await new Promise<void>(resolve => { finish = resolve })
    state.persist(next)
  })
  const secondRoute = makeCustomProviderKeyPreflight(state.credentials)
  const first = invoke(state.route, { ref: 'CONCURRENT_API_KEY', value: 'synthetic-first' })
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  const second = invoke(secondRoute, { ref: 'CONCURRENT_API_KEY', value: 'synthetic-second' })
  await Promise.resolve(); await Promise.resolve()
  expect(state.credentials.set).toHaveBeenCalledOnce()
  finish()
  expect((await first).status).toBe(200)
  expect((await second).status).toBe(200)
  expect(state.credentials.set).toHaveBeenCalledOnce()
  expect(state.value()).toBe('synthetic-first')
})

it('keeps already configured shared references unchanged', async () => {
  const state = fixture()
  state.credentials.describe.mockResolvedValue({ configured: true, writable: true })
  expect((await invoke(state.route, { ref: 'SHARED_API_KEY', value: 'synthetic-new' })).status).toBe(200)
  expect(state.credentials.set).not.toHaveBeenCalled()
})

it('contains write errors without exposing secrets, and releases the queue for retry', async () => {
  const state = fixture()
  state.credentials.set.mockRejectedValueOnce(new Error('synthetic-private-key'))
  const failed = await invoke(state.route, { ref: 'RETRY_API_KEY', value: 'synthetic-private-key' })
  expect(failed).toMatchObject({ status: 503, body: { ok: false } })
  expect(failed.payload).not.toContain('synthetic-private-key')
  expect((await invoke(state.route, { ref: 'RETRY_API_KEY', value: 'synthetic-retry' })).status).toBe(200)
})

it.each(['read', 'confirmation', 'readonly', 'disposed'] as const)('refuses when %s cannot guarantee durable presence', async stage => {
  const state = fixture()
  if (stage === 'read') state.credentials.describe.mockRejectedValueOnce(new Error('read failed'))
  if (stage === 'confirmation') state.credentials.describe.mockResolvedValue({ configured: false, writable: true })
  if (stage === 'readonly') state.credentials.describe.mockResolvedValue({ configured: false, writable: false })
  if (stage === 'disposed') state.route.dispose()
  expect((await invoke(state.route, { ref: 'REFUSAL_API_KEY', value: 'synthetic-a' })).status).toBe(503)
  if (stage !== 'confirmation') expect(state.credentials.set).not.toHaveBeenCalled()
})

it.each([
  { origin: 'https://foreign.example' }, { remote: '10.0.0.2' }, { host: 'foreign.example' }, { method: 'GET' },
])('retains the existing bridge access guard: %j', async options => {
  const state = fixture()
  expect((await invoke(state.route, { ref: 'GUARDED_API_KEY', value: 'synthetic-a' }, options)).status).toBe(options.method ? 405 : 403)
  expect(state.credentials.describe).not.toHaveBeenCalled()
  expect(state.credentials.set).not.toHaveBeenCalled()
})

it.each([{ ref: 'PATH', value: 'blocked' }, { ref: 'BAD API_KEY', value: 'blocked' }, { ref: 'VALID_API_KEY', value: '' }, null])('rejects malformed preflight %j', async body => {
  const state = fixture()
  expect((await invoke(state.route, body)).status).toBe(400)
  expect(state.credentials.set).not.toHaveBeenCalled()
})

it('rejects malformed and oversized JSON before any credential operation', async () => {
  const state = fixture()
  expect((await invoke(state.route, {}, { raw: '{' })).status).toBe(400)
  expect((await invoke(state.route, { ref: 'BIG_API_KEY', value: 'x'.repeat(70 * 1024) })).status).toBe(400)
  expect(state.credentials.describe).not.toHaveBeenCalled()
})
