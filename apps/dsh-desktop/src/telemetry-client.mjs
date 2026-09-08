import { createProductEvent } from './telemetry-events.mjs'

const DEFAULT_FLUSH_INTERVAL_MS = 30_000
const DEFAULT_TIMEOUT_MS = 2_000
const MAX_BATCH_EVENTS = 20
const MAX_BATCH_BYTES = 16_384
const MAX_QUEUED_EVENTS = 200

export class ProductTelemetryClient {
  constructor({
    endpoint,
    context,
    actorProvider,
    fetchImpl = globalThis.fetch,
    schedule = globalThis.setTimeout,
    cancelSchedule = globalThis.clearTimeout,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }) {
    this.endpoint = typeof endpoint === 'string' && endpoint.length > 0 ? endpoint : undefined
    this.context = context
    this.actorProvider = actorProvider
    this.fetchImpl = fetchImpl
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
    this.flushIntervalMs = flushIntervalMs
    this.timeoutMs = timeoutMs
    this.queue = []
    this.timer = undefined
    this.inFlight = undefined
    this.stopping = false
    this.droppedEvents = 0
  }

  get enabled() {
    return this.endpoint !== undefined
  }

  get queued() {
    return this.queue.length
  }

  record(name, dimensions) {
    if (!this.enabled || this.stopping) return false
    if (this.queue.length >= MAX_QUEUED_EVENTS) { this.droppedEvents += 1; return false }
    const actors = this.actorProvider?.()
    this.queue.push(createProductEvent(this.context, actors, name, dimensions))
    if (this.queue.length >= MAX_BATCH_EVENTS) {
      this.#clearTimer()
      void this.flush()
    } else {
      this.#armTimer()
    }
    return true
  }

  #armTimer() {
    if (this.timer !== undefined || this.queue.length === 0 || this.stopping) return
    this.timer = this.schedule(() => {
      this.timer = undefined
      return this.flush()
    }, this.flushIntervalMs)
  }

  #clearTimer() {
    if (this.timer === undefined) return
    this.cancelSchedule(this.timer)
    this.timer = undefined
  }

  async #send(events, timeoutMs) {
    const controller = new AbortController()
    let timeout
    const transport = Promise.resolve()
      .then(() => this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schema: 4, events }),
        signal: controller.signal,
      }))
      .then(response => response?.ok === true)
      .catch(() => false)
    const deadline = new Promise((resolve) => {
      timeout = this.schedule(() => {
        controller.abort()
        resolve(false)
      }, timeoutMs)
    })
    try {
      return await Promise.race([transport, deadline])
    } finally {
      if (timeout !== undefined) this.cancelSchedule(timeout)
    }
  }

  flush({ timeoutMs = this.timeoutMs } = {}) {
    if (!this.enabled) return Promise.resolve(false)
    if (this.inFlight) return this.inFlight
    if (this.queue.length === 0) return Promise.resolve(false)
    this.#clearTimer()
    const events = []
    while (this.queue.length && events.length < MAX_BATCH_EVENTS) {
      const candidate = [...events, this.queue[0]]
      if (new TextEncoder().encode(JSON.stringify({ schema: 4, events: candidate })).byteLength > MAX_BATCH_BYTES) break
      events.push(this.queue.shift())
    }
    const operation = this.#send(events, timeoutMs)
      .finally(() => {
        if (this.inFlight === operation) this.inFlight = undefined
        if (!this.stopping) {
          if (this.queue.length >= MAX_BATCH_EVENTS) void this.flush()
          else this.#armTimer()
        }
      })
    this.inFlight = operation
    return operation
  }

  async idle() {
    return await (this.inFlight ?? Promise.resolve(true))
  }

  async shutdown({ deadlineMs = 300 } = {}) {
    this.stopping = true
    this.#clearTimer()
    const boundedDeadline = Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : 300
    const expires = Date.now() + boundedDeadline
    const operation = (async () => {
      let delivered = this.inFlight ? await this.inFlight : true
      while (this.queue.length && Date.now() < expires) {
        const result = await this.flush({ timeoutMs: Math.min(this.timeoutMs, Math.max(1, expires - Date.now())) })
        delivered = result && delivered
      }
      return delivered
    })()
    let deadline
    try {
      return await Promise.race([
        operation,
        new Promise((resolve) => {
          deadline = this.schedule(() => resolve(false), boundedDeadline)
        }),
      ])
    } finally {
      if (deadline !== undefined) this.cancelSchedule(deadline)
      this.queue.length = 0
    }
  }
}

export const PRODUCT_TELEMETRY_MAX_BATCH_EVENTS = MAX_BATCH_EVENTS
export const PRODUCT_TELEMETRY_MAX_BATCH_BYTES = MAX_BATCH_BYTES
export const PRODUCT_TELEMETRY_MAX_QUEUED_EVENTS = MAX_QUEUED_EVENTS
