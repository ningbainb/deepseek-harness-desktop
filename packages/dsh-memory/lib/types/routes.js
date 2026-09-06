import { MemoryAccessError, MemoryNotFoundError, } from "./core/service.js";
import { MemoryValidationError, isMemoryScope, toPublicMemoryItem, } from "./core/schema.js";
import { MemoryStoreError } from "./store.js";
export const MEMORY_API_PREFIX = '/api/dsh-memory';
export const MEMORY_ITEMS_PATH = MEMORY_API_PREFIX + '/items';
export const MEMORY_PENDING_PATH = MEMORY_API_PREFIX + '/pending';
const MAX_BODY_BYTES = 256 * 1024;
/** Loopback + same-origin fence; memory is never a LAN API. */
export function isTrustedMemoryRequest(request) {
    const address = request.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL('http://' + host);
    }
    catch {
        return false;
    }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostUrl.hostname))
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
function writeJson(response, status, value) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
    });
    response.end(JSON.stringify(value));
}
async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += part.length;
        if (size > MAX_BODY_BYTES)
            return undefined;
        chunks.push(part);
    }
    try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value
            : undefined;
    }
    catch {
        return undefined;
    }
}
function genericErrorCode(error) {
    if (error instanceof MemoryValidationError)
        return error.code;
    if (error instanceof MemoryAccessError)
        return error.code;
    if (error instanceof MemoryNotFoundError)
        return 'not-found';
    if (error instanceof MemoryStoreError)
        return 'store-unavailable';
    return 'request-failed';
}
function localContext(service, url) {
    const scope = service.desktopScope();
    if (scope === undefined)
        return undefined;
    const workspaceId = url.searchParams.get('workspaceId') ?? undefined;
    const sessionId = url.searchParams.get('sessionId') ?? undefined;
    return service.contextFor(scope, {
        ...(workspaceId === undefined ? {} : { workspaceId }),
        ...(sessionId === undefined ? {} : { sessionId }),
    });
}
function draftFromBody(body) {
    const scope = body.scope;
    const content = body.content;
    if (!isMemoryScope(scope) || typeof content !== 'string')
        return undefined;
    const tags = body.tags;
    if (tags !== undefined && (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')))
        return undefined;
    const pinned = body.pinned;
    if (pinned !== undefined && typeof pinned !== 'boolean')
        return undefined;
    const expiresAt = body.expiresAt;
    if (expiresAt !== undefined && (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt)))
        return undefined;
    const id = body.id;
    if (id !== undefined && typeof id !== 'string')
        return undefined;
    const workspaceId = body.workspaceId;
    if (workspaceId !== undefined && typeof workspaceId !== 'string')
        return undefined;
    const sessionId = body.sessionId;
    if (sessionId !== undefined && typeof sessionId !== 'string')
        return undefined;
    return {
        ...(id === undefined ? {} : { id }),
        scope,
        ...(workspaceId === undefined ? {} : { workspaceId }),
        ...(sessionId === undefined ? {} : { sessionId }),
        content,
        ...(tags === undefined ? {} : { tags }),
        ...(pinned === undefined ? {} : { pinned }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
    };
}
export function makeMemoryRoutes(options) {
    const { service } = options;
    const handler = async (request, response) => {
        if (!isTrustedMemoryRequest(request)) {
            writeJson(response, 403, { ok: false, code: 'forbidden' });
            return;
        }
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const pathname = url.pathname;
        const context = localContext(service, url);
        if (context === undefined) {
            writeJson(response, 503, { ok: false, code: 'scope-unavailable' });
            return;
        }
        if (request.method === 'GET' && pathname === MEMORY_ITEMS_PATH) {
            const query = url.searchParams.get('q') ?? '';
            const result = query.trim() === ''
                ? await service.list(context)
                : await service.search(context, query);
            if (!result.ok) {
                writeJson(response, 503, { ok: false, code: result.warning.code });
                return;
            }
            const items = result.value.map(value => 'item' in value ? value.item : value);
            writeJson(response, 200, { ok: true, items: items.map(toPublicMemoryItem) });
            return;
        }
        if (request.method === 'GET' && pathname === MEMORY_PENDING_PATH) {
            writeJson(response, 200, {
                ok: true,
                items: service.listPending(context).map(entry => ({
                    id: entry.id,
                    item: entry.item,
                    createdAt: entry.createdAt,
                })),
            });
            return;
        }
        if (request.method !== 'POST') {
            writeJson(response, 405, { ok: false, code: 'method-not-allowed' });
            return;
        }
        const body = await readBody(request);
        if (body === undefined) {
            writeJson(response, 400, { ok: false, code: 'invalid-json' });
            return;
        }
        if (pathname === MEMORY_ITEMS_PATH) {
            const operation = body.operation;
            try {
                if (operation === 'save') {
                    const draft = draftFromBody(body);
                    if (draft === undefined) {
                        writeJson(response, 400, { ok: false, code: 'invalid' });
                        return;
                    }
                    const item = await service.save(context, draft);
                    writeJson(response, 200, { ok: true, item: toPublicMemoryItem(item) });
                    return;
                }
                if (operation === 'remove') {
                    if (typeof body.id !== 'string') {
                        writeJson(response, 400, { ok: false, code: 'invalid' });
                        return;
                    }
                    writeJson(response, 200, { ok: true, removed: await service.remove(context, body.id) });
                    return;
                }
                if (operation === 'clear') {
                    await service.clear(context);
                    writeJson(response, 200, { ok: true });
                    return;
                }
                writeJson(response, 400, { ok: false, code: 'invalid-operation' });
            }
            catch (error) {
                writeJson(response, 400, { ok: false, code: genericErrorCode(error) });
            }
            return;
        }
        const pendingPrefix = MEMORY_PENDING_PATH + '/';
        if (pathname.startsWith(pendingPrefix)) {
            let id;
            try {
                id = decodeURIComponent(pathname.slice(pendingPrefix.length));
            }
            catch {
                writeJson(response, 400, { ok: false, code: 'invalid-target' });
                return;
            }
            try {
                if (body.operation === 'confirm') {
                    const item = await service.confirm(context, id);
                    writeJson(response, 200, { ok: true, item: toPublicMemoryItem(item) });
                    return;
                }
                if (body.operation === 'cancel') {
                    writeJson(response, 200, { ok: true, cancelled: service.cancel(context, id) });
                    return;
                }
            }
            catch (error) {
                writeJson(response, 400, { ok: false, code: genericErrorCode(error) });
                return;
            }
            writeJson(response, 400, { ok: false, code: 'invalid-operation' });
            return;
        }
        writeJson(response, 404, { ok: false, code: 'not-found' });
    };
    return [{ kind: 'prefix', path: MEMORY_API_PREFIX, handler }];
}
