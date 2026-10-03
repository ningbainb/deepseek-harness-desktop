import { afterEach, expect, it, vi } from 'vitest'
import { postRelay } from '../src/client/relay-client.ts'
import { RELAY_STATUS_PATH } from '../src/relay-protocol.ts'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('bounds stalled response bodies and cleans up the timeout', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async (_input, options) => ({ ok: true, status: 200,
    json: async () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }),
  })))
  const result = postRelay(RELAY_STATUS_PATH)
  const failure = expect(result).rejects.toMatchObject({ code: 'unreachable' })
  await vi.advanceTimersByTimeAsync(60_000)
  await failure
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves readonly error classification without displaying response internals', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 403 })))
  await expect(postRelay(RELAY_STATUS_PATH)).rejects.toMatchObject({ code: 'forbidden' })
})

it('rejects malformed JSON and clears the timeout after an ordinary reply', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid-json')))
  await expect(postRelay(RELAY_STATUS_PATH)).rejects.toMatchObject({ code: 'malformed-response' })
  expect(vi.getTimerCount()).toBe(0)
})
