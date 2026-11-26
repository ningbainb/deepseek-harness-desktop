import { getHostService, } from "./core/host-types.js";
import { CHANNEL_IDS, ROUTE_PREFIX, defaultSettings, } from "./core/settings.js";
import { ImHubManager } from "./host/hub.js";
import { readSettings, resolveDshHome, writeSettingsAtomic } from "./host/settings-store.js";
export { CHANNEL_IDS, PACKAGE_ID, ROUTE_PREFIX, SECRET_MASK, SETTINGS_FILE, defaultAccessPolicy, defaultSettings, normalizeSettings, redactSettingsForClient, } from "./core/settings.js";
export { readSettings, resolveDshHome, writeSettingsAtomic } from "./host/settings-store.js";
export { evaluateAccess, isApprovalAuthorized } from "./host/core/access-policy.js";
export { ConversationQueue } from "./host/core/conversation-queue.js";
export { formatHelpMessage, parseControlCommand, splitMessageChunks } from "./host/core/commands.js";
export { ApprovalBridge, summarizeToolRequest } from "./host/core/approval-bridge.js";
export { HarnessBridge, buildConversationKey } from "./host/core/harness-bridge.js";
export { FeishuAdapter, extractFeishuTextContent, resolveFeishuBaseUrl } from "./host/channels/feishu.js";
export { DingTalkAdapter } from "./host/channels/dingtalk.js";
export { WeComAdapter, computeWeComSignature, decryptWeComPayload, encryptWeComPayload, extractXmlTag, verifyWeComSignature, } from "./host/channels/wecom.js";
export { GenericWebhookAdapter, signWebhookPayload, verifyWebhookSignature, } from "./host/channels/webhook.js";
export { ImHubManager } from "./host/hub.js";
function sendJson(response, status, body) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
}
async function readTextBody(request, maxBytes = 256 * 1024) {
    const chunks = [];
    let total = 0;
    if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === 'function') {
        for await (const chunk of request) {
            const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
            total += buf.byteLength;
            if (total > maxBytes)
                throw new Error('request body too large');
            chunks.push(buf);
        }
    }
    return Buffer.concat(chunks).toString('utf8');
}
function isAuthorizedAdminRequest(ctx, request, peer) {
    const addr = request.socket?.remoteAddress;
    if (addr !== undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr))
        return false;
    if (request.headers['x-dsh-im-hub'] !== '1')
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
function isChannelId(value) {
    return typeof value === 'string' && CHANNEL_IDS.includes(value);
}
export function apply(ctx, options = {}) {
    const home = options.home ?? resolveDshHome();
    const hub = new ImHubManager({
        ctx,
        initialSettings: options.initialSettings ?? defaultSettings(),
        fetchImpl: options.fetchImpl,
        webSocketFactory: options.webSocketFactory,
        turnRunner: options.turnRunner,
        nowMs: options.nowMs,
    });
    if (!options.initialSettings) {
        void readSettings(home)
            .then((loaded) => hub.applySettings(loaded))
            .catch(() => { });
    }
    else {
        void hub.applySettings(options.initialSettings).catch(() => { });
    }
    const handleRequest = async (request, response, peer) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const method = (request.method ?? 'GET').toUpperCase();
        // External inbound IM webhook routes use their own cryptographic signature verification.
        if (url.pathname === `${ROUTE_PREFIX}/webhook/wecom`) {
            try {
                const rawBody = method === 'GET' ? '' : await readTextBody(request);
                const out = await hub.handleWebhook('wecom', {
                    method,
                    url: request.url ?? url.pathname,
                    headers: request.headers,
                    rawBody,
                });
                response.writeHead(out.status, {
                    'cache-control': 'no-store',
                    ...(out.headers ?? { 'content-type': 'text/plain; charset=utf-8' }),
                });
                response.end(out.body);
            }
            catch (error) {
                sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
            }
            return;
        }
        if (url.pathname === `${ROUTE_PREFIX}/webhook/generic`) {
            try {
                const rawBody = await readTextBody(request);
                const out = await hub.handleWebhook('webhook', {
                    method,
                    url: request.url ?? url.pathname,
                    headers: request.headers,
                    rawBody,
                });
                response.writeHead(out.status, {
                    'cache-control': 'no-store',
                    ...(out.headers ?? { 'content-type': 'application/json; charset=utf-8' }),
                });
                response.end(out.body);
            }
            catch (error) {
                sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
            }
            return;
        }
        if (!isAuthorizedAdminRequest(ctx, request, peer)) {
            sendJson(response, 403, { error: 'forbidden' });
            return;
        }
        try {
            if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/state`) {
                sendJson(response, 200, hub.getStateSnapshot());
                return;
            }
            if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/settings`) {
                const loaded = await readSettings(home);
                await hub.applySettings(loaded);
                sendJson(response, 200, { settings: hub.getStateSnapshot().settings });
                return;
            }
            if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/settings`) {
                const rawText = await readTextBody(request);
                const body = rawText.trim() === '' ? {} : JSON.parse(rawText);
                const saved = await writeSettingsAtomic(body, home);
                await hub.applySettings(saved.settings);
                sendJson(response, 200, {
                    settings: hub.getStateSnapshot().settings,
                    problems: saved.problems,
                });
                return;
            }
            if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/channel/test`) {
                const rawText = await readTextBody(request);
                const body = (rawText.trim() === '' ? {} : JSON.parse(rawText));
                if (!isChannelId(body.channel)) {
                    sendJson(response, 400, { error: 'invalid channel' });
                    return;
                }
                const result = await hub.testChannel(body.channel);
                sendJson(response, 200, result);
                return;
            }
            if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/channel/restart`) {
                const rawText = await readTextBody(request);
                const body = (rawText.trim() === '' ? {} : JSON.parse(rawText));
                if (!isChannelId(body.channel)) {
                    sendJson(response, 400, { error: 'invalid channel' });
                    return;
                }
                const status = await hub.restartChannel(body.channel);
                sendJson(response, 200, { status });
                return;
            }
            if (method === 'POST' && url.pathname === `${ROUTE_PREFIX}/approvals/decision`) {
                const rawText = await readTextBody(request);
                const body = (rawText.trim() === '' ? {} : JSON.parse(rawText));
                if (typeof body.id !== 'string'
                    || (body.decision !== 'allowed-once' && body.decision !== 'rejected')) {
                    sendJson(response, 400, { error: 'invalid decision' });
                    return;
                }
                const accepted = hub.approvalBridge.resolveById(body.id, body.decision);
                sendJson(response, accepted ? 200 : 409, { accepted });
                return;
            }
            sendJson(response, 404, { error: 'not-found' });
        }
        catch (error) {
            sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
    };
    ctx.effect(() => hub.install(ctx));
    const mountWebServer = (webServer) => {
        if (typeof webServer.register === 'function') {
            return webServer.register({ path: ROUTE_PREFIX, kind: 'prefix', handler: handleRequest }) ?? (() => { });
        }
        const routes = [
            ['GET', `${ROUTE_PREFIX}/state`],
            ['GET', `${ROUTE_PREFIX}/settings`],
            ['POST', `${ROUTE_PREFIX}/settings`],
            ['POST', `${ROUTE_PREFIX}/channel/test`],
            ['POST', `${ROUTE_PREFIX}/channel/restart`],
            ['POST', `${ROUTE_PREFIX}/approvals/decision`],
            ['GET', `${ROUTE_PREFIX}/webhook/wecom`],
            ['POST', `${ROUTE_PREFIX}/webhook/wecom`],
            ['POST', `${ROUTE_PREFIX}/webhook/generic`],
        ];
        const stops = routes
            .map(([method, path]) => webServer.route?.(method, path, handleRequest))
            .filter((d) => typeof d === 'function');
        return () => {
            for (const stop of stops)
                stop();
        };
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
    return hub;
}
