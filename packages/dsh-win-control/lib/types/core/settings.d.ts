export declare const PACKAGE_ID = "@ningbainb/dsh-win-control";
export declare const BRIDGE_ROW_ID = "windows-mcp-bridge";
export declare const PINNED_WINDOWS_MCP_VERSION = "0.8.8";
export declare const ROUTE_PREFIX = "/api/dsh-win-control";
export declare const SETTINGS_FILE = "dsh-win-control.settings.json";
export declare const SETTINGS_VERSION = 1;
export declare const SCREENSHOT_SCALES: readonly [0.25, 0.5, 0.75, 1];
export declare const SCREENSHOT_BACKENDS: readonly ["auto", "dxcam", "mss", "pillow"];
export declare const EXCLUDABLE_TOOLS: readonly ["App", "PowerShell", "FileSystem"];
export declare const TIMEOUT_RANGE: Readonly<{
    min: 5000;
    max: 600000;
}>;
export declare const MIRROR_IDS: readonly ["auto", "ustc", "aliyun", "tencent", "huawei", "nju", "tuna", "pypi"];
export type ScreenshotScale = (typeof SCREENSHOT_SCALES)[number];
export type ScreenshotBackend = (typeof SCREENSHOT_BACKENDS)[number];
export type ExcludableTool = (typeof EXCLUDABLE_TOOLS)[number];
export type MirrorChoice = (typeof MIRROR_IDS)[number];
export interface WinControlSettings {
    version: number;
    bridge: {
        toolCallTimeoutMs: number;
        excludeTools: ExcludableTool[];
        screenshotScale: ScreenshotScale;
        screenshotBackend: ScreenshotBackend;
        disableFlash: boolean;
    };
    plugin: {
        preferredMirror: MirrorChoice;
        lazyTools: boolean;
        defaultGrant: boolean;
    };
}
export declare function defaultSettings(): WinControlSettings;
/** Coerce raw input into a valid settings object while reporting replaced keys. */
export declare function normalizeSettings(input: unknown): {
    settings: WinControlSettings;
    problems: string[];
};
//# sourceMappingURL=settings.d.ts.map