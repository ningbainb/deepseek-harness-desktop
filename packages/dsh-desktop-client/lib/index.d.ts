/**
 * Public, browser-safe client for the versioned DeepSeek Harness Desktop
 * Contract. This module deliberately knows only a narrow typed bridge; it
 * never exports the preload object, Electron, filesystems, or DSH internals.
 */
export declare const DESKTOP_CLIENT_API_VERSION = "1.0.0";
export type DesktopSurface = 'extensions' | 'updates';
export type DesktopAvailability = {
    available: false;
    reason: 'unavailable';
};
export type DesktopInfo = {
    appId: string;
    productName: string;
    version: string;
    platform: string;
};
export type RuntimeStatus = {
    state: string;
    error?: string;
    url?: string;
    restartAttempt: number;
    restartBlocked?: 'repeated-crash';
    recovery?: {
        safeMode: boolean;
        busy: boolean;
        recoveryStage: number;
    };
    /** Read-only Desktop background-mode state; never a Tray/Electron handle. */
    background?: {
        enabled: boolean;
        trayAvailable: boolean;
        closeBehavior?: 'quit' | 'minimize-to-tray' | 'ask';
    };
};
export type DesktopContract = {
    apiVersion: string;
    surface: string;
    capabilities: readonly string[];
    runtime?: {
        providerId: string;
        upstreamVersion: string;
        supportStatus: 'known-good' | 'supported' | 'candidate' | 'blocked' | 'degraded' | 'unsupported';
        capabilities: readonly {
            id: string;
            status: 'available' | 'unavailable' | 'unsupported';
        }[];
    };
};
export type DesktopNotificationRequest = {
    category: 'plugin-recovery' | 'preset' | 'task' | 'run' | 'update';
    id: string;
    title: string;
    body: string;
    deepLink?: string;
};
export type DesktopNotificationResult = {
    shown: boolean;
    reason?: string;
} | DesktopAvailability;
export type WorkspaceFileOpenRequest = {
    root: string;
    path: string;
};
export type WorkspaceFileOpenResult = {
    opened: boolean;
    reason?: string;
} | DesktopAvailability;
export declare class DesktopClientError extends Error {
    readonly code: 'desktop-invalid-argument' | 'desktop-operation-failed';
    constructor(code: DesktopClientError['code'], message: string);
}
type Unsubscribe = () => void;
export type PluginInstallRequestResult = {
    accepted: boolean;
} | DesktopAvailability;
export type DesktopClient = Readonly<{
    getDesktopInfo: () => Promise<DesktopInfo | DesktopAvailability>;
    getContract: () => Promise<DesktopContract | DesktopAvailability>;
    hasCapability: (name: string, version?: number) => Promise<boolean>;
    getRuntimeStatus: () => Promise<RuntimeStatus | DesktopAvailability>;
    subscribeRuntimeStatus: (handler: (status: RuntimeStatus) => void) => Unsubscribe;
    showNotification: (request: DesktopNotificationRequest) => Promise<DesktopNotificationResult>;
    subscribeDeepLinks: (handler: (link: string) => void) => Unsubscribe;
    openDesktopSurface: (surface: DesktopSurface) => Promise<boolean>;
    openWorkspaceFile: (request: WorkspaceFileOpenRequest) => Promise<WorkspaceFileOpenResult>;
    /**
     * Hand a remote npm/git/HTTPS plugin reference to the Desktop. The
     * Extension Dock opens with the source pre-filled; its install form and
     * the native approval dialog own every later decision. Nothing is
     * installed by this call.
     */
    requestPluginInstall: (request: {
        source: string;
    }) => Promise<PluginInstallRequestResult>;
}>;
/** Create a public client around an optional typed Desktop bridge. */
export declare function createDesktopClient({ globalObject }?: {
    globalObject?: object;
}): DesktopClient;
export declare const getDesktopInfo: () => Promise<DesktopInfo | DesktopAvailability>;
export declare const getContract: () => Promise<DesktopContract | DesktopAvailability>;
export declare const hasCapability: (name: string, version?: number) => Promise<boolean>;
export declare const getRuntimeStatus: () => Promise<RuntimeStatus | DesktopAvailability>;
export declare const subscribeRuntimeStatus: (handler: (status: RuntimeStatus) => void) => Unsubscribe;
export declare const showNotification: (request: DesktopNotificationRequest) => Promise<DesktopNotificationResult>;
export declare const subscribeDeepLinks: (handler: (link: string) => void) => Unsubscribe;
export declare const openDesktopSurface: (surface: DesktopSurface) => Promise<boolean>;
export declare const openWorkspaceFile: (request: WorkspaceFileOpenRequest) => Promise<WorkspaceFileOpenResult>;
export declare const requestPluginInstall: (request: {
    source: string;
}) => Promise<PluginInstallRequestResult>;
export declare function taskDeepLink(taskId: string): string;
export declare function runDeepLink(runId: string): string;
export {};
//# sourceMappingURL=index.d.ts.map