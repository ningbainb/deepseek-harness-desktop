/** One abortable read at a time; only explicit invalidations queue a fresh read. */
export class PetPollRequest<T> {
  private active: { cancel(): void } | undefined
  private revision = 0
  private queued = false
  private disposed = false

  constructor(
    private readonly load: (signal: AbortSignal) => Promise<T>,
    private readonly publish: (value: T) => void,
    private readonly failed: () => void = () => {},
    private readonly timeoutMs = 8000,
  ) {}

  /** Periodic ticks coalesce; an interaction invalidates any older snapshot. */
  run(fresh = false): void {
    if (this.disposed) return
    if (this.active) {
      if (fresh) { this.revision += 1; this.queued = true }
      return
    }
    const revision = ++this.revision
    const controller = new AbortController()
    let settled = false
    const finish = (result: { kind: 'value'; value: T } | { kind: 'error' | 'cancel' }): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      this.active = undefined
      const rerun = this.queued
      this.queued = false
      if (!this.disposed && revision === this.revision) {
        if (result.kind === 'value') this.publish(result.value)
        else if (result.kind === 'error') this.failed()
      }
      if (rerun && !this.disposed) this.run()
    }
    const timeout = setTimeout(() => {
      controller.abort()
      finish({ kind: 'error' })
    }, this.timeoutMs)
    this.active = { cancel: () => {
      controller.abort()
      finish({ kind: 'cancel' })
    } }
    // Install handlers before starting a possibly synchronous/throwing adapter.
    void Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return this.load(controller.signal)
    }).then(
      value => finish({ kind: 'value', value }),
      () => finish({ kind: 'error' }),
    )
  }

  /** Hidden/disabled surfaces release transport without publishing an error. */
  cancel(): void {
    this.revision += 1
    this.queued = false
    this.active?.cancel()
  }

  /** Late results and further triggers cannot revive an unloaded plugin. */
  dispose(): void {
    this.disposed = true
    this.cancel()
  }
}
