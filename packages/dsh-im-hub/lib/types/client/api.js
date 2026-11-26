const HEADERS = {
    'content-type': 'application/json',
    'x-dsh-im-hub': '1',
};
async function callApi(path, init) {
    const response = await fetch(`/api/dsh-im-hub${path}`, {
        cache: 'no-store',
        ...init,
        headers: {
            ...HEADERS,
            ...(init?.headers ?? {}),
        },
    });
    if (!response.ok)
        throw new Error(`im-hub request failed (${response.status})`);
    return response.json();
}
export function fetchImHubState() {
    return callApi('/state', { method: 'GET' });
}
export function saveImHubSettings(settings) {
    return callApi('/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
    });
}
export function testImHubChannel(channel) {
    return callApi('/channel/test', {
        method: 'POST',
        body: JSON.stringify({ channel }),
    });
}
export function restartImHubChannel(channel) {
    return callApi('/channel/restart', {
        method: 'POST',
        body: JSON.stringify({ channel }),
    });
}
