/**
 * Update shutdown coordination (DeepSeek Harness Desktop 3.1.0).
 *
 * WHY THIS EXISTS
 * ---------------
 * `startElectronApp` held update-shutdown state in five separate closure
 * variables spread across roughly 2,100 lines:
 *
 *   :492  initialUpdateShutdownRequest   (declaration)
 *   :493  updateShutdownRequest          (written :499, read :535 :2558)
 *   :494  updateShutdownRequested        (read :535 :775 :2480 :2605)
 *   :495  requestUpdateShutdown          (read :501, assigned :2531)
 *   :496  pendingUpdateShutdownRequests  (read :2554)
 *
 * The installer handshake can arrive through argv or `second-instance` before
 * the shutdown handler exists, so the queue exists to avoid losing those early
 * requests. That path is correctness-critical and was effectively untestable,
 * because reaching it meant driving the whole 2,222-line Electron startup
 * function. No test drives `startElectronApp`.
 *
 * This module owns that one concern and nothing else. It has no Electron
 * dependency, so the early-request race is unit-testable in isolation.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not download updates, render update UI, or manage updater
 * lifecycle - those stay with the updater. This only coordinates shutdown
 * requests coming from the installer and the receipt written back to it.
 *
 * BEHAVIOURAL NOTE (deliberately identical to pre-3.1.0 code)
 * -----------------------------------------------------------
 * `drain()` replays queued requests and then unconditionally invokes the
 * handler once more with the current request. When the queue is non-empty the
 * current request *is* the last queued one, so this replays it a second time;
 * the pre-3.1.0 code at :2554-:2558 did exactly the same. That is preserved on
 * purpose: this refactor must not change behaviour, and the handler is
 * idempotent. Changing it here would be a silent semantic change hidden inside
 * a "cleanup" commit.
 */

/**
 * @param {object} [options]
 * @param {object} [options.initialRequest] request parsed from argv at startup
 * @param {(error: unknown, request?: object) => void} [options.onError]
 *   best-effort sink for a handler that throws or rejects. Handlers are fired
 *   without being awaited, so an unhandled rejection would otherwise be lost.
 */
export function createUpdateShutdownCoordinator({ initialRequest, onError = () => {} } = {}) {
  let request = initialRequest
  let requested = initialRequest !== undefined
  let handler
  const pending = []

  /** Fire-and-forget: callers must never be blocked by shutdown work. */
  const invoke = (item) => {
    try {
      void Promise.resolve(handler(item)).catch((error) => {
        try {
          onError(error, item)
        } catch {
          // A broken error sink must not take down the shutdown path.
        }
      })
    } catch (error) {
      try {
        onError(error, item)
      } catch {
        // Same reasoning as above.
      }
    }
  }

  return Object.freeze({
    /** True once any shutdown request has been seen, from argv or later. */
    get requested() {
      return requested
    },

    /** The most recent shutdown request, if any. */
    get request() {
      return request
    },

    pendingCount: () => pending.length,

    /** Register the real shutdown handler once it exists. Returns a disposer. */
    setHandler(fn) {
      if (typeof fn !== 'function') throw new TypeError('update shutdown handler must be a function')
      handler = fn
      return () => {
        if (handler === fn) handler = undefined
      }
    },

    /**
     * Record a shutdown request. Returns true when the handler was already
     * available and consumed it immediately, false when it had to be queued.
     */
    enqueue(next) {
      if (next === undefined) return false
      request = next
      requested = true
      if (handler === undefined) {
        pending.push(next)
        return false
      }
      invoke(next)
      return true
    },

    /**
     * Replay everything that arrived before the handler existed.
     * Call this immediately after setHandler(). Idempotent: the pending list
     * is emptied, so a second drain replays nothing except the final
     * current-request invocation described in the header.
     */
    drain() {
      if (handler === undefined) return 0
      const queued = pending.splice(0, pending.length)
      for (const item of queued) invoke(item)
      // Pre-3.1.0 behaviour, preserved verbatim: also invoke once with the
      // current request. See the header note before "simplifying" this.
      if (requested) invoke(request)
      return queued.length
    },
  })
}
