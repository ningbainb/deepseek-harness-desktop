import { spawn } from 'node:child_process';
import { type WinControlSettings } from '../core/settings.ts';
import { probeMirrors, type MirrorProbeResult } from './mirrors.ts';
export declare const UV_PYTHON_REQUIREMENT = ">=3.14,<3.15";
export declare const PROFILE_BLOCK_BEGIN = "# >>> dsh-win-control (machine managed) >>>";
export declare const PROFILE_BLOCK_END = "# <<< dsh-win-control <<<";
export interface ProcessEntry {
    readonly pid: number;
    readonly path: string;
}
export interface ManagedVersionInfo {
    readonly version: string;
    readonly toolDirectory: string;
    readonly executable: string;
    readonly installedAt: string | null;
    readonly mirror: string | null;
}
export interface InstallerSnapshot {
    readonly state: 'idle' | 'probing' | 'installing' | 'succeeded' | 'failed' | 'cancelled';
    readonly version: string;
    readonly currentMirror?: string;
    readonly message?: string;
    readonly error?: string;
    readonly executable?: string;
    readonly logs: readonly string[];
    readonly mirrors: readonly MirrorProbeResult[];
}
export declare function managedToolchainRoot(home?: string): string;
export declare function versionToolRoot(root: string, version: string): string;
export declare function toolDirectoryFor(root: string, version: string): string;
export declare function executableIn(toolDir: string): string | null;
export declare function managedExecutable(root: string, version?: string): string | null;
export declare function readManifest(root: string, version: string): Record<string, unknown> | null;
export declare function writeManifest(root: string, version: string, payload?: Record<string, unknown>): Record<string, unknown>;
export declare function listManagedVersions(root?: string): ManagedVersionInfo[];
export declare function parseProcessLines(text: string): ProcessEntry[];
export declare function processesUnder(root: string, entries: readonly ProcessEntry[], platform?: NodeJS.Platform): ProcessEntry[];
export declare function listProcesses(options?: {
    timeoutMs?: number;
    platform?: NodeJS.Platform;
    spawnImpl?: typeof spawn;
}): Promise<ProcessEntry[]>;
export declare function buildBridgeOverrideBlock(executable: string, settings: WinControlSettings, version?: string): string;
/** Idempotently insert or replace the machine-managed bridge override block in a profile patch YAML. */
export declare function upsertBridgeOverride(existingYaml: string, block: string, eol?: string): string;
export declare function writeBridgeOverrideFile(profileDir: string, executable: string, settings: WinControlSettings, version?: string): string;
export declare function resolveActiveProfileDirectory(home?: string): string | null;
export interface ToolchainInstallerOptions {
    home?: string;
    spawnImpl?: typeof spawn;
    probeMirrorsImpl?: typeof probeMirrors;
    listProcessesImpl?: typeof listProcesses;
    writeOverrideImpl?: typeof writeBridgeOverrideFile;
}
export declare function createToolchainInstaller(options?: ToolchainInstallerOptions): {
    getSnapshot: () => InstallerSnapshot;
    start: (params: {
        version?: string;
        settings: WinControlSettings;
        profileDir?: string | null;
    }) => Promise<InstallerSnapshot>;
    cancel: () => InstallerSnapshot;
    toolchainRoot: string;
};
//# sourceMappingURL=toolchain.d.ts.map