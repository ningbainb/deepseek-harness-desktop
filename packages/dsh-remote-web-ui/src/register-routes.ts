import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/** Register one owner's route batch, undoing partial work if registration fails. */
export function registerRoutesAtomically(
  register: (route: WebRoute) => () => void,
  routes: readonly WebRoute[],
): () => void {
  const disposers: (() => void)[] = []
  // Pop before calling: cleanup is reverse-order, exhaustive, and idempotent,
  // including when a disposer throws. Never replay an old owner's disposer.
  const drain = (): unknown[] => {
    const errors: unknown[] = []
    while (disposers.length > 0) {
      const dispose = disposers.pop()!
      try { dispose() } catch (error) { errors.push(error) }
    }
    return errors
  }
  try {
    for (const route of routes) disposers.push(register(route))
  } catch (error) {
    const cleanupErrors = drain()
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], 'remote-web-ui: route registration and rollback failed', { cause: error })
    }
    throw error
  }
  return () => {
    const errors = drain()
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, 'remote-web-ui: route cleanup failed')
  }
}
