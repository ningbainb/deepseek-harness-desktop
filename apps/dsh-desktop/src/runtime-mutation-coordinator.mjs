/**
 * Runtime mutation coordinator (DeepSeek Harness Desktop 3.1.0).
 *
 * WHY
 * ---
 * Before 3.1.0 every plugin mutation path hand-rolled the same six steps:
 *
 *   controller.stop() -> apply -> ensureProfile() -> controller.start()
 *   -> commit, and on failure: rollback -> ensureProfile() -> start().
 *
 * That sequence existed in five near-identical copies (single install,
 * full-access install, batch install, removal, preset import). The sequence is
 * the only thing standing between "a plugin install failed" and "the user's
 * runtime is down and will not come back", so a fix applied to four of five
 * copies is indistinguishable from no fix at all - the failure only shows up
 * on the one path nobody remembered.
 *
 * WHAT THIS OWNS
 * --------------
 * Runtime safety only:
 *   - quiescing and stopping the runtime
 *   - restoring the Desktop profile
 *   - restarting the runtime
 *   - rolling back transactions in the caller's declared order
 *   - aggregating the original error with every recovery error
 *
 * WHAT THIS DELIBERATELY DOES NOT OWN
 * -----------------------------------
 *   - preparing or resolving plugin sources
 *   - package apply / config apply
 *   - full-access validation
 *   - notifications, progress events, product metrics
 *
 * Callers keep those. This is a narrow coordinator, not a transaction
 * framework: four hooks, each with one job, no policy engine.
 *
 * ERROR CONTRACT
 * --------------
 * When recovery itself fails, the thrown error carries an AggregateError
 * `cause` holding the original error followed by every recovery error, so a
 * log can always answer "did the original failure get masked by a worse one".
 * The message shape is kept identical to the pre-3.1.0 copy because the
 * Desktop contract and its tests assert on it.
 */

const MAX_ERROR_MESSAGE_LENGTH = 1_000

function boundedMessage(error, limit = MAX_ERROR_MESSAGE_LENGTH) {
  return String(error?.message ?? error).slice(0, limit)
}

function isTransactionLike(value) {
  return value !== null
    && typeof value === 'object'
    && (typeof value.commit === 'function' || typeof value.rollback === 'function')
}

/**
 * Validate a mutation plan returned by an `apply` hook.
 *
 * A plan is intentionally permissive: `undefined` means "this mutation touched
 * nothing that can be rolled back", which is a legitimate outcome rather than
 * an error.
 *
 * @param {unknown} value
 * @returns {{ transactions: object[], result: unknown } | undefined}
 */
export function normalizeMutationPlan(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('runtime mutation apply must return a plan object')
  }
  const transactions = Array.isArray(value.transactions) ? value.transactions : []
  for (const transaction of transactions) {
    if (!isTransactionLike(transaction)) {
      throw new TypeError('runtime mutation plan transactions must be rollback-capable')
    }
  }
  return { transactions, result: value.result }
}

/**
 * @param {object} options
 * @param {{ stop: Function, start: Function }} options.controller
 * @param {() => Promise<void>} options.ensureProfile
 * @param {(line: string) => void} [options.log] best-effort diagnostics sink
 */
export function createRuntimeMutationCoordinator({ controller, ensureProfile, log } = {}) {
  if (typeof controller?.stop !== 'function' || typeof controller?.start !== 'function') {
    throw new TypeError('runtime mutation coordinator requires a runtime controller')
  }
  if (typeof ensureProfile !== 'function') {
    throw new TypeError('runtime mutation coordinator requires an ensureProfile callback')
  }

  const append = (line) => {
    try {
      void Promise.resolve(log?.(line)).catch(() => {})
    } catch {
      // Diagnostics are best-effort; they never change mutation semantics.
    }
  }

  /**
   * Put the Runtime back the way it was.
   *
   * Transactions are rolled back in the caller's declared order, not reversed:
   * the preset path stages config before packages and must unwind in that same
   * order, and changing it here would silently alter recovery behaviour.
   *
   * @returns {Promise<{ recovered: boolean, error: Error }>}
   */
  async function restore({ plan, error, label, onRuntimeEvent }) {
    onRuntimeEvent?.('rolling-back')
    const recoveryErrors = []
    for (const transaction of plan?.transactions ?? []) {
      try {
        await transaction.rollback?.()
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError)
      }
    }
    try {
      await ensureProfile()
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError)
    }
    try {
      await controller.start()
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError)
    }

    // Recovery is the one place where silence is actively harmful: if the
    // Runtime is down after a failed mutation, that belongs in the log even
    // though the caller will surface the error to the user too.
    if (recoveryErrors.length > 0) {
      append(
        `[mutation] ${label} recovery failed: `
        + recoveryErrors.map((item) => boundedMessage(item, 300)).join('; '),
      )
    }

    if (recoveryErrors.length === 0) {
      onRuntimeEvent?.('restored')
      return { recovered: true, error }
    }

    return {
      recovered: false,
      error: new Error(
        `${label} failed and the previous runtime could not be restored: `
        + `${boundedMessage(error)}; `
        + recoveryErrors.map((item) => boundedMessage(item, 500)).join('; '),
        { cause: new AggregateError([error, ...recoveryErrors]) },
      ),
    }
  }

  /**
   * Run one mutation with the Runtime taken down and brought back.
   *
   * @param {object} mutation
   * @param {string} mutation.label short label used in recovery error text
   * @param {() => Promise<unknown>} [mutation.prepare] runs while the Runtime
   *   is still up, so registry lookups and package warming cost no downtime
   * @param {(prepared: unknown) => Promise<object|undefined>} mutation.apply
   *   runs with the Runtime stopped; returns a plan
   * @param {(plan: object|undefined) => Promise<unknown>} [mutation.finalize]
   *   runs after the Runtime is back and every transaction has committed
   * @param {(plan: object|undefined) => Promise<void>} [mutation.onRecovered]
   *   runs when the mutation failed but the Runtime was restored intact
   * @param {(event: 'stopping'|'starting'|'rolling-back'|'restored') => void}
   *   [mutation.onRuntimeEvent] UI progress hook. Publishing these from the
   *   coordinator is what makes every mutation path report the same phases;
   *   before 3.1.0 each copy emitted its own subset and the removal path
   *   emitted none.
   */
  async function run({
    label = 'plugin change',
    prepare,
    apply,
    finalize,
    onRecovered,
    onRuntimeEvent,
  } = {}) {
    if (typeof apply !== 'function') throw new TypeError('runtime mutation requires an apply step')

    const prepared = typeof prepare === 'function' ? await prepare() : undefined
    // Stopping is outside the try: if the Runtime never went down there is
    // nothing to restore, and the caller must see the stop failure itself.
    onRuntimeEvent?.('stopping')
    await controller.stop()

    let plan
    try {
      plan = normalizeMutationPlan(await apply(prepared))
      await ensureProfile()
      onRuntimeEvent?.('starting')
      await controller.start()
      for (const transaction of plan?.transactions ?? []) {
        await transaction.commit?.()
      }
      return typeof finalize === 'function' ? await finalize(plan) : plan?.result
    } catch (error) {
      const { recovered, error: thrown } = await restore({ plan, error, label, onRuntimeEvent })
      if (recovered && typeof onRecovered === 'function') {
        try {
          await onRecovered(plan)
        } catch (notifyError) {
          append(`[mutation] ${label} recovery notification failed: ${boundedMessage(notifyError, 300)}`)
        }
      }
      throw thrown
    }
  }

  return Object.freeze({ run, restore })
}
