/** Typed Runtime Provider boundary and the Task Board Worktree execution chain. */

import { collectEvidence, type DiffEvidenceSnapshot, type EvidenceStore, type WorktreeEvidenceStatus } from './evidence.ts'
import { appendAudit, createTaskRunReference, type Project, type RuntimeProviderEvidence, type TaskRunReference, type TaskRunResultStatus } from './runs.ts'
import type { ExecutionRecord, TaskRecord } from './tasks.ts'

export interface ProviderCapabilitySnapshot {
  providerId?: string
  upstreamVersion?: string
  supportStatus?: 'known-good' | 'supported' | 'candidate' | 'blocked' | 'degraded' | 'unsupported'
  capabilities: ReadonlyArray<{ id: string; status: 'available' | 'unsupported' | 'degraded' }>
}

export interface ProviderSessionEvent {
  type: 'started' | 'completed' | 'failed' | 'cancelled' | 'error' | string
  resultStatus?: 'succeeded' | 'failed' | 'cancelled'
  error?: string
}

export interface ProviderSession {
  sessionId: string
  workspaceId: string
  cwd: string
  prompt(content: string): Promise<{ ok: true } | { ok: false; error: unknown }>
  subscribe(listener: (event: ProviderSessionEvent) => void): () => void
  cancel?(): Promise<void>
}

export interface RuntimeProviderBoundary {
  probe(): ProviderCapabilitySnapshot
  registerWorkspace(spec: { workspaceId: string; worktreeId: string; cwd: string }): Promise<{ workspaceId?: string } | string>
  createSession(spec: { workspaceId: string; runId: string; worktreeId: string; cwd: string }): Promise<ProviderSession>
  getSession?(sessionId: string): Promise<ProviderSession | undefined>
}

export interface WorktreeRef {
  worktreeId: string
  path: string
  baseRevision: string
  branch: string
}

export interface WorktreeExecutionFace {
  createWorktree(input: { workspaceId: string; taskId: string; runId: string; baseRef?: string }): Promise<{ ok: true; value: WorktreeRef } | { ok: false; error: { code: string; message: string } }>
  getWorktreeStatus(worktreeId: string): Promise<{ ok: true; value: { clean: boolean; dirty: boolean; head: string; baseRevision: string } } | { ok: false; error: { code: string; message: string } }>
  diffWorktree(worktreeId: string, options?: { maxPreviewBytes?: number }): Promise<{ ok: true; value: DiffEvidenceSnapshot } | { ok: false; error: { code: string; message: string } }>
  listWorktrees(workspaceId: string): Promise<{ ok: true; value: WorktreeRef[] } | { ok: false; error: { code: string; message: string } }>
}

export interface WorktreeExecutionInput {
  task: Pick<TaskRecord, 'id' | 'title' | 'prompt'>
  project?: Project
  runId: string
  startedAt?: number
  existingRun?: TaskRunReference
}

export interface WorktreeExecutionResult {
  mode: 'git-worktree' | 'shared-workspace-fallback' | 'blocked'
  run: TaskRunReference
  evidenceId?: string
  fallbackReason?: string
  capabilityEvidence: RuntimeProviderEvidence
  sessionId?: string
  resultStatus?: TaskRunResultStatus
}

export interface WorktreeExecutionObserver {
  /** Fired after the provider Session is subscribed and before prompting it. */
  onStarted?(run: TaskRunReference): void
}

interface ActiveRun {
  input: WorktreeExecutionInput
  session: ProviderSession
  worktree: WorktreeRef
  evidence?: WorktreeExecutionResult
}

