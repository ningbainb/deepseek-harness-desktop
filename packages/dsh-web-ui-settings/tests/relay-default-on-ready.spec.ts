import { expect, it, vi } from 'vitest'
import { initializeRelayDefaultOnReady } from '../src/relay-default-on-ready.ts'

function fixture() {
  let listener = () => {}
  const cancel = vi.fn()
  const ready = { onReady: vi.fn((next: () => void) => { listener = next; return cancel }) }
  const initialize = vi.fn(async () => {})
  const onError = vi.fn()
  const dispose = initializeRelayDefaultOnReady(ready, initialize, onError)
  return { ready, initialize, onError, dispose, cancel, commit: () => listener() }
}

it('does not write the profile before the official successful-startup commit', async () => {
  const test = fixture()
  await Promise.resolve()
  expect(test.initialize).not.toHaveBeenCalled()
  test.commit()
  test.commit()
  await Promise.resolve()
  expect(test.initialize).toHaveBeenCalledTimes(1)
  expect(test.onError).not.toHaveBeenCalled()
})

it('cancels pending initialization on teardown, including a queued ready callback', async () => {
  const test = fixture()
  test.dispose()
  test.commit()
  await Promise.resolve()
  expect(test.cancel).toHaveBeenCalledTimes(1)
  expect(test.initialize).not.toHaveBeenCalled()
})

it('reports an initialization failure without rejecting startup or exposing exception details', async () => {
  const test = fixture()
  test.initialize.mockRejectedValue(new Error('private credential detail'))
  test.commit()
  await Promise.resolve()
  expect(test.onError).toHaveBeenCalledExactlyOnceWith()
})
