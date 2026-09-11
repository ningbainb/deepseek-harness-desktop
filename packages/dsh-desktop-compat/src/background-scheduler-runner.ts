/**
 * Desktop-owned Task Board runner for the durable Host scheduler.
 *
 * It stays inside the public DSH Agent/Session/Workspace APIs: a scheduled
 * task can run only in a workspace already registered by DSH, produces a
 * normal durable session, and reports the canonical TaskRun key back to the
 * Task Board.  It deliberately does not manufacture an Electron-side shell
 * job or accept a renderer-supplied path.
 */

import { createHash } from 'node:crypto'
import { installModelSelection, type AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent, type SessionStore, type TurnEndReason } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { WorkspaceId, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

export interface DesktopScheduledTask {
  prompt: string
  isolationMode?: 'inherit' | 'shared-workspace' | 'git-worktree'
}

export interface DesktopScheduledProject {
  workspaceId: string
  defaultIsolation: 'shared-workspace' | 'git-worktree'
}

export interface DesktopScheduledRunReference {
  runId: string
  workspaceId: string
  startedAt: number
  resultStatus: string
  runtimeProviderEvidence?: Record<string, unknown>
  sessionId?: string
  finishedAt?: number
  fallbackReason?: string
}

/** Structural counterpart of Task Board's serialized Host ownership boundary. */
export interface DesktopScheduledTaskOwnership {
  requiresProject: boolean
  requiresPrompt: boolean
  supportedIsolationModes: readonly ('shared-workspace' | 'git-worktree')[]
}

/** Structural counterpart of dsh-task-board's HostScheduledRunInput. */
export interface DesktopScheduledRunInput {
  task: DesktopScheduledTask
  project?: DesktopScheduledProject
  executionKey: string
  run: DesktopScheduledRunReference
}

/** Structural counterpart of Task Board's HostScheduledTaskEligibilityInput. */
export interface DesktopScheduledTaskEligibilityInput {
  task: DesktopScheduledTask
  project?: DesktopScheduledProject
}

export interface DesktopScheduledRunResult {
  kind: 'settled'
  outcome: 'succeeded' | 'failed' | 'cancelled'
  error?: string
  sessionId?: string
  workspaceId?: string
  run?: DesktopScheduledRunReference
}

export interface DesktopTaskBoardHostScheduleRunner {
  readonly provider: 'runtime-provider-host-job'
  readonly evidence: Record<string, unknown>
  readonly taskOwnership: DesktopScheduledTaskOwnership
  canOwnTask(input: DesktopScheduledTaskEligibilityInput): boolean | Promise<boolean>
  run(input: DesktopScheduledRunInput): Promise<DesktopScheduledRunResult>
}

export interface DesktopTaskBoardHostScheduleRunnerOptions {
  agents: AgentRegistry
  defaultModel: AgentDefaultModelConfig
  sessions: SessionStore
  workspaceRegistry: WorkspaceRegistry
  /**
   * Present in the Desktop runtime. Listing before creation lets a narrow
   * crash-recovery retry resume the durable session for the same scheduler
   * slot rather than creating a second agent transcript.
   */
  sessionPersistence?: SessionPersistence
  now?: () => number
  createSessionId?: (executionKey: string) => string
}

const PROVIDER_EVIDENCE = Object.freeze({
  providerId: 'dsh-cli-provider-v1',
  supportStatus: 'known-good',
  capabilities: [
    { id: 'host-schedule', status: 'available' },
    { id: 'workspace.register', status: 'available' },
    { id: 'session.create', status: 'available' },
    { id: 'session.observe', status: 'available' },
  ],
  registerWorkspace: 'available',
  createSession: 'available',
  sessionObserve: 'available',
  sessionCwdVerified: true,
  note: 'Desktop background scheduler runs through a registered DSH workspace and durable session.',
})

/**
 * Desktop's runner owns only project-backed shared-workspace tasks. The
 * Task Board publishes this shape to browsers and combines it with the live
 * preflight below before a Host lease or TaskRun is created.
 */
export const DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP = Object.freeze({
  requiresProject: true,
  requiresPrompt: true,
  supportedIsolationModes: ['shared-workspace'] as const,
} satisfies DesktopScheduledTaskOwnership)

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[\r\n\t]+/gu, ' ').trim().slice(0, 500) || 'scheduled task failed'
}

function terminalReason(events: readonly SessionEvent[], firstSequence: number): TurnEndReason | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.seq < firstSequence) continue
    if (event.type === 'turn/end') return event.data.reason
  }
  return undefined
}

