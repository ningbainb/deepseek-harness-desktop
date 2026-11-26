import type { WinControlSettings } from '../core/settings.ts';
export interface MirrorStatus {
    id: string;
    label: string;
    indexUrl: string;
    official: boolean;
    ok: boolean;
    indexMs?: number;
    downloadMs?: number;
    bytes?: number;
    speedBps?: number;
    version?: string;
    error?: string;
}
export interface InstallerState {
    state: 'idle' | 'probing' | 'installing' | 'succeeded' | 'failed' | 'cancelled';
    version: string;
    currentMirror?: string;
    message?: string;
    error?: string;
    executable?: string;
    logs: string[];
    mirrors: MirrorStatus[];
}
export interface WinControlStateResponse {
    platform: string;
    pinnedVersion: string;
    installedVersions: Array<{
        version: string;
        executable: string;
        installedAt: string | null;
        mirror: string | null;
    }>;
    bridgedToolCount: number;
    bridgedTools: string[];
    sessionGranted: boolean;
    settings: WinControlSettings;
    installer: InstallerState;
    mirrors: MirrorStatus[];
}
export declare function fetchWinControlState(sessionId?: string | null): Promise<WinControlStateResponse>;
export declare function setSessionWinControlGrant(sessionId: string, enabled: boolean): Promise<{
    sessionId: string;
    enabled: boolean;
}>;
export declare function saveWinControlSettings(settings: WinControlSettings): Promise<{
    settings: WinControlSettings;
    problems: string[];
}>;
export declare function probeWinControlMirrors(): Promise<{
    mirrors: MirrorStatus[];
}>;
export declare function startWinControlInstall(): Promise<{
    installer: InstallerState;
}>;
export declare function cancelWinControlInstall(): Promise<{
    installer: InstallerState;
}>;
export declare function runWinControlDoctor(): Promise<{
    report: string;
    bridgedCount: number;
}>;
//# sourceMappingURL=api.d.ts.map