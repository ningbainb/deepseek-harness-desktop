/**
 * Startup phase model (DeepSeek Harness Desktop 3.1.0).
 *
 * WHY
 * ---
 * Before 3.1.0 the startup screen derived everything from a purely
 * time-driven animation: `advanceStartupProgress()` nudged a number towards a
 * hard-coded ceiling of 88 and then froze. The percentage carried no
 * relationship to what the backend was actually doing, so a user staring at
 * "88%" could not tell whether the shell was still booting, the runtime
 * process had failed to spawn, or a network probe was hanging. Three separate
 * reports (issues #20, #21, #22) describe the same symptom - "stuck at 88%" -
 * with no way to tell them apart from the screen alone.
 *
 * The invariant this module establishes:
 *
 *   progress percentage != startup truth
 *   startup phase        == startup truth
 *
 * The percentage animation may stay as decoration, but every claim about
 * "where startup is" must come from a real backend lifecycle transition.
 *
 * DESIGN NOTES
 * ------------
 * - Phases are a small closed set. Adding one is a deliberate act, not a
 *   side effect of string interpolation.
 * - The phase is carried on the EXISTING runtime status event as an optional
 *   `phase` field. It does not introduce a second, parallel status system:
 *   consumers that ignore `phase` keep working exactly as before.
 * - The recorder is a pure, injectable-clock object so tests can assert
 *   durations without sleeping.
 * - History is bounded. A pathological restart loop must not grow memory
 *   without limit.
 */

export const STARTUP_PHASES = Object.freeze({
  SHELL: 'shell',
  PROFILE: 'profile',
  RUNTIME_RESOLVE: 'runtime-resolve',
  RUNTIME_SPAWN: 'runtime-spawn',
  RUNTIME_READY: 'runtime-ready',
  PLUGIN_RECOVERY: 'plugin-recovery',
  REPAIR: 'repair',
  READY: 'ready',
  FAILED: 'failed',
})

const ALL_PHASES = Object.freeze(Object.values(STARTUP_PHASES))

/** User-facing copy. Keep it plain and specific; no emoji (see AGENTS.md). */
export const STARTUP_PHASE_LABELS = Object.freeze({
  shell: '正在准备桌面环境',
  profile: '正在检查 Desktop Profile',
  'runtime-resolve': '正在准备本地运行时',
  'runtime-spawn': '正在启动 DeepSeek Harness',
  'runtime-ready': '正在等待本地运行时就绪',
  'plugin-recovery': '正在检查插件环境',
  repair: '正在恢复运行环境',
  ready: '启动完成',
  failed: '启动未能完成',
})

/** Terminal outcomes recorded for a completed phase. */
export const STARTUP_OUTCOMES = Object.freeze({
  OK: 'ok',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  PENDING: 'pending',
})

export function isStartupPhase(value) {
  return typeof value === 'string' && ALL_PHASES.includes(value)
}

/**
 * Map a startup error to a stable, machine-readable category.
 *
 * Mirrors the categories the Desktop contract already exposes for runtime
 * errors so the UI can offer the right next action (retry vs. diagnostics vs.
 * recovery) without parsing prose.
 *
 * @param {unknown} error
 * @returns {string} one of timeout | port-conflict | permission | integrity | unknown
 */
export function classifyStartupFailure(error) {
  const message = String(error?.message ?? error).toLowerCase()
  if (/did not become ready|timed out|timeout/.test(message)) return 'startup-timeout'
  if (/eaddrinuse|port\s+\d{2,5}\s+(?:is\s+)?(?:already\s+)?(?:in\s+use|occupied)/.test(message)) {
    return 'port-conflict'
  }
  if (/eacces|eperm|permission denied/.test(message)) return 'permission'
  if (/integrity|checksum|sha(?:256|512)|signature/.test(message)) return 'integrity'
  return 'unknown'
}

/**
 * Records phase transitions and renders them as a diagnostics-ready history.
 *
 * A phase is "open" from enter() until complete(); an open phase reports
 * `pending` with a live duration so the UI can say "waited 34 seconds"
 * without the backend having to publish a tick.
 *
 * @param {object} [options]
 * @param {() => number} [options.now] monotonic-ish clock in milliseconds
 * @param {number} [options.maxEntries] bounded history depth
 */
export function createStartupPhaseRecorder({ now = () => Date.now(), maxEntries = 64 } = {}) {
  if (typeof now !== 'function') throw new TypeError('startup phase recorder requires a clock')
  const boundedEntries = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 64
  /** @type {{phase: string, startedAt: string, durationMs: number, outcome: string}[]} */
  const entries = []
  /** insertion-ordered: the last entry is the phase the user is waiting on */
  const open = new Map()
  let currentPhase

  const iso = (ms) => new Date(ms).toISOString()

  return Object.freeze({
    /** Enter a phase. Re-entering the same phase is a no-op, not a new entry. */
    enter(phase) {
      if (!isStartupPhase(phase)) return
      if (open.has(phase)) return
      open.set(phase, now())
      currentPhase = phase
    },

    /** Close a phase with an outcome. Unknown/never-entered phases are ignored. */
    complete(phase, outcome = STARTUP_OUTCOMES.OK) {
      if (!isStartupPhase(phase)) return
      const startedAtMs = open.get(phase)
      if (startedAtMs === undefined) return
      open.delete(phase)
      const endedAtMs = now()
      entries.push(Object.freeze({
        phase,
        startedAt: iso(startedAtMs),
        durationMs: endedAtMs - startedAtMs,
        outcome,
      }))
      if (entries.length > boundedEntries) entries.shift()
      if (currentPhase === phase) currentPhase = undefined
    },

    /** The phase the user is currently waiting on, if any. */
    current() {
      return currentPhase
    },

    /** Milliseconds spent in the current open phase, or 0 when none is open. */
    currentElapsedMs() {
      if (currentPhase === undefined) return 0
      const startedAtMs = open.get(currentPhase)
      return startedAtMs === undefined ? 0 : Math.max(0, now() - startedAtMs)
    },

    /**
     * Closed entries plus the still-open one, oldest first.
     * Safe to serialize into diagnostics: it holds no tokens, no credentials,
     * no absolute paths and no message content - only phase names, timestamps
     * and durations.
     */
    history() {
      const history = [...entries]
      if (currentPhase !== undefined) {
        const startedAtMs = open.get(currentPhase)
        if (startedAtMs !== undefined) {
          history.push(Object.freeze({
            phase: currentPhase,
            startedAt: iso(startedAtMs),
            durationMs: Math.max(0, now() - startedAtMs),
            outcome: STARTUP_OUTCOMES.PENDING,
          }))
        }
      }
      return Object.freeze(history)
    },

    /** Drop all recorded history; used when a fresh startup attempt begins. */
    reset() {
      entries.length = 0
      open.clear()
      currentPhase = undefined
    },
  })
}