function terminalOutcome(reason: TurnEndReason | undefined): DesktopScheduledRunResult['outcome'] {
  if (reason?.kind === 'completed') return 'succeeded'
  if (reason?.kind === 'aborted') return 'cancelled'
  return 'failed'
}

function hasScheduledPrompt(events: readonly SessionEvent[], prompt: string): boolean {
  return events.some((event) => {
    if (event.type !== 'user/message') return false
    const message = event.data
    if (message === null || typeof message !== 'object' || Array.isArray(message)) return false
    const source = message.source
    const content = message.content
    if (
      source === null || typeof source !== 'object' || Array.isArray(source)
      || source.kind !== 'user'
      || !Array.isArray(content)
    ) return false
    return content.some((block) => (
      block !== null
      && typeof block === 'object'
      && !Array.isArray(block)
      && block.type === 'text'
      && block.text === prompt
    ))
  })
}

function failure(input: DesktopScheduledRunInput, error: string): DesktopScheduledRunResult {
  return {
    kind: 'settled',
    outcome: 'failed',
    error,
    workspaceId: input.project?.workspaceId ?? input.run.workspaceId,
  }
}

function completeRun(
  input: DesktopScheduledRunInput,
  sessionId: string,
  workspaceId: string,
  outcome: DesktopScheduledRunResult['outcome'],
  now: () => number,
  error?: string,
): DesktopScheduledRunReference {
  return {
    ...input.run,
    // The scheduler's slot key is the durable idempotency boundary. Never
    // replace it with the transient DSH session id.
    runId: input.executionKey,
    sessionId,
    workspaceId,
    finishedAt: now(),
    resultStatus: outcome === 'succeeded' ? 'awaiting-review' : outcome,
    runtimeProviderEvidence: PROVIDER_EVIDENCE,
    ...(error === undefined ? {} : { fallbackReason: error }),
  }
}

function sessionIdForExecutionKey(
  executionKey: string,
  createSessionId: (executionKey: string) => string,
): SessionId {
  const value = createSessionId(executionKey).trim()
  if (value === '') throw new Error('scheduled task session id is empty')
  return SessionId(value)
}

function defaultSessionId(executionKey: string): string {
  // Task Board uses executionKey as the durable idempotency boundary. Hash it
  // into a filesystem-safe SessionId so the exact same crash-recovery slot
  // resumes one transcript without leaking task text into a path or log name.
  const digest = createHash('sha256').update(executionKey).digest('hex')
  return `task-board-${digest}`
}

/**
 * Checks every Desktop-only condition before the Host claims a schedule slot.
 * A false result is intentionally not an execution failure: the task remains
 * for the browser scheduler, which may have a different viable execution
 * path. Keep this in lockstep with the early guards in `run` below.
 */
async function canDesktopRunnerOwnTask(
  input: DesktopScheduledTaskEligibilityInput,
  options: DesktopTaskBoardHostScheduleRunnerOptions,
): Promise<boolean> {
  const project = input.project
  if (project === undefined || input.task.prompt.trim() === '') return false
  const isolation = input.task.isolationMode === 'inherit' || input.task.isolationMode === undefined
    ? project.defaultIsolation
    : input.task.isolationMode
  if (isolation !== 'shared-workspace') return false
  const workspace = options.workspaceRegistry.get(project.workspaceId as WorkspaceId)
  if (workspace === undefined || await workspace.status() !== 'ok') return false
  const selection = options.defaultModel.currentSelection()
  return selection.provider.trim() !== '' && selection.model.trim() !== ''
}

/**
 * Build a real Host runner. Callers should expose it only after the user has
 * explicitly enabled Desktop background automation; the Task Board otherwise
 * keeps its browser scheduler active.
 */
