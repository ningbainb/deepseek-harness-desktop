import { COST_EVENT_NAMES, isFailure, legacyCostEvent, validCostEvent } from './cost-mode-events.mjs'
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
    try {
      const actors = this.actorProvider?.()
      const event = COST_EVENT_NAMES.includes(name)
        ? { name, ...this.context, ...actors, params: { ...dimensions.params }, timestamp: dimensions.timestamp ?? new Date().toISOString(), eventId: dimensions.eventId ?? crypto.randomUUID() }
        : legacyCostEvent(createProductEvent(this.context, actors, name, dimensions))
      if (COST_EVENT_NAMES.includes(event.name) && !validCostEvent(event)) return false
      if (event.params) Object.freeze(event.params)
      Object.freeze(event)
      if (this.queue.length >= MAX_QUEUED_EVENTS) {
        const replace = isFailure(event) ? this.queue.findIndex(item => !isFailure(item)) : -1
        this.droppedEvents++
        if (replace < 0) return false
        this.queue.splice(replace, 1)
      }
      // Failure-first draining prevents a success burst starving diagnostics.
      if (isFailure(event)) this.queue.unshift(event)
      else this.queue.push(event)
      if (this.queue.length >= MAX_BATCH_EVENTS) { this.#clearTimer(); void this.flush().catch(() => {}) }
      else this.#armTimer()
      return true
    } catch { return false }
  }

  #armTimer() {
    if (this.timer !== undefined || this.queue.length === 0 || this.stopping) return
    try {
      this.timer = this.schedule(() => {
        this.timer = undefined
        return this.flush().catch(() => false)
      }, this.flushIntervalMs)
    } catch { /* A failed timer cannot escape a business recorder. */ }
  }

  #clearTimer() {
    if (this.timer === undefined) return
    try { this.cancelSchedule(this.timer) } catch {}
    this.timer = undefined
  }

  async #send(events, timeoutMs) {
    const controller = new AbortController()
    let timeout
    const transport = Promise.resolve()
      .then(() => this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schema: events.some(e => e.update) ? 6 : events.some(e => COST_EVENT_NAMES.includes(e.name)) ? 5 : 4, events }),
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
    } catch {
      controller.abort()
      return false
    } finally {
      if (timeout !== undefined) { try { this.cancelSchedule(timeout) } catch {} }
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
    const operation = this.#send(events, timeoutMs).catch(() => false)
      .finally(() => {
        if (this.inFlight === operation) this.inFlight = undefined
        if (!this.stopping) {
          if (this.queue.length >= MAX_BATCH_EVENTS) void this.flush().catch(() => {})
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
    try { return await this.drain({ deadlineMs }) }
    finally { this.queue.length = 0 }
  }

  // Updating can still fail after preparation; keep accepting diagnostics until
  // the actual application shutdown disposes this client.
  async drain({ deadlineMs = 300 } = {}) {
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
    } catch {
      return false
    } finally {
      if (deadline !== undefined) { try { this.cancelSchedule(deadline) } catch {} }
    }
  }
}

export const PRODUCT_TELEMETRY_MAX_BATCH_EVENTS = MAX_BATCH_EVENTS
export const PRODUCT_TELEMETRY_MAX_BATCH_BYTES = MAX_BATCH_BYTES
export const PRODUCT_TELEMETRY_MAX_QUEUED_EVENTS = MAX_QUEUED_EVENTS
