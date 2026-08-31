import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { createDesktopTaskBoardHostScheduleRunner } from './background-scheduler-runner.ts'
import {
  createQueueRecoveryScheduler,
  normalizeCancellationDecision,
} from './recovery.ts'
import { DesktopSkinStateService } from './skin-state.ts'
import { installToolCallArgumentNormalization } from './tool-call-normalization.ts'
import { installTranscriptBalanceGuard } from './transcript-balance.ts'
import { registerDesktopConversationImportRoute } from './conversation-import-route.ts'
import { registerDesktopWorkspaceFileOpenRoute } from './workspace-file-open-route.ts'

export const name = 'desktop-compat'
// The import route resolves the optional log-backed title service through
// ctx.get(), so a minimal Host composition without sessionTitle can still
// load Desktop Compat. The normal DSH composition provides the service and
// the route persists titles through it.
export const inject = ['llm', 'tools', 'webServer', 'workspaceRegistry', 'sessions']

/** Install Desktop-only compatibility behavior through public DSH hooks. */
export function apply(ctx: Context): void {
  new DesktopSkinStateService(ctx)
  installToolCallArgumentNormalization(ctx)
  installTranscriptBalanceGuard(ctx)
  ctx.effect(
    () => registerDesktopWorkspaceFileOpenRoute(ctx),
    'dsh-desktop-compat: workspace native-open authority',
  )
  ctx.effect(
    () => registerDesktopConversationImportRoute(ctx),
    'dsh-desktop-compat: conversation import authority',
  )

  // Background execution is off by default. Electron passes this exact
  // process environment only after the user chose the persistent
  // minimize-to-tray/background-automation mode, so ordinary DSH Web and
  // Desktop's default quit behavior retain the browser-side scheduler.
  if (process.env.DSH_DESKTOP_BACKGROUND_AUTOMATION === '1') {
    ctx.inject(['agents', 'agentDefaultModel', 'sessions', 'sessionPersistence', 'workspaceRegistry'], (schedulerCtx) => {
      const runner = createDesktopTaskBoardHostScheduleRunner({
        agents: schedulerCtx.agents,
        defaultModel: schedulerCtx.agentDefaultModel,
        sessions: schedulerCtx.sessions,
        sessionPersistence: schedulerCtx.sessionPersistence,
        workspaceRegistry: schedulerCtx.workspaceRegistry,
      })
      return schedulerCtx.provide('taskBoardHostScheduleRunner', runner)
    })
  }

  const scheduleRecovery = createQueueRecoveryScheduler(queueMicrotask, (error) => {
    const detail = error instanceof Error ? error.message : String(error)
    ctx.logger?.warn?.(`dsh-desktop-compat: queued turn recovery failed: ${detail}`)
  })

  ctx.on('agent/status', ({ agent, status }) => {
    scheduleRecovery(agent, status)
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    return normalizeCancellationDecision(exec, result, decision)
  })
}

export {
  FRIENDLY_CANCELLED_MESSAGE,
  createQueueRecoveryScheduler,
  normalizeCancellationDecision,
  recoverQueuedTurns,
} from './recovery.ts'

export {
  DesktopSkinStateService,
  DesktopSkinStateStore,
  SKIN_STATE_END,
  SKIN_STATE_START,
  type DesktopSkinStateFace,
  type SkinLoaderEntry,
} from './skin-state.ts'

export {
  DESKTOP_COMPAT_PATCHES,
  validateCompatPatchRegistry,
  type DesktopCompatPatch,
} from './patch-registry.ts'

export {
  DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP,
  createDesktopTaskBoardHostScheduleRunner,
  type DesktopScheduledProject,
  type DesktopScheduledTaskEligibilityInput,
  type DesktopScheduledTaskOwnership,
  type DesktopScheduledRunInput,
  type DesktopScheduledRunReference,
  type DesktopScheduledRunResult,
  type DesktopScheduledTask,
  type DesktopTaskBoardHostScheduleRunner,
} from './background-scheduler-runner.ts'

export {
  installToolCallArgumentNormalization,
  normalizeToolCallArgumentStream,
  normalizeWrappedToolCallArguments,
  type ToolCallArgumentNormalization,
  type ToolCallNormalizationDiagnostic,
  type ToolCallNormalizationReason,
} from './tool-call-normalization.ts'

export {
  balanceTranscriptMessages,
  extractToolCallsFromAssistantMessage,
  installTranscriptBalanceGuard,
  type TranscriptBalanceDiagnostic,
} from './transcript-balance.ts'

export {
  DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH,
  createDesktopWorkspaceFileOpenRoute,
  registerDesktopWorkspaceFileOpenRoute,
  resolveDesktopWorkspaceFileOpenTarget,
} from './workspace-file-open-route.ts'

export {
  DESKTOP_CONVERSATION_IMPORT_PATH,
  createDesktopConversationImportRoute,
  importConversationIntoHost,
  registerDesktopConversationImportRoute,
} from './conversation-import-route.ts'
