// Opt-in QA only. Count existing layout reads; never request an extra layout.
export function installObserverAttribution() {
  if (globalThis.betaObserverAttribution) return
  const NativeObserver = globalThis.MutationObserver
  const records = []
  let active, nextId = 0, omitted = 0
  const now = () => performance.now()
  const wrapRead = (owner, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key)
    if (typeof descriptor?.value !== 'function') return
    Object.defineProperty(owner, key, { ...descriptor, value: new Proxy(descriptor.value, {
      apply(target, receiver, args) {
        const record = active
        if (!record) return Reflect.apply(target, receiver, args)
        const read = record.layoutReads[key] ??= { calls: 0, elapsedMs: 0 }
        read.calls++
        const started = now()
        try { return Reflect.apply(target, receiver, args) }
        finally { read.elapsedMs += now() - started }
      },
    }) })
  }
  wrapRead(Element.prototype, 'getBoundingClientRect')
  wrapRead(Element.prototype, 'getClientRects')
  wrapRead(globalThis, 'getComputedStyle')
  globalThis.MutationObserver = new Proxy(NativeObserver, {
    construct(target, args, newTarget) {
      if (typeof args[0] !== 'function') return Reflect.construct(target, args, newTarget)
      const callback = args[0]
      const record = { id: ++nextId, stack: new Error('MutationObserver construction').stack?.slice(0, 3000),
        callback: Function.prototype.toString.call(callback).slice(0, 700), calls: 0, elapsedMs: 0,
        maxElapsedMs: 0, layoutReads: {} }
      if (records.length < 256) records.push(record)
      else omitted++
      const wrapped = function(...callbackArgs) {
        const previous = active
        active = record
        record.calls++
        const started = now()
        try { return Reflect.apply(callback, this, callbackArgs) }
        finally {
          const elapsed = now() - started
          record.elapsedMs += elapsed
          record.maxElapsedMs = Math.max(record.maxElapsedMs, elapsed)
          active = previous
        }
      }
      return Reflect.construct(target, [wrapped, ...args.slice(1)], newTarget)
    },
  })
  globalThis.betaObserverAttribution = { snapshot: () => ({
    boundary: 'Synchronous MutationObserver callback attribution only; queued microtasks and animation frames are not attributed.',
    constructed: nextId, omitted, observers: structuredClone(records),
  }) }
}
