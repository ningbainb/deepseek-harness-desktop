import { EventEmitter } from 'node:events'
import { afterEach, expect, test, vi } from 'vitest'
import { apply, Config } from '../src/index.ts'

test('retains the public poll interval schema, default and integer lower bound', () => {
  expect(Config({}).pollIntervalMs.get()).toBe(500)
  expect(Config({ pollIntervalMs: 1 }).pollIntervalMs.get()).toBe(1)
  expect(Config({ pollIntervalMs: 750 }).pollIntervalMs.get()).toBe(750)
  for (const pollIntervalMs of [0, -1, 1.5, NaN, Infinity, '500']) {
    expect(() => Config({ pollIntervalMs })).toThrow()
  }
})

test('exposes the poll interval as an editable SDK settings field', () => {
  expect(Config.dict.pollIntervalMs.meta.volatile).toBe(true)
})

class Response extends EventEmitter {
  statusCode = 0
  headers: Record<string, string> = {}
  writes: string[] = []
  destroyed = false
  writableEnded = false
  writable = true
  writeHead(status: number, headers: Record<string, string> = {}) { this.statusCode = status; this.headers = headers; return this }
  write(data: string) { this.writes.push(data); return this.writable }
  end(data?: string) { if (data) this.writes.push(data); this.writableEnded = true; this.emit('finish'); return this }
  destroy() { this.destroyed = true; this.emit('close'); return this }
}

const disposers: (() => void)[] = []
afterEach(() => { for (const dispose of disposers.splice(0)) dispose() })

function fixture(config?: Parameters<typeof apply>[1]) {
  const events = new EventEmitter()
  const graph = { rev: 'graph-one', release: { version: '0.2.1-rc.2', commit: 'fixture' }, entries: [], batches: [] }
  let route: { handler: (request: any, response: any) => void; path: string; kind: string } | undefined
  let rejection: number | undefined
  const rejectionCheck = vi.fn(() => rejection)
  const registry = { graph: () => graph, artifactBaseline: () => undefined, rebuilt: () => undefined,
    onGraphChanged: (listener: () => void) => { events.on('graph', listener); return () => events.off('graph', listener) },
    onRebuilt: (listener: () => void) => { events.on('rebuilt', listener); return () => events.off('rebuilt', listener) } }
  const cleanups: (() => void)[] = []
  const unregister = vi.fn()
  const context = {
    get: (service: string) => ({ clientModules: registry, connection: { requestRejection: rejectionCheck },
      webServer: { register: (value: typeof route) => { route = value; return unregister } } })[service],
    effect: (start: () => () => void) => { cleanups.push(start()) },
    logger: { warn: vi.fn() },
  }
  apply(context as never, config)
  const dispose = () => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() }
  disposers.push(dispose)
  const request = (method = 'GET', response = new Response()) => {
    expect(route?.path).toBe('/plugins/events')
    expect(route?.kind).toBe('exact')
    const input = { method, headers: { cookie: 'signed-fixture-cookie', host: '127.0.0.1' } }
    route!.handler(input, response)
    return { input, response }
  }
  return { events, graph, request, dispose, unregister, rejectionCheck, context, reject: (status: number) => { rejection = status } }
}

test('reads the live SDK poll interval again after each completed scan without replacing its route', async () => {
  vi.useFakeTimers()
  try {
    let interval = 1250
    const result = fixture({ pollIntervalMs: { get: () => interval } })
    const response = result.request().response
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    interval = 750
    await vi.advanceTimersByTimeAsync(1250)
    expect(vi.getTimerCount()).toBe(1)
    result.events.emit('graph')
    expect(response.destroyed).toBe(false)
    expect(result.unregister).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    await vi.advanceTimersByTimeAsync(750)
    expect(timers).toHaveBeenLastCalledWith(expect.any(Function), 750)
    result.dispose()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.restoreAllMocks()
    vi.useRealTimers()
  }
})

