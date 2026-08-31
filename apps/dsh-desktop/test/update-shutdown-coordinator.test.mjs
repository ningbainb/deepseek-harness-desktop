import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { createUpdateShutdownCoordinator } from '../src/update-shutdown-coordinator.mjs'

/**
 * The installer handshake can reach the app before the shutdown handler
 * exists. That race is the entire reason this module exists, so it gets
 * covered directly rather than through the 2,222-line startup function that
 * no test drives.
 */

/** Let fire-and-forget handler invocations settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve))

const request = (token) => ({ token, marker: 'update-shutdown-v2' })

describe('initial state', () => {
  test('no argv request means shutdown was not requested', () => {
    const coordinator = createUpdateShutdownCoordinator()
    assert.equal(coordinator.requested, false)
    assert.equal(coordinator.request, undefined)
    assert.equal(coordinator.pendingCount(), 0)
  })

  test('an argv request marks shutdown as requested immediately', () => {
    const initial = request('a'.repeat(64))
    const coordinator = createUpdateShutdownCoordinator({ initialRequest: initial })
    assert.equal(coordinator.requested, true)
    assert.equal(coordinator.request, initial)
  })
})

describe('requests arriving before the handler exists', () => {
  test('are queued rather than dropped', () => {
    const coordinator = createUpdateShutdownCoordinator()
    assert.equal(coordinator.enqueue(request('b'.repeat(64))), false, 'no handler yet, so queued')
    assert.equal(coordinator.pendingCount(), 1)
    assert.equal(coordinator.requested, true)
  })

  test('are replayed when the handler is registered and drained', async () => {
    const seen = []
    const coordinator = createUpdateShutdownCoordinator()
    coordinator.enqueue(request('c'.repeat(64)))
    coordinator.enqueue(request('d'.repeat(64)))

    coordinator.setHandler(async (item) => {
      seen.push(item.token)
    })
    const replayed = coordinator.drain()
    await settle()

    assert.equal(replayed, 2)
    assert.equal(coordinator.pendingCount(), 0)
    // Two queued items plus the preserved final current-request invocation.
    assert.deepEqual(seen, ['c'.repeat(64), 'd'.repeat(64), 'd'.repeat(64)])
  })

  test('drain before setHandler is a no-op', () => {
    const coordinator = createUpdateShutdownCoordinator()
    coordinator.enqueue(request('e'.repeat(64)))
    assert.equal(coordinator.drain(), 0)
    assert.equal(coordinator.pendingCount(), 1, 'nothing may be lost')
  })
})

describe('requests arriving after the handler exists', () => {
  test('are consumed immediately', async () => {
    const seen = []
    const coordinator = createUpdateShutdownCoordinator()
    coordinator.setHandler(async (item) => {
      seen.push(item.token)
    })
    assert.equal(coordinator.enqueue(request('f'.repeat(64))), true)
    await settle()

    assert.deepEqual(seen, ['f'.repeat(64)])
    assert.equal(coordinator.pendingCount(), 0)
  })

  test('an undefined request is ignored', () => {
    const coordinator = createUpdateShutdownCoordinator()
    coordinator.setHandler(async () => {
      throw new Error('must not be called')
    })
    assert.equal(coordinator.enqueue(undefined), false)
    assert.equal(coordinator.requested, false)
  })
})

describe('preserved pre-3.1.0 behaviour', () => {
  test('drain always invokes the handler once with the current request', async () => {
    const seen = []
    const coordinator = createUpdateShutdownCoordinator({ initialRequest: request('g'.repeat(64)) })
    coordinator.setHandler(async (item) => {
      seen.push(item.token)
    })
    // Nothing was queued, but the initial argv request still has to be honoured.
    assert.equal(coordinator.drain(), 0)
    await settle()
    assert.deepEqual(seen, ['g'.repeat(64)])
  })

  test('a second drain replays the queue only once', async () => {
    const seen = []
    const coordinator = createUpdateShutdownCoordinator()
    coordinator.enqueue(request('h'.repeat(64)))
    coordinator.setHandler(async (item) => {
      seen.push(item.token)
    })
    coordinator.drain()
    await settle()
    const afterFirst = seen.length

    coordinator.drain()
    await settle()
    // The queue is empty, so only the current-request invocation repeats.
    assert.equal(afterFirst, 2)
    assert.equal(seen.length, 3)
  })
})

describe('handler failures cannot stall shutdown', () => {
  test('a rejecting handler is reported through onError', async () => {
    const errors = []
    const coordinator = createUpdateShutdownCoordinator({
      onError: (error, item) => errors.push({ message: error.message, token: item?.token }),
    })
    coordinator.setHandler(async () => {
      throw new Error('shutdown refused')
    })
    coordinator.enqueue(request('1'.repeat(64)))
    await settle()

    assert.equal(errors.length, 1)
    assert.equal(errors[0].message, 'shutdown refused')
    assert.equal(errors[0].token, '1'.repeat(64))
  })

  test('a synchronously throwing handler is reported through onError', async () => {
    const errors = []
    const coordinator = createUpdateShutdownCoordinator({
      onError: (error) => errors.push(error.message),
    })
    coordinator.setHandler(() => {
      throw new Error('sync boom')
    })
    coordinator.enqueue(request('2'.repeat(64)))
    await settle()

    assert.deepEqual(errors, ['sync boom'])
  })

  test('a broken onError sink does not escape', async () => {
    const coordinator = createUpdateShutdownCoordinator({
      onError: () => {
        throw new Error('sink is broken')
      },
    })
    coordinator.setHandler(async () => {
      throw new Error('handler failed')
    })
    // Neither failure may propagate out of a fire-and-forget invocation.
    assert.doesNotThrow(() => coordinator.enqueue(request('3'.repeat(64))))
    await settle()
  })

  test('one failing request does not prevent later ones', async () => {
    const seen = []
    const coordinator = createUpdateShutdownCoordinator({ onError: () => {} })
    coordinator.enqueue(request('4'.repeat(64)))
    coordinator.enqueue(request('5'.repeat(64)))
    coordinator.setHandler(async (item) => {
      if (item.token === '4'.repeat(64)) throw new Error('first fails')
      seen.push(item.token)
    })
    coordinator.drain()
    await settle()

    assert.equal(seen.length > 0, true, 'the second request must still be processed')
  })
})

describe('lifecycle', () => {
  test('setHandler requires a function', () => {
    const coordinator = createUpdateShutdownCoordinator()
    assert.throws(() => coordinator.setHandler('nope'), /handler must be a function/u)
    assert.throws(() => coordinator.setHandler(undefined), /handler must be a function/u)
  })

  test('the returned disposer detaches the handler', () => {
    const coordinator = createUpdateShutdownCoordinator()
    const dispose = coordinator.setHandler(async () => {})
    dispose()
    // With no handler, a new request must queue instead of being invoked.
    assert.equal(coordinator.enqueue(request('6'.repeat(64))), false)
    assert.equal(coordinator.pendingCount(), 1)
  })

  test('replacing the handler swaps it cleanly', async () => {
    const seen = []
    const coordinator = createUpdateShutdownCoordinator()
    coordinator.setHandler(async () => {
      seen.push('first')
    })
    coordinator.setHandler(async () => {
      seen.push('second')
    })
    coordinator.enqueue(request('7'.repeat(64)))
    await settle()

    assert.deepEqual(seen, ['second'])
  })
})