function capabilityEvidence(snapshot: ProviderCapabilitySnapshot): RuntimeProviderEvidence {
  const capability = (id: string): 'available' | 'unsupported' | 'failed' => snapshot.capabilities.find(item => item.id === id)?.status === 'available' ? 'available' : 'unsupported'
  return {
    ...(snapshot.providerId === undefined ? {} : { providerId: snapshot.providerId }),
    ...(snapshot.upstreamVersion === undefined ? {} : { upstreamVersion: snapshot.upstreamVersion }),
    ...(snapshot.supportStatus === undefined ? {} : { supportStatus: snapshot.supportStatus }),
    capabilities: snapshot.capabilities.map(item => ({ id: item.id, status: item.status })),
    registerWorkspace: capability('workspace.register'),
    createSession: capability('session.create'),
    sessionObserve: capability('session.observe'),
  }
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function normalizeCwd(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/u, '')
  return /^[a-z]:\//iu.test(normalized) ? normalized.toLowerCase() : normalized
}

interface WorktreeInspection {
  status?: WorktreeEvidenceStatus
  diff?: DiffEvidenceSnapshot
  failures: string[]
}

function withProviderNotes(evidence: RuntimeProviderEvidence, ...notes: Array<string | undefined>): RuntimeProviderEvidence {
  const combined = [evidence.note, ...notes].filter((note): note is string => note !== undefined && note.length > 0)
  return {
    ...evidence,
    ...(combined.length === 0 ? {} : { note: combined.join('; ').slice(0, 500) }),
  }
}

async function inspectWorktree(worktrees: WorktreeExecutionFace, worktreeId: string): Promise<WorktreeInspection> {
  const [statusResult, diffResult] = await Promise.allSettled([
    worktrees.getWorktreeStatus(worktreeId),
    worktrees.diffWorktree(worktreeId, { maxPreviewBytes: 64 * 1024 }),
  ])
  const failures: string[] = []
  let status: WorktreeEvidenceStatus | undefined
  let diff: DiffEvidenceSnapshot | undefined
  if (statusResult.status === 'fulfilled') {
    if (statusResult.value.ok) {
      status = {
        clean: statusResult.value.value.clean,
        dirty: statusResult.value.value.dirty,
        head: statusResult.value.value.head,
        baseRevision: statusResult.value.value.baseRevision,
      }
    } else {
      failures.push(`Worktree status unavailable: ${statusResult.value.error.message}`)
    }
  } else {
    failures.push(`Worktree status failed: ${errorText(statusResult.reason)}`)
  }
  if (diffResult.status === 'fulfilled') {
    if (diffResult.value.ok) diff = diffResult.value.value
    else failures.push(`Worktree diff unavailable: ${diffResult.value.error.message}`)
  } else {
    failures.push(`Worktree diff failed: ${errorText(diffResult.reason)}`)
  }
  return {
    ...(status === undefined ? {} : { status }),
    ...(diff === undefined ? {} : { diff }),
    failures,
  }
}

/**
 * Worktree executor. A missing capability returns a shared-workspace fallback
 * result; it never creates a fake isolated run. Worktree cleanup is left to
 * review, including after cancellation.
 */
export class WorktreeExecutionCoordinator {
  private readonly active = new Map<string, ActiveRun>()
  private readonly pendingCancels = new Set<string>()
  /** Bounded insertion-ordered memory of recently settled run ids. */
  private readonly settledRuns = new Map<string, true>()
  private readonly now: () => number

  constructor(
    private readonly provider: RuntimeProviderBoundary,
    private readonly worktrees: WorktreeExecutionFace,
    private readonly evidenceStore: EvidenceStore,
    now: () => number = Date.now,
  ) {
    this.now = now
  }

