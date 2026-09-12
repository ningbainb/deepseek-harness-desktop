/**
 * Board controller: the single owner of task-ledger state and view state.
 *
 * It keeps the ledger in memory, persists every mutation through the
 * {@link TaskStore}, drives real executions through the
 * {@link ExecutionService}, and closes the board view whenever the user
 * navigates to a session (the sessions-list `current` selection changes).
 * Framework-free (structural runtime faces) so the whole orchestration is
 * unit-testable with fakes.
 *
 * The per use-case domain transitions (create/update/delete/schedule) live in
 * dedicated modules under core/use-cases and are applied here; the controller
 * owns only the orchestration seam (state, persistence, notify, execution,
 * navigation, reconciliation).
 */
import { ExecutionService, type ExecutionEvent } from './execution.ts'
import { collectEvidence, type EvidenceStore } from './evidence.ts'
import type { EvidenceReviewService } from './review.ts'
import { createTaskRunReference, type Evidence, type Project, type ReviewResult, type TaskRunReference } from './runs.ts'
import type { TaskStore } from './store.ts'
import type { WorktreeExecutionResult } from './worktree-execution.ts'
import {
  settleExecution, startExecution, withStatus,
  type ExecutionRecord, type NewTaskInput, type ScheduleMisfirePolicy, type ScheduleRunningPolicy, type TaskRecord, type TaskStatus,
} from './tasks.ts'
import { applyCreateTask } from './use-cases/task-create.ts'
import { applyDeleteTask } from './use-cases/task-delete.ts'
import { applyScheduleNextRun as applyScheduleRollForward, applySetSchedule } from './use-cases/task-schedule.ts'
import { applyUpdateTask } from './use-cases/task-update.ts'
import { rebaseTaskDraft, TaskDraftConflictError, type PersistenceStatus } from './persistence.ts'

/** The sessions face the controller needs for navigation awareness. */
export interface SessionsControllerFace {
  list: {
    getSnapshot(): { current: string | undefined }
    subscribe(fn: () => void): () => void
  }
  /** Select a session as current (navigates the conversation view). */
  open(id: string): void
}

export interface WorktreeAvailability {
  available: boolean
  /** User-readable bounded reason when isolation is unavailable. */
  reason?: string
}
/** Controller dependencies (all swappable in tests). */
export interface ControllerDeps {
  store: TaskStore
  exec: ExecutionService
  sessions: SessionsControllerFace
  /** Clock; defaults to Date.now. */
  now?: () => number
  /** Id minting; defaults to a random-uuid. */
  uuid?: () => string
  /** Debounce (ms) for session-list-changed reconciles; defaults to 350. */
  reconcileDebounceMs?: number
  /** Optional host integration for settled execution notifications. */
  onExecutionSettled?: (event: Readonly<{
    taskId: string
    title: string
    executionId: string
    outcome: 'succeeded' | 'failed' | 'cancelled'
    error?: string
  }>) => void | Promise<void>
  /** Optional derived Evidence store; absent for legacy shared-workspace web. */
  evidenceStore?: EvidenceStore
  reviewService?: EvidenceReviewService
  /** Optional 2.6 Worktree driver; shared-workspace remains the default. */
  worktreeExecution?: {
    runTask: (task: TaskRecord, execution: ExecutionRecord, project: Project | undefined, onEvent: (event: ExecutionEvent) => void) => Promise<WorktreeExecutionResult>
    reconcileTask?: (task: TaskRecord, execution: ExecutionRecord, project: Project | undefined) => Promise<WorktreeExecutionResult | undefined>
    resolveProject?: (task: TaskRecord) => Project | undefined
  }
  /** Combined Git Graph + provider capability + Git-repository preflight. */
  worktreeAvailability?: WorktreeAvailability | (() => WorktreeAvailability)
}

/** Immutable controller snapshot for UI subscriptions. */
export interface ControllerSnapshot {
  tasks: readonly TaskRecord[]
  boardOpen: boolean
  selectedTaskId: string | undefined
  /** Local changes are authoritative only after this returns to saved. */
  persistence: PersistenceStatus
}

/** The selected task (resolved from the ledger), or undefined. */
export function selectedTaskOf(snapshot: ControllerSnapshot): TaskRecord | undefined {
  if (snapshot.selectedTaskId === undefined) return undefined
  return snapshot.tasks.find(task => task.id === snapshot.selectedTaskId)
}

