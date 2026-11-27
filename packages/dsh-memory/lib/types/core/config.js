export const DEFAULT_MEMORY_CONFIG = { version: 1, enabled: false };
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function assertMemoryConfig(value) {
    if (!isRecord(value) || value.version !== 1 || typeof value.enabled !== 'boolean'
        || value.suggestAfterTurns !== undefined && typeof value.suggestAfterTurns !== 'boolean') {
        throw new Error('invalid memory settings');
    }
}
export function normalizeMemoryConfig(value) {
    if (value === undefined)
        return { ...DEFAULT_MEMORY_CONFIG };
    assertMemoryConfig(value);
    return { version: 1, enabled: value.enabled, ...(value.suggestAfterTurns === undefined ? {} : { suggestAfterTurns: value.suggestAfterTurns }) };
}