  async run(input: WorktreeExecutionInput, observer?: WorktreeExecutionObserver): Promise<WorktreeExecutionResult> {
    let snapshot: ProviderCapabilitySnapshot
    try {
      snapshot = this.provider.probe()
    } catch (error) {
      const reason = `Runtime Provider capability probe failed: ${errorText(error)}`
      const capability: RuntimeProviderEvidence = {
        capabilities: [],
        registerWorkspace: 'failed',
        createSession: 'failed',
        sessionObserve: 'failed',
        note: reason.slice(0, 500),
      }
      return {
        mode: 'shared-workspace-fallback',
        run: createTaskRunReference({
          runId: input.runId,
          workspaceId: input.project?.workspaceId ?? 'unknown',
          startedAt: input.startedAt ?? this.now(),
          resultStatus: 'failed',
          runtimeProviderEvidence: capability,
        }),
        fallbackReason: reason,
        capabilityEvidence: capability,
      }
    }
    const capability = capabilityEvidence(snapshot)
    const fallback = (reason: string): WorktreeExecutionResult => ({
      mode: 'shared-workspace-fallback',
      run: createTaskRunReference({ runId: input.runId, workspaceId: input.project?.workspaceId ?? 'unknown', startedAt: input.startedAt ?? this.now(), resultStatus: 'failed', runtimeProviderEvidence: { ...capability, note: reason } }),
      fallbackReason: reason,
      capabilityEvidence: { ...capability, note: reason },
    })
    if (input.project === undefined) return fallback('project is not configured')
    const workspaceCapability = snapshot.capabilities.find(item => item.id === 'workspace.register')
    const sessionCapability = snapshot.capabilities.find(item => item.id === 'session.create')
    const observeCapability = snapshot.capabilities.find(item => item.id === 'session.observe')
    if (workspaceCapability?.status !== 'available' || sessionCapability?.status !== 'available' || observeCapability?.status !== 'available') {
      return fallback('Runtime Provider lacks workspace.register, session.create, or session.observe')
    }

    let worktree: WorktreeRef | undefined
    if (input.existingRun?.worktreeId !== undefined) {
      try {
        const status = await this.worktrees.getWorktreeStatus(input.existingRun.worktreeId)
        if (!status.ok) return this.cancelMissingRecovery(input.existingRun, input.project, `Existing Worktree status failed: ${status.error.message}`)
        const listed = await this.worktrees.listWorktrees(input.project.workspaceId)
        if (!listed.ok) return this.cancelMissingRecovery(input.existingRun, input.project, `Existing Worktree lookup failed: ${listed.error.message}`)
        worktree = listed.value.find(item => item.worktreeId === input.existingRun?.worktreeId)
        if (worktree === undefined) {
          return this.cancelMissingRecovery(input.existingRun, input.project, 'Existing Worktree is no longer registered')
        }
      } catch (error) {
        return this.cancelMissingRecovery(input.existingRun, input.project, `Existing Worktree lookup failed: ${errorText(error)}`)
      }
    }
    if (worktree === undefined) {
      let created: Awaited<ReturnType<WorktreeExecutionFace['createWorktree']>>
      try {
        created = await this.worktrees.createWorktree({ workspaceId: input.project.workspaceId, taskId: input.task.id, runId: input.runId })
      } catch (error) {
        return fallback(`Worktree creation failed: ${errorText(error)}`)
      }
      if (!created.ok) return fallback(`Worktree creation blocked: ${created.error.message}`)
      worktree = created.value
    }

    let registered: { workspaceId: string }
    try {
      const result = await this.provider.registerWorkspace({ workspaceId: input.project.workspaceId, worktreeId: worktree.worktreeId, cwd: worktree.path })
      registered = typeof result === 'string' ? { workspaceId: result } : { workspaceId: result.workspaceId ?? input.project.workspaceId }
    } catch (error) {
      return this.blockedAfterWorktree(input, worktree, { ...capability, registerWorkspace: 'failed' }, `Runtime Provider workspace registration failed: ${errorText(error)}`)
    }
    let session: ProviderSession
    try {
      session = await this.provider.createSession({ workspaceId: registered.workspaceId, runId: input.runId, worktreeId: worktree.worktreeId, cwd: worktree.path })
    } catch (error) {
      return this.blockedAfterWorktree(input, worktree, { ...capability, createSession: 'failed' }, `Runtime Provider session creation failed: ${errorText(error)}`)
    }
    const cwdVerified = normalizeCwd(session.cwd) === normalizeCwd(worktree.path)
    const evidenceWithCwd = { ...capability, sessionCwdVerified: cwdVerified }
    if (!cwdVerified) {
      return this.blockedAfterWorktree(input, worktree, evidenceWithCwd, 'Provider session CWD does not equal Worktree path', session.sessionId)
    }

    const run = createTaskRunReference({
      runId: input.runId,
      workspaceId: input.project.workspaceId,
      sessionId: session.sessionId,
      worktreeId: worktree.worktreeId,
      baseRevision: worktree.baseRevision,
      startedAt: input.startedAt ?? this.now(),
      runtimeProviderEvidence: evidenceWithCwd,
    })
    const active: ActiveRun = { input, session, worktree }
    this.active.set(input.runId, active)
    let finalStatus: TaskRunResultStatus = 'awaiting-review'
    let finalError: string | undefined
    let unsubscribe = (): void => {}
    let finishSession: (event: ProviderSessionEvent) => void = () => {}
    const settled = new Promise<void>((resolve) => {
      let done = false
      const finish = (event: ProviderSessionEvent): void => {
        if (done) return
        if (!['completed', 'failed', 'cancelled', 'error'].includes(event.type)) return
        done = true
        if (event.resultStatus === 'failed' || event.type === 'failed' || event.type === 'error') finalStatus = 'failed'
        else if (event.resultStatus === 'cancelled' || event.type === 'cancelled') finalStatus = 'cancelled'
        finalError = event.error
        resolve()
      }
      finishSession = finish
      try {
        unsubscribe = session.subscribe(finish)
        observer?.onStarted?.(run)
        void session.prompt(input.task.prompt).then((accepted) => {
          if (!accepted.ok) finish({ type: 'failed', resultStatus: 'failed', error: errorText(accepted.error) })
        }).catch(error => finish({ type: 'failed', resultStatus: 'failed', error: errorText(error) }))
      } catch (error) {
        finish({ type: 'failed', resultStatus: 'failed', error: `Provider Session observation failed: ${errorText(error)}` })
      }
      // A provider is allowed to emit completion synchronously from prompt;
      // the listener is installed before prompt. No event payload is copied
      // into Evidence.
    })
    if (this.pendingCancels.delete(input.runId)) {
      if (typeof session.cancel === 'function') {
        void session.cancel().catch(error => finishSession({ type: 'failed', resultStatus: 'failed', error: `Provider Session cancellation failed: ${errorText(error)}` }))
      } else {
        finishSession({ type: 'failed', resultStatus: 'failed', error: 'Provider Session does not support cancellation' })
      }
    }
    await settled
    unsubscribe()
    return this.finalizeRun(input, worktree, session, run, evidenceWithCwd, finalStatus, finalError)
  }