function randomUuid(): string {
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(16))
  if (bytes === undefined) {
    // Non-secure fallback (tests, odd environments).
    return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Read the current selection off a session-list snapshot (structural). */
function currentOf(sessions: SessionsControllerFace): string | undefined {
  return sessions.list.getSnapshot().current
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return value !== null && value !== undefined && typeof (value as { then?: unknown }).then === 'function'
}

type SettledExecutionEvent = Extract<ExecutionEvent, { kind: 'settled' }>

interface ExternalHostScheduledSettlement {
  task: TaskRecord
  event: SettledExecutionEvent
}

function executionForRun(task: TaskRecord, runId: string): ExecutionRecord | undefined {
  return task.executions.find(execution => (execution.runId ?? execution.id) === runId)
}

function isRunningExecution(execution: ExecutionRecord | undefined): execution is ExecutionRecord {
  return execution !== undefined
    && execution.result === undefined
    && execution.finishedAt === undefined
    && execution.endedAt === undefined
}

function isSettledOutcome(value: ExecutionRecord['result']): value is SettledExecutionEvent['outcome'] {
  return value === 'succeeded' || value === 'failed' || value === 'cancelled'
}

function isTerminalHostRun(task: TaskRecord, runId: string): boolean {
  const run = task.runs?.find(candidate => candidate.runId === runId)
  return run !== undefined && run.resultStatus !== 'running'
}

/**
 * Convert a Host-owned ledger transition into the same neutral controller
 * event used by live browser executions. The Host communicates only through
 * the v3 ledger/SSE boundary; the client deliberately owns notification UX.
 */
function externalHostScheduledSettlements(
  previousTasks: readonly TaskRecord[],
  nextTasks: readonly TaskRecord[],
): ExternalHostScheduledSettlement[] {
  const previousById = new Map(previousTasks.map(task => [task.id, task]))
  const settlements: ExternalHostScheduledSettlement[] = []
  for (const task of nextTasks) {
    const previous = previousById.get(task.id)
    const runId = previous?.schedule?.lastRunId
    if (previous === undefined || runId === undefined
      || previous.status !== 'running'
      || previous.schedule?.providerEvidence === undefined
      // The new snapshot retains the Host scheduler attribution. Requiring it
      // on both sides avoids inferring a notification from a concurrent
      // schedule edit or a legacy/browser-only run.
      || task.schedule?.lastRunId !== runId
      || task.schedule.providerEvidence === undefined
      || !isRunningExecution(executionForRun(previous, runId))
      || !isTerminalHostRun(task, runId)) continue

    const execution = executionForRun(task, runId)
    if (execution === undefined || !isSettledOutcome(execution.result)
      || (execution.finishedAt === undefined && execution.endedAt === undefined)) continue
    settlements.push({
      task,
      event: {
        kind: 'settled',
        taskId: task.id,
        executionId: runId,
        outcome: execution.result,
        ...(execution.error === undefined ? {} : { error: execution.error }),
      },
    })
  }
  return settlements
}

/**
 * Board controller (see module doc). All mutations bump the snapshot and
 * persist through the store; UI and DOM mounts subscribe and re-render.
 */
export class BoardController {
  private tasks: TaskRecord[] = []
  private boardOpen = false
  private selectedTaskId: string | undefined
  private listeners = new Set<() => void>()
  private disposers: Array<() => void> = []
  private readonly now: () => number
  private readonly uuid: () => string
  private evidences: Evidence[] = []
  private savedTasks: TaskRecord[] = []
  /** Last acknowledged local candidate, excluding Host fields merged into it. */
  private draftBase: TaskRecord[] | undefined
  private persistence: PersistenceStatus = 'saved'
  private writeVersion = 0
  private writeQueue: Promise<void> | undefined
  private writesInFlight = 0
  private externalRequested = false
  private externalReadVersion = 0
  private externalRead: Promise<void> | undefined
  private externalReadFailed = false
  private disposed = false
  private rejectedAdmissions = new Map<string, TaskStatus>()
  /**
   * SSE may replay an old running/terminal pair after reconnecting. This is
   * intentionally process-local: notification delivery is never ledger state.
   */
  private readonly externallyNotifiedHostSettlements = new Set<string>()

  /** @param deps - store, execution service, and the sessions navigation face. */
  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.uuid = deps.uuid ?? randomUuid
  }

  // --- lifecycle -------------------------------------------------------------

  /** Load the persisted ledger and start the navigation/status subscriptions. */
  start(): void | Promise<void> {
    const loaded = this.deps.store.load()
    if (isPromise(loaded)) {
      return loaded.then(tasks => { this.finishStart(tasks) })
    }
    this.finishStart(loaded)
  }

  /** Complete startup synchronously for local stores and after await for Host stores. */
  private finishStart(tasks: TaskRecord[]): void {
    this.tasks = tasks
    this.savedTasks = tasks
    void this.loadEvidence()
    void this.reconcileRunningTasks()
    // A sibling tab may have edited or deleted the ledger (same origin,
    // storage events). Reload on external change so a task deleted in
    // another tab stops firing here — and is never written back by this
    // tab's stale copy (scheduler roll-forward, execution settlement).
    const unsubscribeExternal = this.deps.store.subscribeExternal?.(() => { this.requestExternalReload() })
    if (unsubscribeExternal !== undefined) this.disposers.push(unsubscribeExternal)
    this.disposers.push(this.deps.sessions.list.subscribe(() => {
      this.onSessionsChanged()
    }))
    this.notify()
  }

  /** Stop all subscriptions and drop retained state (idempotent). */
  dispose(): void {
    this.disposed = true
    this.externalReadVersion++
    for (const dispose of this.disposers.splice(0)) dispose()
    this.listeners.clear()
    if (this.reconcileTimer !== undefined) clearTimeout(this.reconcileTimer)
    this.reconcileTimer = undefined
  }

  // --- snapshot / subscription ------------------------------------------------

  getSnapshot(): ControllerSnapshot {
    return {
      tasks: this.tasks,
      boardOpen: this.boardOpen,
      selectedTaskId: this.selectedTaskId,
      persistence: this.persistence,
    }
  }

  /** Latest derived Evidence for a task, if the optional store is wired. */
  getLatestEvidence(taskId: string): Evidence | undefined {
    const task = this.tasks.find(candidate => candidate.id === taskId)
    if (task === undefined) return undefined
    const runIds = new Set([
      ...(task.runs ?? []).map(run => run.runId),
      ...task.executions.map(execution => execution.runId ?? execution.id),
    ])
    return [...this.evidences].reverse().find(evidence => runIds.has(evidence.runId))
  }

  async commitEvidence(evidenceId: string, message = 'Task Board: accept reviewed changes'): Promise<ReviewResult | undefined> {
    const result = await (this.deps.reviewService?.commit(evidenceId, message) ?? Promise.resolve(undefined))
    await this.refreshEvidence(evidenceId)
    this.applyReviewResult(evidenceId, result)
    return result
  }

  async mergeEvidence(evidenceId: string, targetBranch = 'main'): Promise<ReviewResult | undefined> {
    const result = await (this.deps.reviewService?.merge(evidenceId, targetBranch) ?? Promise.resolve(undefined))
    await this.refreshEvidence(evidenceId)
    this.applyReviewResult(evidenceId, result)
    return result
  }

  async keepEvidence(evidenceId: string): Promise<ReviewResult | undefined> {
    const result = await (this.deps.reviewService?.keep(evidenceId) ?? Promise.resolve(undefined))
    await this.refreshEvidence(evidenceId)
    this.applyReviewResult(evidenceId, result)
    return result
  }

  async discardEvidence(evidenceId: string, confirmed: boolean): Promise<ReviewResult | undefined> {
    const result = await (this.deps.reviewService?.discard(evidenceId, confirmed) ?? Promise.resolve(undefined))
    await this.refreshEvidence(evidenceId)
    this.applyReviewResult(evidenceId, result)
    return result
  }

  hasReviewService(): boolean {
    return this.deps.reviewService !== undefined
  }

  getWorktreeAvailability(): WorktreeAvailability {
    if (this.deps.worktreeExecution === undefined) {
      return { available: false, reason: 'Runtime Provider Worktree execution is not wired; shared workspace will be used' }
    }
    const configured = typeof this.deps.worktreeAvailability === 'function'
      ? this.deps.worktreeAvailability()
      : this.deps.worktreeAvailability
    if (configured?.available !== true) {
      return { available: false, reason: configured?.reason?.slice(0, 500) ?? 'Git Graph, provider capabilities, or Git repository preflight is unavailable' }
    }
    return { available: true }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  // --- view state -------------------------------------------------------------

  openBoard(): void {
    if (this.boardOpen) return
    // Baseline the selection the board opened against: the board stays open
    // until the user navigates (selection changes), never on mere status
    // updates of the already-selected session.
    this.lastCurrent = currentOf(this.deps.sessions)
    this.boardOpen = true
    this.notify()
  }

  closeBoard(): void {
    if (!this.boardOpen) return
    this.boardOpen = false
    this.notify()
  }

  toggleBoard(): void {
    if (this.boardOpen) this.closeBoard()
    else this.openBoard()
  }

  openTask(id: string): void {
    if (this.tasks.some(task => task.id === id)) {
      this.selectedTaskId = id
      this.notify()
    }
  }

  closeTask(): void {
    if (this.selectedTaskId === undefined) return
    this.selectedTaskId = undefined
    this.notify()
  }

  // --- task mutations (use-case transitions in core/use-cases) -----------------

  createTask(input: NewTaskInput): TaskRecord | undefined {
    const { task, tasks } = applyCreateTask(this.tasks, input, this.now(), this.uuid())
    if (task === undefined) return undefined
    this.tasks = [...tasks]
    this.persistAndNotify()
    return task
  }

  updateTask(id: string, patch: Partial<Pick<TaskRecord, 'title' | 'description' | 'prompt'>>): void {
    this.tasks = [...applyUpdateTask(this.tasks, id, patch, this.now())]
    this.persistAndNotify()
  }

  moveTask(id: string, status: TaskStatus): void {
    this.tasks = this.tasks.map(task => task.id === id ? withStatus(task, status, this.now()) : task)
    this.persistAndNotify()
  }

  deleteTask(id: string): void {
    const { tasks, selectionCleared } = applyDeleteTask(this.tasks, this.selectedTaskId, id)
    this.tasks = [...tasks]
    if (selectionCleared) this.selectedTaskId = undefined
    this.persistAndNotify()
  }

  // --- scheduling ---------------------------------------------------------------

  /**
   * Update a task's schedule rule. A blank or invalid cron expression is
   * rejected (returns false, state untouched). When the rule ends up enabled
   * the next run instant is computed immediately; a disabled rule carries no
   * next-run instant. Delegates the domain transition to the schedule use case.
   * @param id - the task to schedule.
   * @param patch - fields to change (absent fields keep their current value).
   * @returns true when applied, false when rejected (invalid cron / unknown task).
   */
  setSchedule(id: string, patch: {
    enabled?: boolean
    cron?: string
    timezone?: string
    misfirePolicy?: ScheduleMisfirePolicy
    runningPolicy?: ScheduleRunningPolicy
  }): boolean {
    const { tasks, applied } = applySetSchedule(this.tasks, id, patch, this.now())
    if (!applied) return false
    this.tasks = [...tasks]
    this.persistAndNotify()
    return true
  }

  /**
   * Roll a task's schedule forward (scheduler callback): persist the next due
   * instant and the trigger instant of this run. No-op when the task has no
   * schedule rule (it was deleted mid-tick, for example).
   */
  applyScheduleNextRun(id: string, nextRunAt: number | undefined, lastTriggeredAt: number | undefined): void {
    const next = applyScheduleRollForward(this.tasks, id, nextRunAt, lastTriggeredAt, this.now())
    this.tasks = [...next]
    this.persistAndNotify()
  }

  /**
   * Jump to an execution's session transcript. Selecting the session changes
   * `current`, which closes the board (the conversation view takes over).
   * @param sessionId - the execution session to open.
   */
  openSession(sessionId: string): void {
    this.deps.sessions.open(sessionId)
  }

  // --- execution ---------------------------------------------------------------

  /**
   * Execute a task for real: move it to 'running', open an execution record,
   * and hand off to the ExecutionService. A second call while the task is
   * already running is ignored.
   */
  async runTask(id: string): Promise<boolean> {
    if (this.writeQueue !== undefined) await this.waitForPersistence()
    if (this.persistence !== 'saved') return false
    const task = this.tasks.find(candidate => candidate.id === id)
    if (task === undefined || task.status === 'running') return false
    const beforeStart = this.tasks
    const { task: started, execution } = startExecution(task, this.now(), this.uuid())
    const next = addTaskRunReference(started, createTaskRunReference({
      runId: execution.runId ?? execution.id,
      workspaceId: execution.workspaceId ?? 'shared',
      startedAt: execution.startedAt,
      resultStatus: 'running',
      runtimeProviderEvidence: { note: 'shared-workspace execution' },
    }))
    this.tasks = this.tasks.map(candidate => candidate.id === id ? next : candidate)
    // A scheduled browser launch is an admission boundary, not a best-effort
    // UI write. Wait until the authoritative store accepts this running
    // record before opening an agent session. If the Host claimed the same
    // task between a stale ownership read and this save, RemoteTaskStoreV3
    // returns a revision conflict and no second agent is started.
    if (!await this.persistExecutionStart(beforeStart)) return false
    // This page owns the settlement of its own launches: the live watch
    // (ExecutionService.run) settles on the turn boundary, and list
    // reconciliation must not pre-empt it with a session that has not
    // started a turn yet (its list row is idle, not completed).
    this.activeExecutionIds.add(execution.id)
    const worktree = this.deps.worktreeExecution
    if (task.isolationMode === 'git-worktree' && worktree !== undefined) {
      const result = await worktree.runTask(next, execution, worktree.resolveProject?.(task), event => { this.handleExecutionEvent(event) })
      if (result.mode === 'shared-workspace-fallback') {
        this.annotateRunFallback(execution.id, result.fallbackReason ?? 'Worktree execution unavailable; shared workspace used', result.capabilityEvidence)
        await this.deps.exec.run(this.tasks.find(candidate => candidate.id === id) ?? next, execution, event => { this.handleExecutionEvent(event) })
      } else if (result.mode === 'blocked') {
        if (result.run !== undefined) this.attachRunResult(execution.id, result.run)
        else this.annotateRunFallback(execution.id, result.fallbackReason ?? 'Worktree execution blocked', result.capabilityEvidence)
        this.handleExecutionEvent({ kind: 'settled', taskId: id, executionId: execution.id, outcome: 'failed', error: result.fallbackReason ?? 'Worktree execution blocked' })
      } else if (result.run !== undefined) {
        this.attachRunResult(execution.id, result.run)
      }
    } else {
      if (task.isolationMode === 'git-worktree') this.annotateRunFallback(execution.id, 'Worktree capability is not wired in this Runtime Provider; shared workspace used')
      await this.deps.exec.run(this.tasks.find(candidate => candidate.id === id) ?? next, execution, event => { this.handleExecutionEvent(event) })
    }
    return true
  }

  /** Resolve an opaque Run deep link back to its task/Evidence review view. */
  openRun(runId: string): void {
    const task = this.tasks.find(candidate => (candidate.runs ?? []).some(run => run.runId === runId))
    if (task === undefined) return
    this.boardOpen = true
    this.selectedTaskId = task.id
    this.notify()
  }

  /** Re-run a settled task: move it back to 'todo' first, then execute. */
  async rerunTask(id: string): Promise<void> {
    const task = this.tasks.find(candidate => candidate.id === id)
    if (task === undefined) return
    if (task.status !== 'running') {
      this.tasks = this.tasks.map(candidate => candidate.id === id ? withStatus(candidate, 'todo', this.now()) : candidate)
      this.persistAndNotify()
    }
    await this.runTask(id)
  }

  private handleExecutionEvent(event: ExecutionEvent): void {
    if (event.kind === 'started') {
      this.tasks = this.tasks.map(task => task.id === event.taskId
        ? attachSessionId(attachRunSession(task, event.executionId, event.sessionId, event.workspaceId, this.now()), event.executionId, event.sessionId, event.workspaceId, this.now())
        : task)
      this.persistAndNotify()
      return
    }
    this.activeExecutionIds.delete(event.executionId)
    const task = this.tasks.find(candidate => candidate.id === event.taskId)
    this.tasks = this.tasks.map(task => task.id === event.taskId
      ? settleRunReference(settleExecution(task, event.executionId, event.outcome, this.now(), event.error), event.executionId, event.outcome, this.now(), event.error)
      : task)
    this.persistAndNotify()
    if (task !== undefined && this.shouldPersistSharedEvidence(task, event.executionId)) {
      void this.persistSharedEvidence(task, event)
    }
    if (task !== undefined) this.notifyExecutionSettled(task, event)
  }

  // --- internals ---------------------------------------------------------------

  /** Reconcile running tasks and close the board when the user navigates. */
  private onSessionsChanged(): void {
    // Background/leftover executions settle through the session list (their
    // conversation snapshots stay cold until opened). Coalesce the burst of
    // list notifications into one reconcile pass instead of fanning out a
    // history read per notification; see scheduleReconcile.
    this.scheduleReconcile()
    if (!this.boardOpen) return
    const current = currentOf(this.deps.sessions)
    if (current !== this.lastCurrent) this.closeBoard()
    this.lastCurrent = current
  }

  private lastCurrent: string | undefined = undefined

  /** Execution ids launched on this page; they settle via their live watch, never list reconciliation. */
  private readonly activeExecutionIds = new Set<string>()

  /** Debounce timer for {@link reconcileRunningTasks}. */
  private reconcileTimer: ReturnType<typeof setTimeout> | undefined = undefined

  /** Whether a reconcile pass is underway (single-flight guard). */
  private reconcileInFlight = false

  /**
   * Debounce + single-flight trigger for the running-task reconciliation.
   * Session-list notifications arrive in bursts (one per session status
   * change); both guards together keep a burst from reading the history API
   * once per running task.
   */
  private scheduleReconcile(): void {
    if (this.reconcileTimer !== undefined) return
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = undefined
      void this.reconcileRunningTasks()
    }, this.deps.reconcileDebounceMs ?? 350)
  }

  /** Settle tasks left 'running' whose sessions already finished. */
  private async reconcileRunningTasks(): Promise<void> {
    if (this.reconcileInFlight) return
    this.reconcileInFlight = true
    try {
      type Settled = Extract<ExecutionEvent, { kind: 'settled' }>
      const events: Array<{ taskId: string; event: Settled }> = []
      for (const task of this.tasks) {
        if (task.status !== 'running') continue
        const execution = task.executions[task.executions.length - 1]
        // Runs launched on this page settle through their live watch (turn
        // boundary); reconciliation exists for background/leftover runs.
        if (execution !== undefined && this.activeExecutionIds.has(execution.id)) continue
        const runId = execution?.runId ?? execution?.id
        const run = runId === undefined ? undefined : task.runs?.find(candidate => candidate.runId === runId)
        const worktree = this.deps.worktreeExecution
        if (execution !== undefined && run?.worktreeId !== undefined && worktree?.reconcileTask !== undefined) {
          this.activeExecutionIds.add(execution.id)
          void worktree.reconcileTask(task, execution, worktree.resolveProject?.(task)).then((result) => {
            if (result === undefined) return
            this.attachRunResult(execution.id, result.run)
            const status = result.resultStatus ?? result.run.resultStatus
            const outcome = status === 'cancelled' ? 'cancelled' : status === 'failed' ? 'failed' : 'succeeded'
            this.handleExecutionEvent({
              kind: 'settled',
              taskId: task.id,
              executionId: execution.id,
              outcome,
              ...(result.fallbackReason === undefined ? {} : { error: result.fallbackReason }),
            })
          }).catch((error) => {
            const reason = error instanceof Error ? error.message : String(error)
            this.annotateRunFallback(execution.id, `Worktree reconciliation failed: ${reason}`)
            this.handleExecutionEvent({ kind: 'settled', taskId: task.id, executionId: execution.id, outcome: 'failed', error: reason })
          })
          continue
        }
        const event = await this.deps.exec.reconcile(task)
        if (event !== undefined && event.kind === 'settled') events.push({ taskId: task.id, event })
      }
      if (events.length === 0) return
      let changed = false
      for (const { taskId, event } of events) {
        // The reconcile call above awaited: a sibling tab may have rewritten
        // the ledger (storage event reload) meanwhile. Re-read the freshest
        // record now so the stale task captured before the await can never
        // overwrite fields the sibling wrote.
        const task = this.tasks.find(candidate => candidate.id === taskId)
        if (task === undefined) continue
        const next = settleRunReference(settleExecution(task, event.executionId, event.outcome, this.now(), event.error), event.executionId, event.outcome, this.now(), event.error)
        if (next === task) continue
        this.tasks = this.tasks.map(candidate => candidate.id === taskId ? next : candidate)
        this.notifyExecutionSettled(task, event)
        changed = true
      }
      if (changed) this.persistAndNotify()
    } finally {
      this.reconcileInFlight = false
    }
  }

  private persistAndNotify(): void { void this.enqueueWrite(this.tasks) }

  /** Wait for queued mutations; never launch an agent from an unsaved draft. */
  async waitForPersistence(): Promise<boolean> {
    while (this.writeQueue !== undefined) await this.writeQueue
    return this.persistence === 'saved'
  }

  /** Retry only the local differences, preserving unrelated Host/SSE updates. */
  async retryPersistence(): Promise<boolean> {
    if (this.persistence === 'saving') return false
    return this.enqueueWrite(this.tasks, true)
  }

  /** Explicitly discard a draft, only after a fresh authoritative read succeeds. */
  reloadSavedTasks(): Promise<boolean> {
    if (this.persistence === 'saving') return Promise.resolve(false)
    const version = ++this.writeVersion
    this.persistence = 'saving'
    this.writesInFlight++
    this.notify()
    const result = Promise.resolve(this.externalRead).then(() => this.loadSavedTasks()).then(tasks => {
      this.savedTasks = tasks
      this.externalReadFailed = false
      if (version !== this.writeVersion || this.disposed) return false
      this.persistence = 'saved'
      this.draftBase = undefined
      this.applyExternalSnapshot(tasks)
      return true
    }, () => {
      if (version === this.writeVersion) { this.persistence = 'error'; this.notify() }
      return false
    }).finally(() => { this.writesInFlight-- })
    this.trackWrite(result)
    return result
  }

  private enqueueWrite(candidate: TaskRecord[], reload = false, onFailure?: () => void): Promise<boolean> {
    const version = ++this.writeVersion
    const base = this.draftBase ?? this.savedTasks
    this.draftBase ??= this.savedTasks
    this.persistence = 'saving'
    this.writesInFlight++
    const settle = (ok: boolean, tasks?: TaskRecord[], error?: unknown): boolean => {
      this.writesInFlight--
      if (ok && tasks !== undefined) {
        this.savedTasks = tasks
        // Later queued candidates were edited from this local view, before
        // unseen Host fields were merged. Do not misread those absent Host
        // fields in the next candidate as intentional local deletions.
        this.draftBase = version === this.writeVersion ? undefined : this.removeRejectedAdmissions(candidate)
      }
      if (!ok) onFailure?.()
      if (version === this.writeVersion && !this.disposed) {
        this.persistence = ok ? 'saved' : error instanceof TaskDraftConflictError || (error instanceof Error && error.name === 'TaskLedgerV3ConflictError') ? 'conflict' : 'error'
        if (ok && tasks !== undefined) this.tasks = tasks
        this.notify()
      }
      return ok
    }
    const save = (): boolean | Promise<boolean> => {
      try {
        if (this.externalReadFailed) throw new Error('task ledger reload failed')
        // A prior local write may have been acknowledged while this edit was
        // queued. Advance its ancestor too, including an intentional undo.
        const tasks = rebaseTaskDraft(this.draftBase ?? base, this.removeRejectedAdmissions(candidate), this.savedTasks)
        const result = this.deps.store.saveChecked !== undefined
          ? this.deps.store.saveChecked(tasks)
          : this.deps.store.save(tasks)
        return isPromise(result) ? result.then(() => settle(true, tasks), error => settle(false, undefined, error)) : settle(true, tasks)
      } catch (error) { return settle(false, undefined, error) }
    }
    const operation = (): boolean | Promise<boolean> => reload
      ? Promise.resolve().then(() => this.loadSavedTasks()).then(tasks => { this.savedTasks = tasks; this.externalReadFailed = false; return save() }, error => settle(false, undefined, error))
      : save()
    // A Host read advances both its tasks and the transport revision. Compute
    // the merge only after that pair has reached the controller.
    const predecessor = this.writeQueue ?? this.externalRead
    const result = predecessor === undefined ? operation() : predecessor.then(operation)
    if (isPromise(result)) {
      this.trackWrite(result)
      this.notify()
      return result
    }
    if (this.externalRequested) this.requestExternalReload()
    return Promise.resolve(result)
  }

  private trackWrite(result: Promise<boolean>): void {
    const queued = result.then(() => {})
    this.writeQueue = queued
    void queued.then(() => {
      if (this.writeQueue === queued) this.writeQueue = undefined
      if (this.writesInFlight === 0) {
        this.rejectedAdmissions.clear()
        if (this.externalRequested) this.requestExternalReload()
      }
    })
  }

  /** Later queued edits must never re-create an execution whose admission failed. */
  private removeRejectedAdmissions(tasks: TaskRecord[]): TaskRecord[] {
    if (this.rejectedAdmissions.size === 0) return tasks
    return tasks.map(task => {
      const rejected = task.executions.find(execution => this.rejectedAdmissions.has(execution.id))
      if (rejected === undefined) return task
      const executions = task.executions.filter(execution => !this.rejectedAdmissions.has(execution.id))
      const runs = task.runs?.filter(run => !this.rejectedAdmissions.has(run.runId))
      const status = task.status === 'running' ? this.rejectedAdmissions.get(rejected.id)! : task.status
      return { ...task, executions, ...(runs === undefined ? {} : { runs }), status }
    })
  }

  private requestExternalReload(): void {
    this.externalRequested = true
    if (this.disposed || this.writesInFlight > 0 || this.persistence !== 'saved' || this.externalRead !== undefined) return
    this.externalRequested = false
    const readVersion = ++this.externalReadVersion
    const writeVersion = this.writeVersion
    const apply = (tasks: TaskRecord[]): void => {
      if (this.disposed || readVersion !== this.externalReadVersion) return
      this.savedTasks = tasks
      this.externalReadFailed = false
      if (writeVersion !== this.writeVersion || this.writesInFlight > 0 || this.persistence !== 'saved') {
        // Keep the local draft visible. The queued write rebases it on this
        // exact saved snapshot before the store can use the new revision.
        return
      }
      this.applyExternalSnapshot(tasks)
    }
    try {
      const result = this.loadSavedTasks()
      if (isPromise(result)) {
        let loaded = false
        const read = result.then(tasks => { loaded = true; apply(tasks) }, () => { this.externalRequested = true; this.externalReadFailed = true })
        this.externalRead = read
        void read.then(() => {
          if (this.externalRead === read) this.externalRead = undefined
          // A failed GET waits for another SSE or an explicit retry; it must
          // never create an unbounded retry loop while the Host is offline.
          if (loaded && this.externalRequested) this.requestExternalReload()
        })
      } else apply(result)
    } catch { this.externalRequested = true; this.externalReadFailed = true }
  }

  private loadSavedTasks(): TaskRecord[] | Promise<TaskRecord[]> {
    return this.deps.store.loadChecked !== undefined ? this.deps.store.loadChecked() : this.deps.store.load()
  }

  /** Apply a Host/SSE reload without writing it back to the authoritative store. */
  private applyExternalSnapshot(next: TaskRecord[]): void {
    const previous = this.tasks
    this.tasks = next
    for (const settlement of externalHostScheduledSettlements(previous, next)) {
      const key = `${settlement.task.id}\u0000${settlement.event.executionId}`
      if (this.externallyNotifiedHostSettlements.has(key)) continue
      this.externallyNotifiedHostSettlements.add(key)
      this.notifyExecutionSettled(settlement.task, settlement.event)
    }
    this.notify()
  }

  /**
   * Commit an execution start before any provider side effect. On conflict or
   * I/O failure, reload the authoritative task list and leave the task
   * unlaunched so the caller can retry through the current scheduler owner.
   */
  private async persistExecutionStart(previousTasks: TaskRecord[]): Promise<boolean> {
    const previousIds = new Set(previousTasks.flatMap(task => task.executions.map(execution => execution.id)))
    const newExecutions = this.tasks.flatMap(task => task.executions.filter(execution => !previousIds.has(execution.id)).map(execution => ({ id: execution.id, status: previousTasks.find(previous => previous.id === task.id)?.status ?? 'todo' as TaskStatus })))
    const attempt = this.enqueueWrite(this.tasks, false, () => {
      for (const execution of newExecutions) this.rejectedAdmissions.set(execution.id, execution.status)
      this.tasks = this.removeRejectedAdmissions(this.tasks)
    })
    const version = this.writeVersion
    try {
      if (!await attempt) throw new Error('task execution admission was not saved')
      return true
    } catch (error) {
      console.error('[dsh-task-board] execution admission write failed', error)
      if (version !== this.writeVersion) return false
      try {
        const loaded = this.loadSavedTasks()
        const tasks = isPromise(loaded) ? await loaded : loaded
        if (version !== this.writeVersion) return false
        this.tasks = tasks
        this.savedTasks = tasks
        this.externalReadFailed = false
        this.draftBase = undefined
      } catch (reloadError) {
        console.error('[dsh-task-board] execution admission reload failed', reloadError)
        if (version === this.writeVersion) this.tasks = previousTasks
      }
      this.notify()
      return false
    }
  }

  private notifyExecutionSettled(
    task: TaskRecord,
    event: Extract<ExecutionEvent, { kind: 'settled' }>,
  ): void {
    void Promise.resolve(this.deps.onExecutionSettled?.({
      taskId: task.id,
      title: task.title,
      executionId: event.executionId,
      outcome: event.outcome,
      ...(event.error === undefined ? {} : { error: event.error }),
    })).catch((error) => {
      console.error('[dsh-task-board] execution notification failed', error)
    })
  }

  private async loadEvidence(): Promise<void> {
    const store = this.deps.evidenceStore
    if (store?.list === undefined) return
    try {
      this.evidences = await store.list()
      this.notify()
    } catch (error) {
      console.error('[dsh-task-board] evidence load failed', error)
    }
  }

  private async refreshEvidence(evidenceId: string): Promise<void> {
    const store = this.deps.evidenceStore
    if (store === undefined) return
    try {
      const evidence = await store.get(evidenceId)
      if (evidence === undefined) return
      this.evidences = [...this.evidences.filter(candidate => candidate.evidenceId !== evidenceId), evidence]
      this.notify()
    } catch (error) {
      console.error('[dsh-task-board] evidence refresh failed', error)
    }
  }

  /** Keep the TaskRun reference in lockstep with the reviewed Evidence. */
  private applyReviewResult(evidenceId: string, result: ReviewResult | undefined): void {
    if (result?.ok !== true) return
    let changed = false
    this.tasks = this.tasks.map(task => {
      let taskChanged = false
      const runs = (task.runs ?? []).map((run) => {
        if (run.evidenceId !== evidenceId || run.resultStatus === result.status) return run
        changed = true
        taskChanged = true
        return { ...run, resultStatus: result.status }
      })
      return taskChanged ? { ...task, runs, updatedAt: this.now() } : task
    })
    if (changed) this.persistAndNotify()
  }

  /** Shared-workspace runs have no Git diff, but still receive bounded Evidence. */
  private shouldPersistSharedEvidence(task: TaskRecord, executionId: string): boolean {
    const run = task.runs?.find(candidate => candidate.runId === executionId)
    if (run?.evidenceId !== undefined) return false
    if (run?.worktreeId !== undefined) return false
    // A real worktree driver writes its own Git-backed Evidence before the
    // controller attaches the completed run.  Skip the compact event here so
    // it cannot be overwritten by an unavailable shared-workspace summary.
    if (task.isolationMode === 'git-worktree' && this.deps.worktreeExecution !== undefined && run?.fallbackReason === undefined) return false
    return this.deps.evidenceStore !== undefined
  }

  private async persistSharedEvidence(task: TaskRecord, event: Extract<ExecutionEvent, { kind: 'settled' }>): Promise<void> {
    const store = this.deps.evidenceStore
    if (store === undefined) return
    const execution = task.executions.find(candidate => candidate.id === event.executionId)
    if (execution === undefined) return
    const runId = execution.runId ?? execution.id
    const run = task.runs?.find(candidate => candidate.runId === runId)
    if (run?.evidenceId !== undefined) return
    const finishedAt = this.now()
    const evidence = collectEvidence({
      evidenceId: `ev-${runId}`,
      runId,
      ...(execution.sessionId === undefined ? {} : { sessionId: execution.sessionId }),
      ...(task.projectId === undefined ? {} : { projectId: task.projectId }),
      workspaceId: execution.workspaceId ?? run?.workspaceId ?? 'shared',
      startedAt: execution.startedAt,
      finishedAt,
      resultStatus: event.outcome === 'succeeded' ? 'awaiting-review' : event.outcome,
      status: { clean: true, dirty: false },
      runtimeProviderEvidence: run?.runtimeProviderEvidence ?? { note: 'shared-workspace execution' },
    })
    try {
      await store.put(evidence)
      this.evidences = [...this.evidences.filter(candidate => candidate.evidenceId !== evidence.evidenceId), evidence]
      this.tasks = this.tasks.map(candidate => candidate.id === task.id
        ? { ...candidate, runs: (candidate.runs ?? []).map(candidateRun => candidateRun.runId === runId ? { ...candidateRun, evidenceId: evidence.evidenceId } : candidateRun) }
        : candidate)
      this.persistAndNotify()
    } catch (error) {
      console.error('[dsh-task-board] shared execution evidence write failed', error)
    }
  }

  private annotateRunFallback(executionId: string, reason: string, capabilityEvidence?: unknown): void {
    this.tasks = this.tasks.map(task => ({
      ...task,
      runs: (task.runs ?? []).map(run => run.runId === executionId
        ? { ...run, fallbackReason: reason, runtimeProviderEvidence: capabilityEvidence && typeof capabilityEvidence === 'object' ? { ...run.runtimeProviderEvidence, ...(capabilityEvidence as Record<string, unknown>) } : { ...run.runtimeProviderEvidence, note: reason } }
        : run),
    }))
    this.persistAndNotify()
  }

  private attachRunResult(executionId: string, result: TaskRunReference): void {
    this.tasks = this.tasks.map(task => ({
      ...task,
      runs: (task.runs ?? []).map(run => run.runId === executionId
        ? { ...run, ...result }
        : run),
    }))
    this.persistAndNotify()
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn()
  }
}

