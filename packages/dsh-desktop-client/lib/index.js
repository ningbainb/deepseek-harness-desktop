/**
 * Public, browser-safe client for the versioned DeepSeek Harness Desktop
 * Contract. This module deliberately knows only a narrow typed bridge; it
 * never exports the preload object, Electron, filesystems, or DSH internals.
 */
export const DESKTOP_CLIENT_API_VERSION = '1.1.0';
export class DesktopClientError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'DesktopClientError';
        this.code = code;
    }
}
function unavailable() {
    return Object.freeze({ available: false, reason: 'unavailable' });
}
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function bridgeFrom(globalObject) {
    const candidate = asRecord(globalObject)?.dshDesktop;
    return asRecord(candidate);
}
function normalizeInfo(value) {
    const record = asRecord(value);
    if (!record)
        return undefined;
    const { appId, productName, version, platform } = record;
    if ([appId, productName, version, platform].some(item => typeof item !== 'string' || item.length === 0))
        return undefined;
    return Object.freeze({ appId: String(appId), productName: String(productName), version: String(version), platform: String(platform) });
}
function normalizeContract(value) {
    const record = asRecord(value);
    if (!record || typeof record.apiVersion !== 'string' || typeof record.surface !== 'string' || !Array.isArray(record.capabilities)
        || !record.capabilities.every(item => typeof item === 'string'))
        return undefined;
    const runtimeRecord = asRecord(record.runtime);
    const runtime = runtimeRecord === undefined
        ? undefined
        : normalizeRuntimeContract(runtimeRecord);
    return Object.freeze({
        apiVersion: record.apiVersion,
        surface: record.surface,
        capabilities: Object.freeze([...record.capabilities]),
        ...(runtime === undefined ? {} : { runtime }),
    });
}
function normalizeRuntimeContract(value) {
    const supportStatuses = new Set(['known-good', 'supported', 'candidate', 'blocked', 'degraded', 'unsupported']);
    const capabilityStatuses = new Set(['available', 'unavailable', 'unsupported']);
    if (typeof value.providerId !== 'string' || value.providerId.length === 0 || value.providerId.length > 128
        || typeof value.upstreamVersion !== 'string' || value.upstreamVersion.length === 0 || value.upstreamVersion.length > 128
        || !supportStatuses.has(value.supportStatus) || !Array.isArray(value.capabilities))
        return undefined;
    const capabilities = value.capabilities.map((entry) => {
        const item = asRecord(entry);
        if (!item || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 128
            || !capabilityStatuses.has(item.status))
            return undefined;
        return Object.freeze({ id: item.id, status: item.status });
    });
    if (capabilities.some((entry) => entry === undefined))
        return undefined;
    return Object.freeze({
        providerId: value.providerId,
        upstreamVersion: value.upstreamVersion,
        supportStatus: value.supportStatus,
        capabilities: Object.freeze(capabilities),
    });
}
function normalizeStatus(value) {
    const record = asRecord(value);
    if (!record || typeof record.state !== 'string' || typeof record.restartAttempt !== 'number' || !Number.isInteger(record.restartAttempt))
        return undefined;
    const output = { state: record.state, restartAttempt: record.restartAttempt };
    if (typeof record.error === 'string')
        output.error = record.error;
    if (typeof record.url === 'string')
        output.url = record.url;
    if (record.restartBlocked === 'repeated-crash')
        output.restartBlocked = record.restartBlocked;
    const recovery = asRecord(record.recovery);
    if (recovery && typeof recovery.safeMode === 'boolean' && typeof recovery.busy === 'boolean' && typeof recovery.recoveryStage === 'number' && Number.isInteger(recovery.recoveryStage)) {
        output.recovery = { safeMode: recovery.safeMode, busy: recovery.busy, recoveryStage: recovery.recoveryStage };
    }
    const background = asRecord(record.background);
    if (background && typeof background.enabled === 'boolean' && typeof background.trayAvailable === 'boolean') {
        const closeBehavior = background.closeBehavior;
        output.background = {
            enabled: background.enabled,
            trayAvailable: background.trayAvailable,
            ...(closeBehavior === 'quit' || closeBehavior === 'minimize-to-tray' || closeBehavior === 'ask'
                ? { closeBehavior }
                : {}),
        };
    }
    return Object.freeze(output);
}
function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new DesktopClientError('desktop-invalid-argument', `${label} must be a non-empty string`);
    }
    return value.trim();
}
function normalizeWorkspaceFileRequest(value) {
    const root = requireNonEmptyString(value?.root, 'workspace root');
    const path = requireNonEmptyString(value?.path, 'workspace file path').replaceAll('\\', '/');
    if (path.length > 4_096 || path.startsWith('/') || /^[a-z]:/iu.test(path) || path.split('/').some(segment => segment === '..' || segment === '')) {
        throw new DesktopClientError('desktop-invalid-argument', 'workspace file path must be a non-empty relative path');
    }
    return Object.freeze({ root, path });
}
function requireSafeDeepLinkId(value, label) {
    const id = requireNonEmptyString(value, label);
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id)) {
        throw new DesktopClientError('desktop-invalid-argument', `${label} must be a safe Desktop identifier`);
    }
    return id;
}
function normalizeNotificationResult(value) {
    const record = asRecord(value);
    if (!record || typeof record.shown !== 'boolean')
        return Object.freeze({ shown: false, reason: 'unavailable' });
    return Object.freeze({ shown: record.shown, ...(typeof record.reason === 'string' ? { reason: record.reason } : {}) });
}
/** Create a public client around an optional typed Desktop bridge. */
export function createDesktopClient({ globalObject = globalThis } = {}) {
    const bridge = bridgeFrom(globalObject);
    const getDesktopInfo = async () => {
        if (typeof bridge?.getInfo !== 'function')
            return unavailable();
        return normalizeInfo(await bridge.getInfo()) ?? unavailable();
    };
    const getContract = async () => {
        if (typeof bridge?.getContract !== 'function')
            return unavailable();
        return normalizeContract(await bridge.getContract()) ?? unavailable();
    };
    const hasBridgeCapability = async (name) => {
        const contract = await getContract();
        return !('available' in contract) && contract.capabilities.includes(name);
    };
    return Object.freeze({
        getDesktopInfo,
        getContract,
        async hasCapability(name, version = 1) {
            if (typeof name !== 'string' || name.trim().length === 0 || !Number.isInteger(version) || version < 1)
                return false;
            const contract = await getContract();
            if ('available' in contract || Number.parseInt(contract.apiVersion.split('.')[0] ?? '', 10) !== version)
                return false;
            return contract.capabilities.includes(name);
        },
        async getRuntimeStatus() {
            if (typeof bridge?.getStatus !== 'function')
                return unavailable();
            return normalizeStatus(await bridge.getStatus()) ?? unavailable();
        },
        subscribeRuntimeStatus(handler) {
            if (typeof handler !== 'function' || typeof bridge?.onStatus !== 'function')
                return () => { };
            return bridge.onStatus((value) => {
                const status = normalizeStatus(value);
                if (status !== undefined)
                    handler(status);
            });
        },
        async showNotification(request) {
            if (typeof bridge?.showNotification !== 'function')
                return unavailable();
            if (!await hasBridgeCapability('notifications.show'))
                return unavailable();
            return normalizeNotificationResult(await bridge.showNotification(request));
        },
        subscribeDeepLinks(handler) {
            if (typeof handler !== 'function' || typeof bridge?.onDeepLink !== 'function')
                return () => { };
            return bridge.onDeepLink((value) => {
                const record = asRecord(value);
                if (typeof record?.href === 'string')
                    handler(record.href);
            });
        },
        async openDesktopSurface(surface) {
            if (surface === 'extensions' && typeof bridge?.openExtensionDock === 'function') {
                if (!await hasBridgeCapability('extensions.open'))
                    return false;
                const result = asRecord(await bridge.openExtensionDock());
                return result?.opened === true;
            }
            if (surface === 'updates' && typeof bridge?.helpAction === 'function') {
                if (!await hasBridgeCapability('updates.read'))
                    return false;
                await bridge.helpAction('updates');
                return true;
            }
            return false;
        },
        async getDockEntryState() {
            if (typeof bridge?.getDockEntryState !== 'function')
                return unavailable();
            if (!await hasBridgeCapability('extensions.open'))
                return unavailable();
            const result = asRecord(await bridge.getDockEntryState());
            if (result?.available !== true || typeof result.showNudge !== 'boolean')
                return unavailable();
            return Object.freeze({ available: true, showNudge: result.showNudge });
        },
        async dismissDockNudge(reason) {
            if (!['close', 'escape', 'clicked'].includes(reason)) {
                throw new DesktopClientError('desktop-invalid-argument', 'Dock dismiss reason is invalid');
            }
            if (typeof bridge?.dismissDockNudge !== 'function')
                return false;
            if (!await hasBridgeCapability('extensions.open'))
                return false;
            const result = asRecord(await bridge.dismissDockNudge(reason));
            return result?.dismissed === true;
        },
        async openWorkspaceFile(request) {
            const normalizedRequest = normalizeWorkspaceFileRequest(request);
            if (typeof bridge?.openWorkspaceFile !== 'function')
                return unavailable();
            if (!await hasBridgeCapability('workspace-files.open'))
                return unavailable();
            const result = asRecord(await bridge.openWorkspaceFile(normalizedRequest));
            if (!result || typeof result.opened !== 'boolean')
                return Object.freeze({ opened: false, reason: 'unavailable' });
            return Object.freeze({ opened: result.opened, ...(typeof result.reason === 'string' ? { reason: result.reason } : {}) });
        },
        async requestPluginInstall(request) {
            const source = request?.source;
            if (typeof source !== 'string' || source.length === 0 || source.length > 2_048) {
                throw new DesktopClientError('desktop-invalid-argument', 'plugin install source must be a bounded non-empty string');
            }
            if (typeof bridge?.requestPluginInstall !== 'function')
                return unavailable();
            if (!await hasBridgeCapability('plugins.install.request'))
                return unavailable();
            const result = asRecord(await bridge.requestPluginInstall(source));
            if (!result || typeof result.accepted !== 'boolean')
                return unavailable();
            return Object.freeze({ accepted: result.accepted });
        },
    });
}
const defaultClient = createDesktopClient();
export const getDesktopInfo = defaultClient.getDesktopInfo;
export const getContract = defaultClient.getContract;
export const hasCapability = defaultClient.hasCapability;
export const getRuntimeStatus = defaultClient.getRuntimeStatus;
export const subscribeRuntimeStatus = defaultClient.subscribeRuntimeStatus;
export const showNotification = defaultClient.showNotification;
export const subscribeDeepLinks = defaultClient.subscribeDeepLinks;
export const openDesktopSurface = defaultClient.openDesktopSurface;
export const getDockEntryState = defaultClient.getDockEntryState;
export const dismissDockNudge = defaultClient.dismissDockNudge;
export const openWorkspaceFile = defaultClient.openWorkspaceFile;
export const requestPluginInstall = defaultClient.requestPluginInstall;
export function taskDeepLink(taskId) {
    return `dsh://task/${requireSafeDeepLinkId(taskId, 'task id')}`;
}
export function runDeepLink(runId) {
    return `dsh://run/${requireSafeDeepLinkId(runId, 'run id')}`;
}
