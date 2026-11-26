const HEADERS = {
    'content-type': 'application/json',
    'x-dsh-fast-ops': '1',
};
async function callApi(path, init) {
    const response = await fetch(`/api/dsh-fast-ops${path}`, {
        cache: 'no-store',
        ...init,
        headers: {
            ...HEADERS,
            ...(init?.headers ?? {}),
        },
    });
    if (!response.ok)
        throw new Error(`fast-ops request failed (${response.status})`);
    return response.json();
}
export function fetchFastOpsState() {
    return callApi('/state', { method: 'GET' });
}
export function saveFastOpsSettings(settings) {
    return callApi('/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
    });
}
export function reclaimFastOpsCache() {
    return callApi('/cache/reclaim', { method: 'POST', body: '{}' });
}