/** Record which session ran an execution (once the execution service reports it). */
function attachSessionId(
  task: TaskRecord,
  executionId: string,
  sessionId: string,
  workspaceId: string | undefined,
  now: number,
): TaskRecord {
  return {
    ...task,
    updatedAt: now,
    executions: task.executions.map(execution =>
      execution.id === executionId ? { ...execution, sessionId, workspaceId } : execution),
  }
}

function addTaskRunReference(task: TaskRecord, run: TaskRunReference): TaskRecord {
  return { ...task, runs: [...(task.runs ?? []), run] }
}

function attachRunSession(
  task: TaskRecord,
  executionId: string,
  sessionId: string,
  workspaceId: string | undefined,
  now: number,
): TaskRecord {
  const runId = executionId
  return {
    ...task,
    runs: (task.runs ?? []).map(run => run.runId === runId
      ? { ...run, sessionId, ...(workspaceId === undefined ? {} : { workspaceId }) }
      : run),
    updatedAt: now,
  }
}

function settleRunReference(
  task: TaskRecord,
  executionId: string,
  outcome: 'succeeded' | 'failed' | 'cancelled',
  now: number,
  error: string | undefined,
): TaskRecord {
  const resultStatus: TaskRunReference['resultStatus'] = outcome === 'succeeded' ? 'awaiting-review' : outcome
  return {
    ...task,
    runs: (task.runs ?? []).map(run => run.runId === executionId
      ? {
        ...run,
        finishedAt: now,
        resultStatus,
        ...(error === undefined ? {} : { fallbackReason: error }),
      }
      : run),
  }
}