  /**
   * Resume observation of a persisted Worktree Session after an app/page
   * restart. This path never creates a Worktree, registers a workspace,
   * creates a Session, or prompts again.
   */
  async reconcileTask(
    task: TaskRecord,
    execution: ExecutionRecord,
    project?: Project,
  ): Promise<WorktreeExecutionResult | undefined> {
    const runId = execution.runId ?? execution.id
    const run = task.runs?.find(candidate => candidate.runId === runId)
    if (run === undefined || run.resultStatus !== 'running' || run.worktreeId === undefined) return undefined
    if (this.active.has(runId)) return undefined

    const workspaceId = project?.workspaceId ?? run.workspaceId
    let listed: Awaited<ReturnType<WorktreeExecutionFace['listWorktrees']>>
    try {
      listed = await this.worktrees.listWorktrees(workspaceId)
    } catch (error) {
      return this.cancelMissingRecovery(run, project, `Worktree registry lookup failed: ${errorText(error)}`)
    }
    const worktree = listed.ok ? listed.value.find(candidate => candidate.worktreeId === run.worktreeId) : undefined
    if (worktree === undefined) {
      return this.cancelMissingRecovery(run, project, listed.ok ? 'Registered Worktree is no longer available' : listed.error.message)
    }

    let session: ProviderSession | undefined
    try {
      session = this.provider.getSession === undefined || run.sessionId === undefined
        ? undefined
        : await this.provider.getSession(run.sessionId)
    } catch (error) {
      return this.cancelMissingRecovery(run, project, `Provider Session lookup failed: ${errorText(error)}`)
    }
    if (session === undefined) return this.cancelMissingRecovery(run, project, 'Provider session is no longer available')
    if (run.sessionId !== undefined && session.sessionId !== run.sessionId) {
      return this.cancelMissingRecovery(run, project, 'Provider returned a different Session during recovery')
    }

    let snapshot: ProviderCapabilitySnapshot
    try {
      snapshot = this.provider.probe()
    } catch (error) {
      return this.blockedAfterWorktree(
        { task, project, runId, startedAt: run.startedAt, existingRun: run },
        worktree,
        run.runtimeProviderEvidence,
        `Runtime Provider capability probe failed during recovery: ${errorText(error)}`,
        session.sessionId,
      )
    }
    const providerEvidence: RuntimeProviderEvidence = {
      ...run.runtimeProviderEvidence,
      ...capabilityEvidence(snapshot),
      sessionCwdVerified: normalizeCwd(session.cwd) === normalizeCwd(worktree.path),
    }
    const input: WorktreeExecutionInput = { task, project, runId, startedAt: run.startedAt, existingRun: run }
    if (providerEvidence.sessionCwdVerified !== true) {
      return this.blockedAfterWorktree(input, worktree, providerEvidence, 'Recovered Provider session CWD does not equal Worktree path', session.sessionId)
    }

    this.active.set(runId, { input, session, worktree })
    let finalStatus: TaskRunResultStatus = 'awaiting-review'
    let finalError: string | undefined
    let unsubscribe = (): void => {}
    try {
      await new Promise<void>((resolve, reject) => {
        let done = false
        const finish = (event: ProviderSessionEvent): void => {
          if (done || !['completed', 'failed', 'cancelled', 'error'].includes(event.type)) return
          done = true
          if (event.resultStatus === 'failed' || event.type === 'failed' || event.type === 'error') finalStatus = 'failed'
          else if (event.resultStatus === 'cancelled' || event.type === 'cancelled') finalStatus = 'cancelled'
          finalError = event.error
          resolve()
        }
        try {
          unsubscribe = session.subscribe(finish)
        } catch (error) {
          reject(error)
        }
      })
    } catch (error) {
      return this.cancelMissingRecovery(run, project, `Provider Session observation failed during recovery: ${errorText(error)}`)
    }
    unsubscribe()
    return this.finalizeRun(input, worktree, session, run, providerEvidence, finalStatus, finalError)
  }

