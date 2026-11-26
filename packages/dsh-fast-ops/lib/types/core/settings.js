export const PACKAGE_ID = '@ningbainb/dsh-fast-ops';
export const ROUTE_PREFIX = '/api/dsh-fast-ops';
export const SETTINGS_FILE = 'dsh-fast-ops.settings.json';
export const SETTINGS_VERSION = 1;
export const INLINE_BYTE_OPTIONS = [8192, 16384, 32768, 65536];
export const TTL_MS_OPTIONS = [900000, 3600000, 21600000];
export function defaultSettings() {
    return {
        version: SETTINGS_VERSION,
        enabled: true,
        lazySpecializedTools: true,
        batchingGuidance: true,
        maxInlineBytes: 16384,
        resultCacheTtlMs: 3600000,
        maxCachedRefs: 128,
    };
}
function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num))
        return null;
    return Math.max(min, Math.min(max, Math.round(num)));
}
/** Coerce arbitrary settings input into valid clamped FastOpsSettings. */
export function normalizeSettings(input) {
    const settings = defaultSettings();
    const problems = [];
    if (input === null || typeof input !== 'object')
        return { settings, problems };
    const raw = input;
    if (typeof raw.enabled === 'boolean')
        settings.enabled = raw.enabled;
    else if (raw.enabled !== undefined)
        problems.push('enabled');
    if (typeof raw.lazySpecializedTools === 'boolean')
        settings.lazySpecializedTools = raw.lazySpecializedTools;
    else if (raw.lazySpecializedTools !== undefined)
        problems.push('lazySpecializedTools');
    if (typeof raw.batchingGuidance === 'boolean')
        settings.batchingGuidance = raw.batchingGuidance;
    else if (raw.batchingGuidance !== undefined)
        problems.push('batchingGuidance');
    const maxBytes = clampInt(raw.maxInlineBytes, 4096, 65536);
    if (raw.maxInlineBytes !== undefined) {
        if (maxBytes !== null && maxBytes === Number(raw.maxInlineBytes))
            settings.maxInlineBytes = maxBytes;
        else if (maxBytes !== null) {
            settings.maxInlineBytes = maxBytes;
            problems.push('maxInlineBytes');
        }
        else {
            problems.push('maxInlineBytes');
        }
    }
    const ttl = clampInt(raw.resultCacheTtlMs, 60000, 86400000);
    if (raw.resultCacheTtlMs !== undefined) {
        if (ttl !== null && ttl === Number(raw.resultCacheTtlMs))
            settings.resultCacheTtlMs = ttl;
        else if (ttl !== null) {
            settings.resultCacheTtlMs = ttl;
            problems.push('resultCacheTtlMs');
        }
        else {
            problems.push('resultCacheTtlMs');
        }
    }
    const maxRefs = clampInt(raw.maxCachedRefs, 16, 512);
    if (raw.maxCachedRefs !== undefined) {
        if (maxRefs !== null && maxRefs === Number(raw.maxCachedRefs))
            settings.maxCachedRefs = maxRefs;
        else if (maxRefs !== null) {
            settings.maxCachedRefs = maxRefs;
            problems.push('maxCachedRefs');
        }
        else {
            problems.push('maxCachedRefs');
        }
    }
    return { settings, problems };
}
