import { serialize } from 'node:v8'

export const RUNTIME_STREAM_WINDOW_FRAMES = 64
export const RUNTIME_STREAM_WINDOW_BYTES = 1024 * 1024

export function runtimeStreamItemBytes(value) {
  return serialize(value).byteLength
}

export function abortableStreamNext(iterator, signal) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => {
      signal.throwIfAborted()
      return iterator.next()
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createRuntimeStreamFlow(signal) {
  const outstanding = []
  let bytes = 0
  let sequence = 0
  let acknowledged = 0
  let wake
  const fits = size => outstanding.length < RUNTIME_STREAM_WINDOW_FRAMES
    && (size === 0 ? bytes < RUNTIME_STREAM_WINDOW_BYTES : outstanding.length === 0 || bytes + size <= RUNTIME_STREAM_WINDOW_BYTES)
  const waitUntil = async predicate => {
    while (!predicate()) {
      signal.throwIfAborted()
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          wake = undefined
          signal.removeEventListener('abort', abort)
        }
        const abort = () => { cleanup(); reject(signal.reason) }
        wake = () => { cleanup(); resolve() }
        signal.addEventListener('abort', abort, { once: true })
      })
    }
    signal.throwIfAborted()
  }
  return {
    wait: (size = 0) => waitUntil(() => fits(size)),
    drain: () => waitUntil(() => outstanding.length === 0),
    sent(size) {
      sequence += 1
      outstanding.push({ sequence, size })
      bytes += size
      return sequence
    },
    acknowledge(value) {
      if (!Number.isSafeInteger(value) || value <= acknowledged || value > sequence || signal.aborted) return false
      acknowledged = value
      while (outstanding.length > 0 && outstanding[0].sequence <= value) bytes -= outstanding.shift().size
      wake?.()
      return true
    },
  }
}
