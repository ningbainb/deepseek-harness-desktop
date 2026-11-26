import { getHostService, } from "./core/host-types.js";
import { ROUTE_PREFIX, defaultSettings, } from "./core/settings.js";
import { readSettings, resolveDshHome, writeSettingsAtomic } from "./host/settings-store.js";
import { FastOpsController } from "./host/tool-registry.js";
export { INLINE_BYTE_OPTIONS, PACKAGE_ID, ROUTE_PREFIX, SETTINGS_FILE, TTL_MS_OPTIONS, defaultSettings, normalizeSettings, } from "./core/settings.js";
export { readSettings, resolveDshHome, writeSettingsAtomic } from "./host/settings-store.js";
export { resolveSafeWorkspacePath, sha256Hex } from "./host/workspace-path.js";
export { ResultCache } from "./host/result-cache.js";
export { buildCompactDiff, diffPreview, editFilesBatch, parseDelimitedTable, readFilesBatch, readTableFile, replaceAcrossFiles, searchWorkspace, statFile, } from "./host/file-ops.js";
export { ALL_FAST_OPS_TOOLS, FastOpsController, RESIDENT_TOOLS, SPECIALIZED_TOOLS, } from "./host/tool-registry.js";
function sendJson(response, status, body) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
}
async function readJsonBody(request) {
    const chunks = [];
    let total = 0;
    if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === 'function') {
        for await (const chunk of request) {
            const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
            total += buf.byteLength;
            if (total > 64 * 1024)
                throw new Error('request body too large');
            chunks.push(buf);
        }
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    return text === '' ? {} : JSON.parse(text);
}
function isAuthorizedRequest(ctx, request, peer) {
    const addr = request.socket?.remoteAddress;
    if (addr !== undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr))
        return false;
    if (request.headers['x-dsh-fast-ops'] !== '1')
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    if (peer?.principal?.kind !== undefined && peer.principal.kind !== 'owner')
        return false;
    const userScope = getHostService(ctx, 'userScope');
    if (userScope?.currentScope) {
        const current = userScope.currentScope();
        const scope = userScope.desktopScope?.();
        if (current?.source !== undefined && current.source !== 'desktop')
            return false;
        if (current !== undefined && scope !== undefined && current.principalId !== scope.principalId)
            return false;
    }
    return true;
}
export function apply(ctx) {
    const home = resolveDshHome();
    let cachedSettings = defaultSettings();
    const controller = new FastOpsController({
        ctx,
        getSettings: () => cachedSettings,
    });
    void readSettings(home).then((loaded) => {
        cachedSettings = loaded;
        controller.reapply();
    }).catch(() => { });
    const handleRequest = async (request, response, peer) => {
        if (!isAuthorizedRequest(ctx, request, peer)) {
            sendJson(response, 403, { error: 'forbidden' });
            return;
        }
        const url = new URL(request.url ?? '/', 'http://localhost');
        const method = (request.method ?? 'GET').toUpperCase();
        try {
            if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/state`) {
                sendJson(response, 200, {
                    settings: cachedSettings,
                    counters: controller.counters,
                    cache: controller.cache.stats(),
                });
                return;
            }
            if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/settings`) {
                cachedSettings = await readSettings(home);
                sendJson(response, 200, { settings: cachedSettings });
                return;
            }
            if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/settings`) {
                const body = await readJsonBody(request);
                const saved = await writeSettingsAtomic(body, home);
                cachedSettings = saved.settings;
                controller.reapply();
                sendJson(response, 200, saved);
                return;
            }
            if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/cache/reclaim`) {
                const reclaimed = controller.cache.reclaimAll();
                sendJson(response, 200, { reclaimed, cache: controller.cache.stats() });
                return;
            }
            sendJson(response, 404, { error: 'not-found' });
        }
        catch (error) {
            sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
    };
    ctx.effect(() => controller.mount());
    const mountWebServer = (webServer) => {
        if (typeof webServer.register === 'function') {
            return webServer.register({ path: ROUTE_PREFIX, kind: 'prefix', handler: handleRequest }) ?? (() => { });
        }
        const routes = [
            ['GET', `${ROUTE_PREFIX}/state`],
            ['GET', `${ROUTE_PREFIX}/settings`],
            ['POST', `${ROUTE_PREFIX}/settings`],
            ['POST', `${ROUTE_PREFIX}/cache/reclaim`],
        ];
        const stops = routes.map(([method, path]) => webServer.route?.(method, path, handleRequest)).filter((d) => typeof d === 'function');
        return () => { for (const stop of stops)
            stop(); };
    };
    const existingWebServer = getHostService(ctx, 'webServer');
    if (existingWebServer) {
        ctx.effect(() => mountWebServer(existingWebServer));
    }
    else if (typeof ctx.inject === 'function') {
        ctx.inject(['webServer'], (scoped) => {
            const ws = scoped?.webServer ?? getHostService(ctx, 'webServer');
            if (!ws)
                return;
            return mountWebServer(ws);
        });
    }
}