test('authenticated GET gets an initial graph and later rebuilt and graph frames', () => {
  const result = fixture()
  const { response, input } = result.request()
  expect(result.rejectionCheck).toHaveBeenCalledWith(input)
  expect(response.statusCode).toBe(200)
  expect(response.headers['content-type']).toBe('text/event-stream')
  expect(response.writes[1]).toBe(`data: ${JSON.stringify({ type: 'graph', graph: result.graph })}\n\n`)
  result.events.emit('rebuilt', 'package-one', 'revision-two')
  expect(response.writes.at(-1)).toBe('data: {"type":"rebuilt","id":"package-one","rev":"revision-two"}\n\n')
  result.events.emit('graph')
  expect(response.writes.at(-1)).toContain('"type":"graph"')
})

test.each([401, 403, 409])('preserves SDK rejection %i without sending graph data', rejection => {
  const result = fixture()
  result.reject(rejection)
  const { response } = result.request()
  expect(response.statusCode).toBe(rejection)
  expect(response.writableEnded).toBe(true)
  expect(response.writes.join('')).not.toContain('graph-one')
})

test('an authentication exception fails closed rather than providing a stream', () => {
  const result = fixture()
  result.rejectionCheck.mockImplementation(() => { throw new Error('private credential detail') })
  const { response } = result.request()
  expect(response.statusCode).toBe(503)
  expect(response.writes.join('')).not.toContain('private')
})

test('HEAD authenticates and ends without subscribing; unsupported methods return 405', () => {
  const result = fixture()
  const head = result.request('HEAD').response
  expect(head.statusCode).toBe(200)
  expect(head.writableEnded).toBe(true)
  expect(head.writes).toEqual([])
  result.events.emit('graph')
  expect(head.writes).toEqual([])
  const post = result.request('POST').response
  expect(post.statusCode).toBe(405)
  expect(post.headers.allow).toBe('GET, HEAD')
})

test('backpressure queues frames in order until drain without stalling another client', () => {
  const result = fixture()
  const slow = result.request().response
  const fast = result.request().response
  slow.writable = false
  result.events.emit('rebuilt', 'package', 'two')
  const accepted = slow.writes.length
  result.events.emit('rebuilt', 'package', 'three')
  result.events.emit('rebuilt', 'package', 'four')
  expect(slow.writes).toHaveLength(accepted)
  expect(fast.writes.at(-1)).toContain('four')
  slow.writable = true
  slow.emit('drain')
  expect(slow.writes.slice(-2).join('')).toMatch(/three[\s\S]*four/u)
})

test('disconnects a slow client at the queue bound and isolates write failures', () => {
  const result = fixture()
  const slow = result.request().response
  slow.writable = false
  result.events.emit('rebuilt', 'package', 'two')
  result.events.emit('rebuilt', 'package', 'x'.repeat(1_048_577))
  expect(slow.destroyed).toBe(true)
  const broken = result.request().response
  broken.write = () => { throw new Error('fixture write failure') }
  const healthy = result.request().response
  expect(() => result.events.emit('graph')).not.toThrow()
  expect(broken.destroyed).toBe(true)
  expect(healthy.destroyed).toBe(false)
})

test('connection errors and unload close streams and remove routes and listeners', () => {
  const result = fixture()
  const first = result.request().response
  const second = result.request().response
  first.emit('error', new Error('fixture disconnect'))
  expect(first.destroyed).toBe(true)
  const graphListener = result.events.listeners('graph')[0] as () => void
  result.dispose()
  const count = second.writes.length
  graphListener()
  expect(second.writes).toHaveLength(count)
  expect(second.destroyed).toBe(true)
  expect(result.unregister).toHaveBeenCalledTimes(1)
  expect(result.events.listenerCount('graph')).toBe(0)
  expect(result.events.listenerCount('rebuilt')).toBe(0)
})
