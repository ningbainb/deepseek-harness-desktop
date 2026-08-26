import type { Context } from '@deepseek-ai/cordis';
export declare const name = "desktop-compat";
export declare const inject: string[];
/** Install Desktop-only compatibility behavior through public DSH hooks. */
export declare function apply(ctx: Context): void;
export { FRIENDLY_CANCELLED_MESSAGE, createQueueRecoveryScheduler, normalizeCancellationDecision, recoverQueuedTurns, } from './recovery.ts';
export { DesktopSkinStateService, DesktopSkinStateStore, SKIN_STATE_END, SKIN_STATE_START, type DesktopSkinStateFace, type SkinLoaderEntry, } from './skin-state.ts';
export { DESKTOP_COMPAT_PATCHES, validateCompatPatchRegistry, type DesktopCompatPatch, } from './patch-registry.ts';
export { DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP, createDesktopTaskBoardHostScheduleRunner, type DesktopScheduledProject, type DesktopScheduledTaskEligibilityInput, type DesktopScheduledTaskOwnership, type DesktopScheduledRunInput, type DesktopScheduledRunReference, type DesktopScheduledRunResult, type DesktopScheduledTask, type DesktopTaskBoardHostScheduleRunner, } from './background-scheduler-runner.ts';
export { installToolCallArgumentNormalization, normalizeToolCallArgumentStream, normalizeWrappedToolCallArguments, type ToolCallArgumentNormalization, type ToolCallNormalizationDiagnostic, type ToolCallNormalizationReason, } from './tool-call-normalization.ts';
export { balanceTranscriptMessages, extractToolCallsFromAssistantMessage, installTranscriptBalanceGuard, type TranscriptBalanceDiagnostic, } from './transcript-balance.ts';
export { DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH, createDesktopWorkspaceFileOpenRoute, registerDesktopWorkspaceFileOpenRoute, resolveDesktopWorkspaceFileOpenTarget, } from './workspace-file-open-route.ts';
