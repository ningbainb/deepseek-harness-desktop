import { afterEach, describe, expect, it, vi } from 'vitest'
import { PetPollRequest } from '../src/client/poll-request.ts'

afterEach(() => { vi.useRealTimers() })

function harness() {
  const reads: Array<{ signal: AbortSignal; resolve(value: number): void; reject(reason?: unknown): void }> = []
  const publish = vi.fn(), failed = vi.fn()
  const request = new PetPollRequest<number>(signal => new Promise((resolve, reject) => {
    reads.push({ signal, resolve, reject })
  }), publish, failed)
  return { reads, publish, failed, request }
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

describe('pet read backpressure', () => {
  it('coalesces ticks and still publishes a slow successful read', async () => {
    vi.useFakeTimers()
    const { request, reads, publish, failed } = harness()
    request.run(); await settle()
    for (let tick = 0; tick < 3; tick += 1) {
      await vi.advanceTimersByTimeAsync(2000); request.run()
    }
    expect(reads).toHaveLength(1)
    reads[0]!.resolve(42); await settle()
    expect(publish).toHaveBeenCalledExactlyOnceWith(42)
    expect(failed).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    request.dispose()
  })

  it('coalesces many interaction refreshes into one successor without stale publication', async () => {
    vi.useFakeTimers()
    const { request, reads, publish } = harness()
    request.run(); await settle()
    for (let call = 0; call < 40; call += 1) request.run(true)
    expect(reads).toHaveLength(1)
    reads[0]!.resolve(1); await settle()
    expect(publish).not.toHaveBeenCalled()
    expect(reads).toHaveLength(2)
    reads[1]!.resolve(2); await settle()
    expect(publish).toHaveBeenCalledExactlyOnceWith(2)
    expect(vi.getTimerCount()).toBe(0)
    request.dispose()
  })

  it('aborts a hung read after eight seconds and fences non-cooperative late results', async () => {
    vi.useFakeTimers()
    const { request, reads, publish, failed } = harness()
    request.run(); await settle()
    await vi.advanceTimersByTimeAsync(8000)
    expect(reads[0]!.signal.aborted).toBe(true)
    expect(failed).toHaveBeenCalledOnce()
    request.run(); await settle()
    expect(reads).toHaveLength(2)
    reads[0]!.resolve(1); reads[1]!.resolve(2); await settle()
    expect(publish).toHaveBeenCalledExactlyOnceWith(2)
    request.dispose()
  })

  it('cancels on hide, clears queued work, resumes, and cannot revive after disposal', async () => {
    vi.useFakeTimers()
    const { request, reads, publish, failed } = harness()
    request.run(); await settle(); request.run(true)
    request.cancel()
    expect(reads[0]!.signal.aborted).toBe(true)
    reads[0]!.resolve(1); await settle()
    expect(reads).toHaveLength(1)
    expect(publish).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
    request.run(); await settle()
    expect(reads).toHaveLength(2)
    request.dispose(); request.dispose(); request.run(true)
    expect(reads[1]!.signal.aborted).toBe(true)
    reads[1]!.reject(new Error('late cancellation')); await settle()
    expect(failed).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles synchronous transport failures and permits a later retry', async () => {
    vi.useFakeTimers()
    const failed = vi.fn()
    const load = vi.fn(() => { throw new Error('offline') })
    const request = new PetPollRequest(load, vi.fn(), failed)
    request.run(); await settle(); request.run(); await settle()
    expect(load).toHaveBeenCalledTimes(2)
    expect(failed).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    request.dispose()
  })
})
