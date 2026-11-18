function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isMemoryItem(value) {
    return isRecord(value) && typeof value.id === 'string'
        && (value.scope === 'global' || value.scope === 'workspace' || value.scope === 'session')
        && typeof value.content === 'string' && Array.isArray(value.tags) && value.tags.every(tag => typeof tag === 'string')
        && typeof value.pinned === 'boolean' && (value.source === 'explicit' || value.source === 'confirmed-suggestion')
        && (value.workspaceId === undefined || typeof value.workspaceId === 'string')
        && (value.sessionId === undefined || typeof value.sessionId === 'string')
        && Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.updatedAt)
        && (value.expiresAt === undefined || Number.isSafeInteger(value.expiresAt));
}
export function memoryRequestErrorCode(reason) {
    return reason instanceof Error && 'code' in reason ? reason.code : undefined;
}
async function requestJson(path, init) {
    const response = await fetch(path, { cache: 'no-store', ...init });
    const value = await response.json();
    if (!isRecord(value))
        throw new Error('invalid memory response');
    if (!response.ok || value.ok !== true) {
        throw Object.assign(new Error('memory request failed'), { code: value.code });
    }
    return value;
}
export async function readMemoryCatalog(signal) {
    const [saved, suggestions] = await Promise.all([
        requestJson('/api/dsh-memory/items?view=manage&refresh=1', { signal }),
        requestJson('/api/dsh-memory/pending', { signal }),
    ]);
    signal.throwIfAborted();
    if (!Array.isArray(saved.items) || !saved.items.every(isMemoryItem)
        || !Array.isArray(suggestions.items) || !suggestions.items.every((value) => (isRecord(value) && typeof value.id === 'string' && typeof value.createdAt === 'number' && isMemoryItem(value.item))))
        throw new Error('invalid memory response');
    return { items: saved.items, pending: suggestions.items };
}
export function postMemoryJson(path, body) {
    return requestJson(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}
export function filterMemoryItems(items, scope, query) {
    const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase();
    const terms = normalize(query).trim().split(/\s+/u).filter(Boolean);
    return items.filter(item => {
        if (scope !== 'all' && item.scope !== scope)
            return false;
        if (terms.length === 0)
            return true;
        const fields = [item.content, ...item.tags, item.workspaceId ?? '', item.sessionId ?? ''].map(normalize);
        return terms.every(term => fields.some(field => field.includes(term)));
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}