  private async finalizeRun(
    input: WorktreeExecutionInput,
    worktree: WorktreeRef,
    session: ProviderSession,
    run: TaskRunReference,
    providerEvidence: RuntimeProviderEvidence,
    finalStatus: TaskRunResultStatus,
    finalError?: string,
  ): Promise<WorktreeExecutionResult> {
    const finishedAt = this.now()
    const inspection = await inspectWorktree(this.worktrees, worktree.worktreeId)
    const runtimeProviderEvidence = withProviderNotes(providerEvidence, finalError, ...inspection.failures)
    const evidence = collectEvidence({
      evidenceId: `ev-${input.runId}`,
      runId: input.runId,
      sessionId: session.sessionId,
      ...(input.project?.id === undefined ? {} : { projectId: input.project.id }),
      workspaceId: input.project?.workspaceId ?? run.workspaceId,
      worktreeId: worktree.worktreeId,
      startedAt: input.startedAt ?? finishedAt,
      finishedAt,
      resultStatus: finalStatus,
      status: inspection.status,
      diff: inspection.diff,
      runtimeProviderEvidence,
    })
    await this.evidenceStore.put(evidence)
    const completedRun: TaskRunReference = {
      ...run,
      finishedAt,
      finalRevision: evidence.finalRevision,
      resultStatus: finalStatus,
      evidenceId: evidence.evidenceId,
      runtimeProviderEvidence,
    }
    const response: WorktreeExecutionResult = { mode: 'git-worktree', run: completedRun, evidenceId: evidence.evidenceId, capabilityEvidence: runtimeProviderEvidence, sessionId: session.sessionId, resultStatus: finalStatus }
    const active = this.active.get(input.runId)
    if (active !== undefined) active.evidence = response
    this.active.delete(input.runId)
    this.markSettled(input.runId)
    return response
  }

