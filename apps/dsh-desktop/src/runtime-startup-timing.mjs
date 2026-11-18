export const RUNTIME_STARTUP_PHASES = Object.freeze(['entry', 'environment', 'profile', 'patches', 'legacy-settings', 'boot', 'ready'])
const PHASES = new Set(RUNTIME_STARTUP_PHASES)

/** Bounded diagnostic timings only; failures must never change Runtime startup. */
export function createRuntimeStartupTiming({ enabled = true, now = () => performance.now(), emit } = {}) {
  const recorded = new Set()
  let previous = 0
  return (phase) => {
    if (!enabled || !PHASES.has(phase) || recorded.has(phase)) return
    recorded.add(phase)
    try {
      const current = now()
      if (!Number.isFinite(current) || current < 0) return
      const elapsed = Math.round(Math.max(0, current - previous))
      previous = Math.max(previous, current)
      emit?.(`[runtime-startup] ${phase}=${elapsed}ms`)
    } catch {
      // Diagnostic clocks and sinks have no authority over application readiness.
    }
  }
}
