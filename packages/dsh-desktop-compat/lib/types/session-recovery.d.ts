import type { Context } from '@deepseek-ai/cordis';
export declare const SESSION_RECOVERY_KIND: "corrupt-zstd-header";
export declare const SESSION_RECOVERED_KIND: "plaintext-zstd-mismatch";
export declare const LEGACY_PERMISSION_PRESET_RECOVERY_KIND: "legacy-v0-permission-preset-origin";
export declare const LEGACY_PERMISSION_PRESET_RECOVERED_KIND: "legacy-v0-permission-preset-origin-normalized";
export declare const LEGACY_SUBAGENT_RECOVERY_KIND: "legacy-v0-subagent-descriptor-v2";
export declare const LEGACY_SUBAGENT_RECOVERED_KIND: "legacy-v0-subagent-descriptor-v2-normalized";
export declare const CONFIRMED_SESSION_RECOVERY_ERROR = "corrupt Zstandard session log: invalid frame magic at byte 0";
export declare const CONFIRMED_LEGACY_PERMISSION_PRESET_ERROR: RegExp;
export interface SessionRecoverySkip {
    readonly count: number;
    readonly kind: typeof SESSION_RECOVERY_KIND | typeof LEGACY_PERMISSION_PRESET_RECOVERY_KIND | typeof LEGACY_SUBAGENT_RECOVERY_KIND;
}
export interface SessionRecoverySuccess {
    readonly count: number;
    readonly kind: typeof SESSION_RECOVERED_KIND | typeof LEGACY_PERMISSION_PRESET_RECOVERED_KIND | typeof LEGACY_SUBAGENT_RECOVERED_KIND;
}
export interface SessionPersistenceRecoveryInstall {
    readonly installed: boolean;
    readonly getSkippedCount: () => number;
    readonly getRecoveredCount: () => number;
    readonly restore: () => void;
}
export interface SessionPersistenceRecoveryOptions {
    readonly onSkipped?: (event: SessionRecoverySkip) => void;
    readonly onRecovered?: (event: SessionRecoverySuccess) => void;
}
/** Match only the storage error proven to be safe to isolate at the list seam. */
export declare function isConfirmedSessionRecoveryError(error: unknown): boolean;
/** Match the one released-v0 schema refusal reproduced from an affected 3.3 user artifact. */
export declare function isConfirmedLegacyPermissionPresetError(error: unknown): boolean;
/**
 * Normalize only the released-v0 permission preset row observed in the field.
 * The original is preserved, all other compressed rows remain byte-equivalent
 * after decoding, and the candidate must pass the official migration catalog.
 */
export declare function recoverLegacyPermissionPresetArtifact(path: string, expectedId: string, signal?: AbortSignal): Promise<boolean>;
/**
 * Repair only a valid plaintext JSONL artifact carrying the zstd suffix.
 * Original bytes are copied beside it before the canonical path is atomically
 * replaced with a checksummed header frame and a streamed body frame.
 */
export declare function recoverPlaintextZstdArtifact(path: string, signal?: AbortSignal): Promise<boolean>;
/** Wrap the fixed Runtime readers and repair only validated historical variants. */
export declare function installSessionPersistenceRecovery(target: unknown, { onSkipped, onRecovered }?: SessionPersistenceRecoveryOptions): SessionPersistenceRecoveryInstall;
export declare const name = "desktop-session-recovery";
export declare const inject: string[];
/** Install the narrow recovery seam before dsh-workspace enumerates sessions. */
export declare function apply(ctx: Context): void;
