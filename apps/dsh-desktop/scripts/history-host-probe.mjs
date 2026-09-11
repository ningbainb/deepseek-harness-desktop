import { realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'

const operations = new Set(['query.observe', 'persistence.stat', 'persistence.open', 'persistence.readStoredLog',
  'persistence.prepareStoredMigration', 'persistence.decodeStoredLog'])

/** Test-only transparent observation: no arguments, results, errors or ids retained. */
export function createCallProbe({ now = () => performance.now(), maxSamples = 96 } = {}) {
  const stats = new Map(), samples = [], restorers = []
  let sequence = 0, disposed = false
  const wrap = (target, key, operation) => {
    if (disposed || !operations.has(operation)) return false
    const original = target?.[key]
    if (typeof original !== 'function') return false
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    const metric = { count: 0, settled: 0, failed: 0, active: 0, maxConcurrent: 0, totalMs: 0, maxMs: 0 }
    function observed(...args) {
      if (disposed) return original.apply(this, args)
      const startMs = now(), call = ++sequence
      metric.count++; metric.active++
      metric.maxConcurrent = Math.max(metric.maxConcurrent, metric.active)
      const finish = failed => {
        if (disposed) return
        const durationMs = Math.max(0, Math.round(now() - startMs))
        metric.active--; metric.settled++; metric.failed += Number(failed)
        metric.totalMs += durationMs; metric.maxMs = Math.max(metric.maxMs, durationMs)
        if (durationMs >= 50) {
          samples.push({ operation, call, startMs: Math.round(startMs), durationMs, failed })
          samples.sort((left, right) => right.durationMs - left.durationMs)
          if (samples.length > maxSamples) samples.length = maxSamples
        }
      }
      let value
      try { value = original.apply(this, args) } catch (error) { finish(true); throw error }
      if (value instanceof Promise) void value.then(() => finish(false), () => finish(true))
      else finish(false)
      return value
    }
    try { Object.defineProperty(target, key, { configurable: true, writable: true, value: observed, enumerable: descriptor?.enumerable ?? false }) }
    catch { return false }
    stats.set(operation, metric)
    restorers.push(() => {
      if (target[key] !== observed) return
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    })
    return true
  }
  return {
    wrap,
    snapshot: () => ({ operations: [...stats].map(([operation, metric]) => ({ operation, ...metric })),
      slowest: samples.map(sample => ({ ...sample })), sampleLimit: maxSamples }),
    dispose: () => { disposed = true; restorers.reverse().forEach(restore => restore()) },
  }
}

export function eventLoopSample(histogram, atMs) {
  const count = Number(histogram.count)
  const milliseconds = value => count > 0 && Number.isFinite(value) ? Math.round(value / 1e6) : null
  return { atMs: Math.round(atMs), count, maxMs: milliseconds(histogram.max),
    meanMs: milliseconds(histogram.mean), p99Ms: milliseconds(histogram.percentile(99)) }
}

export const name = 'isolated-history-host-probe'
export const inject = ['sessionQuery', 'sessionPersistence']
export function apply(ctx, config) {
  if (process.env.DSH_HISTORY_HOST_PROBE !== '1' || typeof config?.expectedHome !== 'string'
    || !Number.isSafeInteger(config.epochMs)) return
  const home = realpathSync(process.env.DSH_HOME)
  if (home !== realpathSync(config.expectedHome)) throw new Error('diagnostic Home mismatch')
  const output = join(home, 'history-host-probe.json')
  const probe = createCallProbe({ now: () => Date.now() - config.epochMs })
  const loop = monitorEventLoopDelay({ resolution: 20 })
  const eventLoop = []
  loop.enable()
  const installed = []
  for (const [target, key, operation] of [[ctx.sessionQuery, 'observeSession', 'query.observe'],
    ...['stat', 'open', 'readStoredLog', 'prepareStoredMigration', 'decodeStoredLog']
      .map(key => [ctx.sessionPersistence, key, `persistence.${key}`])]) {
    installed.push({ operation, installed: probe.wrap(target, key, operation) })
  }
  const flush = final => {
    try {
      eventLoop.push(eventLoopSample(loop, Date.now() - config.epochMs))
      if (eventLoop.length > 32) eventLoop.shift()
      loop.reset()
      writeFileSync(output, JSON.stringify({ installed, final, eventLoop, ...probe.snapshot() }))
    }
    catch { /* Diagnostics cannot turn a healthy operation into a failure. */ }
  }
  flush(false)
  const timer = setInterval(() => flush(false), 5000)
  timer.unref()
  ctx.effect(() => () => { clearInterval(timer); flush(true); loop.disable(); probe.dispose() }, 'isolated history read timing')
}
