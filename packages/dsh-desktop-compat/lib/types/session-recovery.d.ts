import type { Context } from '@deepseek-ai/cordis';
export declare const SESSION_RECOVERY_KIND: "corrupt-zstd-header";
export declare const CONFIRMED_SESSION_RECOVERY_ERROR = "corrupt Zstandard session log: invalid frame magic at byte 0";
export interface SessionRecoverySkip {
    readonly count: number;
    readonly kind: typeof SESSION_RECOVERY_KIND;
}
export interface SessionPersistenceRecoveryInstall {
    readonly installed: boolean;
    readonly getSkippedCount: () => number;
    readonly restore: () => void;
}
export interface SessionPersistenceRecoveryOptions {
    readonly onSkipped?: (event: SessionRecoverySkip) => void;
}
/** Match only the storage error proven to be safe to skip at the list seam. */
export declare function isConfirmedSessionRecoveryError(error: unknown): boolean;
/** Wrap the fixed Runtime JSONL header reader without changing any stored bytes. */
export declare function installSessionPersistenceRecovery(target: unknown, { onSkipped }?: SessionPersistenceRecoveryOptions): SessionPersistenceRecoveryInstall;
export declare const name = "desktop-session-recovery";
export declare const inject: string[];
/** Install the narrow recovery seam before dsh-workspace enumerates sessions. */
export declare function apply(ctx: Context): void;
