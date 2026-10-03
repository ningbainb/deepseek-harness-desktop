/**
 * Desktop-owned Task Board runner for the durable Host scheduler.
 *
 * It stays inside the public DSH Agent/Session/Workspace APIs: a scheduled
 * task can run only in a workspace already registered by DSH, produces a
 * normal durable session, and reports the canonical TaskRun key back to the
 * Task Board.  It deliberately does not manufacture an Electron-side shell
 * job or accept a renderer-supplied path.
 */
import { type AgentRegistry } from '@deepseek-ai/dsh-agent';
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model';
import { type SessionStore } from '@deepseek-ai/dsh-session';
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence';
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query';
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
export interface DesktopScheduledTask {
    prompt: string;
    isolationMode?: 'inherit' | 'shared-workspace' | 'git-worktree';
}
export interface DesktopScheduledProject {
    workspaceId: string;
    defaultIsolation: 'shared-workspace' | 'git-worktree';
}
export interface DesktopScheduledRunReference {
    runId: string;
    workspaceId: string;
    startedAt: number;
    resultStatus: string;
    runtimeProviderEvidence?: Record<string, unknown>;
    sessionId?: string;
    finishedAt?: number;
    fallbackReason?: string;
}
/** Structural counterpart of Task Board's serialized Host ownership boundary. */
export interface DesktopScheduledTaskOwnership {
    requiresProject: boolean;
    requiresPrompt: boolean;
    supportedIsolationModes: readonly ('shared-workspace' | 'git-worktree')[];
}
/** Structural counterpart of dsh-task-board's HostScheduledRunInput. */
export interface DesktopScheduledRunInput {
    task: DesktopScheduledTask;
    project?: DesktopScheduledProject;
    executionKey: string;
    run: DesktopScheduledRunReference;
}
/** Structural counterpart of Task Board's HostScheduledTaskEligibilityInput. */
export interface DesktopScheduledTaskEligibilityInput {
    task: DesktopScheduledTask;
    project?: DesktopScheduledProject;
}
export interface DesktopScheduledRunResult {
    kind: 'settled';
    outcome: 'succeeded' | 'failed' | 'cancelled';
    error?: string;
    sessionId?: string;
    workspaceId?: string;
    run?: DesktopScheduledRunReference;
}
export interface DesktopTaskBoardHostScheduleRunner {
    readonly provider: 'runtime-provider-host-job';
    readonly evidence: Record<string, unknown>;
    readonly taskOwnership: DesktopScheduledTaskOwnership;
    canOwnTask(input: DesktopScheduledTaskEligibilityInput): boolean | Promise<boolean>;
    run(input: DesktopScheduledRunInput): Promise<DesktopScheduledRunResult>;
}
export interface DesktopTaskBoardHostScheduleRunnerOptions {
    agents: AgentRegistry;
    defaultModel: AgentDefaultModelConfig;
    sessions: SessionStore;
    workspaceRegistry: WorkspaceRegistry;
    /**
     * Present in the Desktop runtime. Listing before creation lets a narrow
     * crash-recovery retry resume the durable session for the same scheduler
     * slot rather than creating a second agent transcript.
     */
    sessionPersistence?: SessionPersistence;
    sessionQuery: SessionQueryEngine;
    now?: () => number;
    createSessionId?: (executionKey: string) => string;
}
/**
 * Desktop's runner owns only project-backed shared-workspace tasks. The
 * Task Board publishes this shape to browsers and combines it with the live
 * preflight below before a Host lease or TaskRun is created.
 */
export declare const DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP: Readonly<{
    requiresProject: true;
    requiresPrompt: true;
    supportedIsolationModes: readonly ["shared-workspace"];
}>;
/**
 * Build a real Host runner. Callers should expose it only after the user has
 * explicitly enabled Desktop background automation; the Task Board otherwise
 * keeps its browser scheduler active.
 */
export declare function createDesktopTaskBoardHostScheduleRunner(options: DesktopTaskBoardHostScheduleRunnerOptions): DesktopTaskBoardHostScheduleRunner;