  /** Adapter face consumed by BoardController; it emits only compact events. */
  async runTask(
    task: TaskRecord,
    execution: ExecutionRecord,
    project: Project | undefined,
    onEvent: (event: { kind: 'started'; taskId: string; executionId: string; sessionId: string; workspaceId?: string } | { kind: 'settled'; taskId: string; executionId: string; outcome: 'succeeded' | 'failed' | 'cancelled'; error?: string }) => void,
  ): Promise<WorktreeExecutionResult> {
    const result = await this.run({
      task,
      project,
      runId: execution.runId ?? execution.id,
      startedAt: execution.startedAt,
      existingRun: task.runs?.find(run => run.runId === (execution.runId ?? execution.id)),
    }, {
      onStarted: run => {
        if (run.sessionId === undefined) return
        onEvent({ kind: 'started', taskId: task.id, executionId: execution.id, sessionId: run.sessionId, workspaceId: run.workspaceId })
      },
    })
    if (result.mode === 'git-worktree' && result.sessionId !== undefined) {
      const outcome = result.resultStatus === 'cancelled' ? 'cancelled' : result.resultStatus === 'failed' ? 'failed' : 'succeeded'
      onEvent({ kind: 'settled', taskId: task.id, executionId: execution.id, outcome })
    }
    return result
  }

  async cancel(runId: string): Promise<boolean> {
    const active = this.active.get(runId)
    if (active === undefined) {
      if (this.settledRuns.has(runId)) return false
      // The run may still be starting (Worktree/Session setup happens before
      // it registers as active); queue the cancellation for that handoff.
      this.pendingCancels.add(runId)
      return true
    }
    if (typeof active.session.cancel !== 'function') return false
    await active.session.cancel()
    // Cancellation deliberately does not call removeWorktree; review owns it.
    return true
  }

  /**
   * Record a settled run: drop any queued cancellation that arrived too late
   * (it must never cancel a later retry of the same run id) and remember the
   * id in a bounded window so cancel() can answer false honestly.
   */
  private markSettled(runId: string): void {
    this.pendingCancels.delete(runId)
    this.settledRuns.set(runId, true)
    if (this.settledRuns.size > 512) {
      const oldest = this.settledRuns.keys().next().value
      if (oldest !== undefined) this.settledRuns.delete(oldest)
    }
  }

  /** Persist a failed Evidence record whenever isolation already owns a Worktree. */
  private async blockedAfterWorktree(
    input: WorktreeExecutionInput,
    worktree: WorktreeRef,
    capability: RuntimeProviderEvidence,
    reason: string,
    sessionId?: string,
  ): Promise<WorktreeExecutionResult> {
    const finishedAt = this.now()
    const inspection = await inspectWorktree(this.worktrees, worktree.worktreeId)
    const providerEvidence = withProviderNotes(capability, reason, ...inspection.failures)
    const evidence = appendAudit(collectEvidence({
      evidenceId: `ev-${input.runId}`,
      runId: input.runId,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(input.project?.id === undefined ? {} : { projectId: input.project.id }),
      workspaceId: input.project?.workspaceId ?? 'unknown',
      worktreeId: worktree.worktreeId,
      startedAt: input.startedAt ?? finishedAt,
      finishedAt,
      resultStatus: 'failed',
      status: inspection.status,
      diff: inspection.diff,
      runtimeProviderEvidence: providerEvidence,
    }), { action: 'evidence', at: finishedAt, status: 'failed', summary: reason })
    await this.evidenceStore.put(evidence)
    const run: TaskRunReference = {
      ...createTaskRunReference({
        runId: input.runId,
        workspaceId: input.project?.workspaceId ?? 'unknown',
        ...(sessionId === undefined ? {} : { sessionId }),
        worktreeId: worktree.worktreeId,
        baseRevision: worktree.baseRevision,
        startedAt: input.startedAt ?? finishedAt,
        resultStatus: 'failed',
        runtimeProviderEvidence: providerEvidence,
      }),
      finishedAt,
      ...(evidence.finalRevision === undefined ? {} : { finalRevision: evidence.finalRevision }),
      evidenceId: evidence.evidenceId,
      fallbackReason: reason.slice(0, 500),
    }
    this.markSettled(input.runId)
    return { mode: 'blocked', run, evidenceId: evidence.evidenceId, fallbackReason: reason, capabilityEvidence: providerEvidence, ...(sessionId === undefined ? {} : { sessionId }), resultStatus: 'failed' }
  }

