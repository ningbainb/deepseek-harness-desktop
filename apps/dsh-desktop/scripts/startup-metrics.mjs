export const STARTUP_PHASES = Object.freeze([
  'application-ready',
  'package-resolution',
  'profile-ready',
  'shell-ready',
  'runtime-ready',
  'renderer-loaded',
])

export const STARTUP_DERIVED_METRICS = Object.freeze([
  'total-to-renderer',
  'estimated-serialized-total',
  'estimated-overlap-saved',
])

export function parseStartupTimings(runtimeLog) {
  const timings = {}
  for (const phase of STARTUP_PHASES) {
    const matches = [...String(runtimeLog).matchAll(new RegExp(`\\[startup\\] ${phase}=(\\d+)ms`, 'gu'))]
    const value = Number(matches.at(-1)?.[1])
    if (!Number.isSafeInteger(value)) throw new Error(`missing or invalid startup timing for ${phase}`)
    timings[phase] = value
  }
  const estimatedSerializedTotal = timings['shell-ready']
    + timings['runtime-ready']
    + timings['renderer-loaded']
  timings['estimated-serialized-total'] = estimatedSerializedTotal
  timings['total-to-renderer'] = estimatedSerializedTotal
  const totals = [...String(runtimeLog).matchAll(/\[startup\] total-to-renderer=(\d+)ms/gu)]
  const explicitTotal = Number(totals.at(-1)?.[1])
  if (Number.isSafeInteger(explicitTotal)) timings['total-to-renderer'] = explicitTotal
  timings['estimated-overlap-saved'] = Math.max(0, estimatedSerializedTotal - timings['total-to-renderer'])
  return Object.freeze(timings)
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0 || samples.some((value) => !Number.isFinite(value))) {
    throw new TypeError('startup samples must be a non-empty array of finite numbers')
  }
  const sorted = [...samples].toSorted((left, right) => left - right)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  return Object.freeze({
    minimumMs: Number(sorted[0].toFixed(1)),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
    meanMs: Number((total / sorted.length).toFixed(1)),
    maximumMs: Number(sorted.at(-1).toFixed(1)),
    samplesMs: Object.freeze([...samples]),
  })
}
