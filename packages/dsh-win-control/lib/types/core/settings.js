export const PACKAGE_ID = '@ningbainb/dsh-win-control';
export const BRIDGE_ROW_ID = 'windows-mcp-bridge';
export const PINNED_WINDOWS_MCP_VERSION = '0.8.8';
export const ROUTE_PREFIX = '/api/dsh-win-control';
export const SETTINGS_FILE = 'dsh-win-control.settings.json';
export const SETTINGS_VERSION = 1;
export const SCREENSHOT_SCALES = [0.25, 0.5, 0.75, 1];
export const SCREENSHOT_BACKENDS = ['auto', 'dxcam', 'mss', 'pillow'];
export const EXCLUDABLE_TOOLS = ['App', 'PowerShell', 'FileSystem'];
export const TIMEOUT_RANGE = Object.freeze({ min: 5000, max: 600000 });
export const MIRROR_IDS = ['auto', 'ustc', 'aliyun', 'tencent', 'huawei', 'nju', 'tuna', 'pypi'];
export function defaultSettings() {
    return {
        version: SETTINGS_VERSION,
        bridge: {
            toolCallTimeoutMs: 120000,
            excludeTools: ['App', 'PowerShell', 'FileSystem'],
            screenshotScale: 0.75,
            screenshotBackend: 'auto',
            disableFlash: true,
        },
        plugin: {
            preferredMirror: 'auto',
            lazyTools: true,
            defaultGrant: false,
        },
    };
}
/** Coerce raw input into a valid settings object while reporting replaced keys. */
export function normalizeSettings(input) {
    const settings = defaultSettings();
    const problems = [];
    if (input === null || typeof input !== 'object')
        return { settings, problems };
    const raw = input;
    const bridge = raw.bridge !== null && typeof raw.bridge === 'object'
        ? raw.bridge
        : {};
    const plugin = raw.plugin !== null && typeof raw.plugin === 'object'
        ? raw.plugin
        : {};
    const timeout = Number(bridge.toolCallTimeoutMs);
    if (Number.isFinite(timeout) && timeout >= TIMEOUT_RANGE.min && timeout <= TIMEOUT_RANGE.max) {
        settings.bridge.toolCallTimeoutMs = Math.round(timeout);
    }
    else if (bridge.toolCallTimeoutMs !== undefined) {
        problems.push('bridge.toolCallTimeoutMs');
    }
    if (Array.isArray(bridge.excludeTools)) {
        const wanted = [];
        for (const item of bridge.excludeTools) {
            const candidate = typeof item === 'string' ? item.trim() : '';
            if (EXCLUDABLE_TOOLS.includes(candidate) && !wanted.includes(candidate)) {
                wanted.push(candidate);
            }
        }
        if (wanted.length !== bridge.excludeTools.length)
            problems.push('bridge.excludeTools');
        settings.bridge.excludeTools = wanted;
    }
    else if (bridge.excludeTools !== undefined) {
        problems.push('bridge.excludeTools');
    }
    const scale = Number(bridge.screenshotScale);
    if (SCREENSHOT_SCALES.includes(scale)) {
        settings.bridge.screenshotScale = scale;
    }
    else if (bridge.screenshotScale !== undefined) {
        problems.push('bridge.screenshotScale');
    }
    if (SCREENSHOT_BACKENDS.includes(String(bridge.screenshotBackend))) {
        settings.bridge.screenshotBackend = bridge.screenshotBackend;
    }
    else if (bridge.screenshotBackend !== undefined) {
        problems.push('bridge.screenshotBackend');
    }
    if (typeof bridge.disableFlash === 'boolean') {
        settings.bridge.disableFlash = bridge.disableFlash;
    }
    else if (bridge.disableFlash !== undefined) {
        problems.push('bridge.disableFlash');
    }
    if (MIRROR_IDS.includes(String(plugin.preferredMirror))) {
        settings.plugin.preferredMirror = plugin.preferredMirror;
    }
    else if (plugin.preferredMirror !== undefined) {
        problems.push('plugin.preferredMirror');
    }
    if (typeof plugin.lazyTools === 'boolean') {
        settings.plugin.lazyTools = plugin.lazyTools;
    }
    else if (plugin.lazyTools !== undefined) {
        problems.push('plugin.lazyTools');
    }
    if (typeof plugin.defaultGrant === 'boolean') {
        settings.plugin.defaultGrant = plugin.defaultGrant;
    }
    else if (plugin.defaultGrant !== undefined) {
        problems.push('plugin.defaultGrant');
    }
    return { settings, problems };
}
