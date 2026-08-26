import { sessionDurationBucket, startupDurationBucket } from './telemetry-events.mjs'

const UPDATE_EVENTS = Object.freeze({
  downloading: Object.freeze({ name: 'update_available', outcome: 'available' }),
  ready: Object.freeze({ name: 'update_downloaded', outcome: 'downloaded' }),
  installing: Object.freeze({ name: 'update_install_requested', outcome: 'requested' }),
  error: Object.freeze({ name: 'update_error', outcome: 'error' }),
})

export function classifyRuntimeStartFailure(status) {
  if (status?.restartBlocked === 'repeated-crash') return 'repeated-crash'
  if (typeof status?.error !== 'string' || status.error.length === 0) return 'unknown'
  const message = status.error.toLowerCase()
  if (/integrity|checksum|hash mismatch/u.test(message)) return 'integrity-failed'
  if (/\bmissing\b|\bnot found\b|enoent/u.test(message)) return 'runtime-missing'
  if (/eaddrinuse|address already in use|port conflict/u.test(message)) return 'port-conflict'
  return 'startup-failed'
}

/**
 * Converts product activity into the fixed anonymous event vocabulary.
 * Raw errors and operation results are used only for local control flow and
 * can never become event dimensions.
 */
export class ProductMetricsRecorder {
  constructor({ client, now = () => performance.now() }) {
    this.client = client
    this.now = now
    this.sessionStartedAt = now()
    this.runtimeStartedAt = undefined
    this.updateDetail = 'none'
    this.lastUpdatePhase = undefined
    this.launchRecorded = false
    this.sessionEndRecorded = false
    this.milestones = new Set()
  }

  #record(name, dimensions) {
    try {
      return this.client?.record?.(name, dimensions) === true
    } catch {
      return false
    }
  }

  #recordMilestone(key, name, dimensions) {
    if (this.milestones.has(key)) return false
    this.milestones.add(key)
    return this.#record(name, dimensions)
  }

  recordLaunch(detail = 'unknown') {
    if (this.launchRecorded) return false
    this.launchRecorded = true
    return this.#record('app_launch', { outcome: 'started', detail, bucket: 'none' })
  }

  recordRecovery(detail) {
    return this.#record('runtime_recovery_action', {
      outcome: 'requested',
      detail,
      bucket: 'none',
    })
  }

  recordDirectStartReady({ detail, durationMs }) {
    return this.#recordMilestone('direct-start-ready', 'direct_start_ready', {
      outcome: 'ready',
      detail,
      bucket: startupDurationBucket(durationMs),
    })
  }

  recordFullStartFailed({ detail, durationMs }) {
    return this.#recordMilestone('full-start-failed', 'full_start_failed', {
      outcome: 'failed',
      detail,
      bucket: startupDurationBucket(durationMs),
    })
  }

  recordRepairAgentStarted(detail) {
    return this.#recordMilestone(`repair-agent-started:${detail}`, 'repair_agent_started', {
      outcome: 'started',
      detail,
      bucket: 'none',
    })
  }

  recordRepairAgentSucceeded({ detail, durationMs }) {
    return this.#recordMilestone(`repair-agent-succeeded:${detail}`, 'repair_agent_succeeded', {
      outcome: 'succeeded',
      detail,
      bucket: startupDurationBucket(durationMs),
    })
  }

  recordRepairAgentFailed({ detail, durationMs }) {
    return this.#recordMilestone(`repair-agent-failed:${detail}`, 'repair_agent_failed', {
      outcome: 'failed',
      detail,
      bucket: startupDurationBucket(durationMs),
    })
  }

  recordBuiltinsFallbackReady({ detail, durationMs }) {
    return this.#recordMilestone('builtins-fallback-ready', 'builtins_fallback_ready', {
      outcome: 'ready',
      detail,
      bucket: startupDurationBucket(durationMs),
    })
  }

  recordInstallationRepairRequired(detail) {
    return this.#recordMilestone('installation-repair-required', 'installation_repair_required', {
      outcome: 'blocked',
      detail,
      bucket: 'none',
    })
  }

  recordSurface(detail) {
    return this.#record('surface_opened', { outcome: 'opened', detail, bucket: 'none' })
  }

  observeRuntimeStatus(status) {
    if (status?.state === 'starting') {
      if (this.runtimeStartedAt === undefined) this.runtimeStartedAt = this.now()
      return
    }
    if (this.runtimeStartedAt === undefined || !['ready', 'crashed'].includes(status?.state)) return
    const duration = this.now() - this.runtimeStartedAt
    this.runtimeStartedAt = undefined
    this.#record('runtime_start_result', {
      outcome: status.state === 'ready' ? 'ready' : 'failed',
      detail: status.state === 'ready' ? 'none' : classifyRuntimeStartFailure(status),
      bucket: startupDurationBucket(duration),
    })
  }

  observeUpdateStatus(status) {
    const phase = status?.phase
    if (phase === 'checking') {
      this.updateDetail = status.visible === true ? 'manual' : 'automatic'
      this.lastUpdatePhase = phase
      return
    }
    if (phase === this.lastUpdatePhase) return
    this.lastUpdatePhase = phase
    const event = UPDATE_EVENTS[phase]
    if (event === undefined) return
    this.#record(event.name, {
      outcome: event.outcome,
      detail: this.updateDetail,
      bucket: 'none',
    })
  }

  recordUpdateCompleted() {
    return this.#recordMilestone('update-completed', 'update_completed', {
      outcome: 'completed',
      detail: 'receipt',
      bucket: 'none',
    })
  }

  recordDockImpression() {
    return this.#recordMilestone('dock-entry-impression', 'dock_entry_impression', {
      outcome: 'shown',
      detail: 'settings-adjacent',
      bucket: 'none',
    })
  }

  recordDockNudgeShown() {
    return this.#recordMilestone('dock-nudge-shown', 'dock_nudge_shown', {
      outcome: 'shown',
      detail: 'first-three-launches',
      bucket: 'none',
    })
  }

  recordDockNudgeDismissed(detail) {
    return this.#record('dock_nudge_dismissed', {
      outcome: 'dismissed',
      detail,
      bucket: 'none',
    })
  }

  recordDockClick() {
    return this.#record('dock_entry_click', {
      outcome: 'clicked',
      detail: 'settings-adjacent',
      bucket: 'none',
    })
  }

  recordDockOpened(succeeded) {
    return this.#record('dock_opened', {
      outcome: succeeded === true ? 'opened' : 'failed',
      detail: 'settings-adjacent',
      bucket: 'none',
    })
  }

  async trackExtensionOperation(detail, operation) {
    try {
      const result = await operation()
      this.#record('extension_operation', { outcome: 'success', detail, bucket: 'none' })
      return result
    } catch (error) {
      this.#record('extension_operation', { outcome: 'failure', detail, bucket: 'none' })
      throw error
    }
  }

  recordSessionEnd() {
    if (this.sessionEndRecorded) return false
    this.sessionEndRecorded = true
    return this.#record('app_session_end', {
      outcome: 'closed',
      detail: 'normal',
      bucket: sessionDurationBucket(this.now() - this.sessionStartedAt),
    })
  }
}
