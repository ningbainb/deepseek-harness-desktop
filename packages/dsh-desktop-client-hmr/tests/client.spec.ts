import { afterEach, expect, test, vi } from 'vitest'
import { startClientBridge } from '../src/client/bridge.ts'
import { apply } from '../src/client/index.ts'

const settle = async () => { for (let turn = 0; turn < 30; turn++) await Promise.resolve() }
const disposers: (() => void)[] = []
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.useRealTimers(); vi.unstubAllGlobals() })

function fixture(fetchOverride?: typeof fetch) {
  const requests: { path: unknown; options: RequestInit | undefined }[] = []
  let stream!: ReadableStreamDefaultController<Uint8Array>
  const entries = { sync: vi.fn(async () => {}), reload: vi.fn(async () => {}) }
  const report = vi.fn()
  const fetcher = fetchOverride ?? vi.fn(async (path, options) => {
    requests.push({ path, options })
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller } }))
  }) as typeof fetch
  const dispose = startClientBridge({ entries, fetch: fetcher, report, retryDelayMs: 10 })
  disposers.push(dispose)
  return { entries, report, requests, dispose, fetcher,
    send: (text: string) => stream.enqueue(new TextEncoder().encode(text)),
    close: () => stream.close() }
}

test('uses document-relative fetch SSE with credentials and AbortSignal in the Desktop carrier', async () => {
  const result = fixture()
  await settle()
  expect(result.requests).toHaveLength(1)
  expect(result.requests[0].path).toBe('plugins/events')
  expect(result.requests[0].options?.credentials).toBe('same-origin')
  expect(result.requests[0].options?.headers).toEqual({ accept: 'text/event-stream' })
  const signal = result.requests[0].options?.signal
  expect(signal?.aborted).toBe(false)
  result.dispose()
  expect(signal?.aborted).toBe(true)
})

test('forwards graph and rebuilt frames only to the public module controller', async () => {
  const result = fixture()
  await settle()
  result.send('data: {"type":"graph","graph":{"rev":"one"}}\n\ndata: {"type":"rebuilt","id":"package","rev":"two"}\n\n')
  await settle()
  expect(result.entries.sync).toHaveBeenCalledWith({ rev: 'one' })
  expect(result.entries.reload).toHaveBeenCalledWith('package', 'two')
})

test('malformed frames never reach the controller and unknown frames are ignored', async () => {
  const result = fixture()
  await settle()
  result.send('data: secret-invalid-json\n\ndata: {"type":"future"}\n\ndata: {"type":"rebuilt","id":1,"rev":"two"}\n\n')
  await settle()
  expect(result.entries.sync).not.toHaveBeenCalled()
  expect(result.entries.reload).not.toHaveBeenCalled()
  expect(result.report).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(result.report.mock.calls)).not.toContain('secret-invalid-json')
})

test('a rejected controller operation is reported without replacing the controller queue', async () => {
  const result = fixture()
  result.entries.reload.mockRejectedValueOnce(new Error('fixture controller failure'))
  await settle()
  result.send('data: {"type":"rebuilt","id":"package","rev":"two"}\n\ndata: {"type":"rebuilt","id":"package","rev":"three"}\n\n')
  await settle()
  expect(result.entries.reload.mock.calls).toEqual([['package', 'two'], ['package', 'three']])
  expect(result.report).toHaveBeenCalledTimes(1)
})

test('EOF reconnects after a delay and disposal cancels the pending reconnect', async () => {
  vi.useFakeTimers()
  const result = fixture()
  await settle()
  result.close()
  await settle()
  await vi.advanceTimersByTimeAsync(9)
  expect(result.requests).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(result.requests).toHaveLength(2)
  result.close()
  await settle()
  result.dispose()
  await vi.advanceTimersByTimeAsync(100)
  expect(result.requests).toHaveLength(2)
})

test('HTTP refusal retries without dropping credentials or the lifetime abort signal', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn(async () => new Response('unauthorized', { status: 401 }))
  const result = fixture(fetcher)
  await settle()
  expect(result.report).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(10)
  expect(fetcher).toHaveBeenCalledTimes(2)
  const options = fetcher.mock.calls.map(call => (call as unknown[])[1] as RequestInit)
  expect(options.every(option => option.credentials === 'same-origin')).toBe(true)
  expect(options[0].signal).toBe(options[1].signal)
})

test('late fetch completion after disposal cannot dispatch a frame or schedule reconnect', async () => {
  vi.useFakeTimers()
  const pending = Promise.withResolvers<Response>()
  const fetcher = vi.fn(() => pending.promise)
  const result = fixture(fetcher)
  result.dispose()
  pending.resolve(new Response('data: {"type":"rebuilt","id":"package","rev":"two"}\n\n'))
  await settle()
  await vi.advanceTimersByTimeAsync(100)
  expect(result.entries.reload).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test.each([true, false])('the client entry selects the existing shell carrier when present: %s', async hasTransport => {
  const makeResponse = () => new Response(new ReadableStream())
  const browser = vi.fn(async () => makeResponse())
  const carrier = vi.fn(async () => makeResponse())
  vi.stubGlobal('fetch', browser)
  vi.stubGlobal('__DSH_TRANSPORT__', hasTransport ? { fetch: carrier } : undefined)
  const entries = { sync: vi.fn(async () => {}), reload: vi.fn(async () => {}) }
  const context = { get: () => ({ entries }), logger: { warn: vi.fn() },
    effect: (start: () => () => void) => { disposers.push(start()) } }
  apply(context as never)
  await settle()
  expect(carrier).toHaveBeenCalledTimes(hasTransport ? 1 : 0)
  expect(browser).toHaveBeenCalledTimes(hasTransport ? 0 : 1)
})

test('dispose cancels an in-flight read and cannot forward a late buffered event', async () => {
  vi.useFakeTimers()
  const result = fixture()
  await settle()
  result.send('data: {"type":"rebuilt","id":"package","rev":"late"}\n\n')
  result.dispose()
  await settle()
  await vi.advanceTimersByTimeAsync(100)
  expect(result.entries.reload).not.toHaveBeenCalled()
  expect(result.requests).toHaveLength(1)
})
