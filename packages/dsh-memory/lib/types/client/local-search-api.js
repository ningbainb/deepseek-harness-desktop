export const LOCAL_SEARCH_UPDATED_EVENT = 'dsh:local-search-updated';
export async function postLocalSearch(operation, body, signal) {
    const response = await fetch('/api/dsh-local-search/' + operation, {
        method: 'POST',
        cache: 'no-store',
        signal,
        headers: { 'content-type': 'application/json', 'x-dsh-local-search': '1' },
        body: JSON.stringify(body),
    });
    if (!response.ok)
        throw new Error('Local search is unavailable');
    return await response.json();
}
export function notifyLocalSearchUpdated() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(LOCAL_SEARCH_UPDATED_EVENT));
    }
}