export function createDesktopTaskBoardHostScheduleRunner(
  options: DesktopTaskBoardHostScheduleRunnerOptions,
): DesktopTaskBoardHostScheduleRunner {
  const now = options.now ?? Date.now
  const createSessionId = options.createSessionId ?? defaultSessionId

  return Object.freeze({
    provider: 'runtime-provider-host-job' as const,
    evidence: PROVIDER_EVIDENCE,
    taskOwnership: DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP,
    canOwnTask: (input: DesktopScheduledTaskEligibilityInput) => canDesktopRunnerOwnTask(input, options),
    async run(input: DesktopScheduledRunInput): Promise<DesktopScheduledRunResult> {
      const project = input.project
      if (project === undefined) {
        return failure(input, 'scheduled task has no registered Desktop project')
      }
      const isolation = input.task.isolationMode === 'inherit' || input.task.isolationMode === undefined
        ? project.defaultIsolation
        : input.task.isolationMode
      if (isolation === 'git-worktree') {
        return failure(input, 'background scheduling requires a Runtime Provider Worktree adapter; this task requests git-worktree isolation')
      }
      const prompt = input.task.prompt.trim()
      if (prompt === '') return failure(input, 'scheduled task prompt is empty')

      const workspace = options.workspaceRegistry.get(project.workspaceId as WorkspaceId)
      if (workspace === undefined) return failure(input, 'scheduled task workspace is no longer registered')
      if (await workspace.status() !== 'ok') return failure(input, 'scheduled task workspace directory is unavailable')

      const selection = options.defaultModel.currentSelection()
      if (selection.provider.trim() === '' || selection.model.trim() === '') {
        return failure(input, 'no default DSH model is configured for background automation')
      }

      let handle: Awaited<ReturnType<AgentRegistry['create']>> | undefined
      try {
        const sessionId = sessionIdForExecutionKey(input.executionKey, createSessionId)
        const agentOptions = {
          provider: selection.provider,
          model: selection.model,
        }
        const setup = (agentCtx: Parameters<NonNullable<Parameters<AgentRegistry['create']>[0]['setup']>>[0]) => {
          // Agent setup is composition-only. The Agent scope owns the
          // selection listeners and unwinds them with the handle lifecycle.
          installModelSelection(agentCtx, {
            current: selection,
            assembled: undefined,
          })
        }
        const persisted = options.sessionPersistence === undefined
          ? false
          // sessionPersistence can arrive from the runtime's peer graph while
          // SessionId is branded by this package's graph. Compare the durable
          // wire value instead of coupling those private TypeScript brands.
          : (await options.sessionPersistence.list()).some(snapshot => String(snapshot.header.id) === String(sessionId))
        handle = persisted
          ? await options.agents.resume({
              resumeSessionId: sessionId,
              agentOptions,
              setup,
            })
          : await options.agents.create({
              sessionId,
              meta: { cwd: workspace.path },
              agentOptions,
              setup,
            })
        const { agent } = handle
        await agent.whenIdle()
        const firstSequence = agent.session.seq
        // A crash can happen after Agent Loop durably accepted the user
        // message, but before Task Board observed and persisted sessionId.
        // This recovery run owns the same SessionId, so never enqueue the
        // prompt a second time. SessionPersistence cold recovery supplies the
        // terminal boundary if the old process stopped mid-turn.
        const promptAlreadyAccepted = persisted && hasScheduledPrompt(agent.session.snapshotEvents(), prompt)
        if (!promptAlreadyAccepted) {
          agent.followup(createUserMessage({
            content: [{ type: 'text', text: prompt }],
            source: { kind: 'user' },
          }))
          await agent.whenIdle()
        }
        await options.sessions.flush(agent.session)
        const reason = terminalReason(agent.session.snapshotEvents(), promptAlreadyAccepted ? 0 : firstSequence)
        const outcome = terminalOutcome(reason)
        const error = outcome === 'failed'
          ? reason?.kind === 'error'
            ? `${reason.error.code}: ${reason.error.message}`.slice(0, 500)
            : promptAlreadyAccepted
              ? `scheduled session was already accepted before recovery and ended with ${reason?.kind ?? 'no terminal outcome'}`
              : `scheduled turn ended with ${reason?.kind ?? 'no terminal outcome'}`
          : undefined
        return {
          kind: 'settled',
          outcome,
          ...(error === undefined ? {} : { error }),
          sessionId: agent.id,
          workspaceId: project.workspaceId,
          run: completeRun(input, agent.id, project.workspaceId, outcome, now, error),
        }
      } catch (error) {
        const message = boundedError(error)
        const sessionId = handle?.agent.id
        return {
          ...failure(input, message),
          ...(sessionId === undefined
            ? {}
            : {
                sessionId,
                run: completeRun(input, sessionId, project.workspaceId, 'failed', now, message),
              }),
        }
      } finally {
        // Flushing occurs before disposal. The durable transcript is therefore
        // available through DSH's normal session persistence without retaining
        // an idle Agent instance for every cron occurrence.
        await handle?.dispose().catch(() => {})
      }
    },
  })
}