  /** Close an unrecoverable persisted run while retaining its Worktree. */
  private async cancelMissingRecovery(
    run: TaskRunReference,
    project: Project | undefined,
    reason: string,
  ): Promise<WorktreeExecutionResult> {
    const finishedAt = this.now()
    const inspection: WorktreeInspection = run.worktreeId === undefined
      ? { failures: [] }
      : await inspectWorktree(this.worktrees, run.worktreeId)
    const providerEvidence = withProviderNotes(run.runtimeProviderEvidence, reason, ...inspection.failures)
    const evidence = appendAudit(collectEvidence({
      evidenceId: run.evidenceId ?? `ev-${run.runId}`,
      runId: run.runId,
      ...(run.sessionId === undefined ? {} : { sessionId: run.sessionId }),
      ...(project?.id === undefined ? {} : { projectId: project.id }),
      workspaceId: run.workspaceId,
      ...(run.worktreeId === undefined ? {} : { worktreeId: run.worktreeId }),
      startedAt: run.startedAt,
      finishedAt,
      resultStatus: 'cancelled',
      status: inspection.status,
      diff: inspection.diff,
      runtimeProviderEvidence: providerEvidence,
    }), { action: 'reconcile', at: finishedAt, status: 'blocked', summary: `${reason}; Worktree retained for review` })
    await this.evidenceStore.put(evidence)
    const completedRun: TaskRunReference = {
      ...run,
      resultStatus: 'cancelled',
      finishedAt,
      evidenceId: evidence.evidenceId,
      ...(evidence.finalRevision === undefined ? {} : { finalRevision: evidence.finalRevision }),
      fallbackReason: reason.slice(0, 500),
      runtimeProviderEvidence: providerEvidence,
    }
    this.active.delete(run.runId)
    this.markSettled(run.runId)
    return {
      mode: 'blocked',
      run: completedRun,
      evidenceId: evidence.evidenceId,
      fallbackReason: reason,
      capabilityEvidence: providerEvidence,
      ...(run.sessionId === undefined ? {} : { sessionId: run.sessionId }),
      resultStatus: 'cancelled',
    }
  }

  /** Reconcile persisted running runs without creating duplicate worktrees. */
  async reconcile(runs: readonly TaskRunReference[], projects: ReadonlyMap<string, Project>): Promise<WorktreeExecutionResult[]> {
    const results: WorktreeExecutionResult[] = []
    for (const run of runs) {
      if (run.resultStatus !== 'running' || run.worktreeId === undefined || this.active.has(run.runId)) continue
      const project = run.workspaceId === undefined ? undefined : [...projects.values()].find(candidate => candidate.workspaceId === run.workspaceId)
      if (project === undefined) continue
      let session: ProviderSession | undefined
      try {
        session = this.provider.getSession === undefined || run.sessionId === undefined ? undefined : await this.provider.getSession(run.sessionId)
      } catch (error) {
        results.push(await this.cancelMissingRecovery(run, project, `Provider Session lookup failed: ${errorText(error)}`))
        continue
      }
      if (session === undefined) {
        results.push(await this.cancelMissingRecovery(run, project, 'Provider session is no longer available'))
        continue
      }
      // Reconciliation is deliberately read-only with respect to execution:
      // do not call `run()` here because that would prompt the recovered
      // session again.  The persisted session/worktree pair is enough for the
      // caller to resume observation or surface the run for review.
      results.push({
        mode: 'git-worktree',
        run: { ...run, resultStatus: 'running' },
        capabilityEvidence: run.runtimeProviderEvidence,
        sessionId: session.sessionId,
      })
    }
    return results
  }
}
