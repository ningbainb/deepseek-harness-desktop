const HEADERS = {
    'content-type': 'application/json',
    'x-dsh-win-control': '1',
};
async function callApi(path, init) {
    const response = await fetch(`/api/dsh-win-control${path}`, {
        cache: 'no-store',
        ...init,
        headers: {
            ...HEADERS,
            ...(init?.headers ?? {}),
        },
    });
    if (!response.ok) {
        throw new Error(`win-control request failed (${response.status})`);
    }
    return response.json();
}
export function fetchWinControlState(sessionId) {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    return callApi(`/state${query}`, { method: 'GET' });
}
export function setSessionWinControlGrant(sessionId, enabled) {
    return callApi('/grant', {
        method: 'POST',
        body: JSON.stringify({ sessionId, enabled }),
    });
}
export function saveWinControlSettings(settings) {
    return callApi('/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
    });
}
export function probeWinControlMirrors() {
    return callApi('/mirrors/probe', { method: 'POST', body: '{}' });
}
export function startWinControlInstall() {
    return callApi('/install', { method: 'POST', body: '{}' });
}
export function cancelWinControlInstall() {
    return callApi('/install/cancel', { method: 'POST', body: '{}' });
}
export function runWinControlDoctor() {
    return callApi('/doctor', { method: 'POST', body: '{}' });
}
