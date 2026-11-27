import { asObject, McpAppError, MCP_APP_PROTOCOL, MCP_APP_TIMEOUT, } from "../core/mcp-apps.js";
const MAX_PARAMS_CHARACTERS = 120 * 1024;
const TEARDOWN_ID = 'dsh-host:teardown';
const TEARDOWN_TIMEOUT = 250;
function toId(value) {
    if ((typeof value === 'number' && Number.isSafeInteger(value)) || (typeof value === 'string' && value.length > 0 && value.length <= 128))
        return value;
}
function requiredString(value) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 4096)
        return value;
    throw new McpAppError(-32602, 'Invalid params');
}
function displayModes(value) {
    const modes = asObject(value)?.availableDisplayModes;
    return Array.isArray(modes) ? modes.filter(item => item === 'inline' || item === 'fullscreen' || item === 'pip') : undefined;
}
function validParams(value) {
    if (value === undefined)
        return true;
    if (!asObject(value))
        return false;
    try {
        return JSON.stringify(value).length <= MAX_PARAMS_CHARACTERS;
    }
    catch {
        return false;
    }
}
function timed(run, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        run.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}
export function createMcpAppProtocol(options) {
    let phase = 'new';
    let hostContext = options.hostContext;
    let allowedDisplayModes;
    const seen = new Set();
    const pending = new Map();
    let closing;
    const closed = () => phase === 'disposed';
    const send = (message) => {
        if (!closed())
            options.send({ jsonrpc: '2.0', ...message });
    };
    const notify = (method, params) => send({ method, params });
    async function dispatch(method, params, signal) {
        if (method === 'ping')
            return {};
        if (method === 'ui/initialize') {
            if (phase !== 'new')
                throw new McpAppError(-32600, 'App already initialized');
            if (typeof params.protocolVersion !== 'string')
                throw new McpAppError(-32602, 'Protocol version is required');
            allowedDisplayModes = displayModes(params.appCapabilities);
            phase = 'initializing';
            return {
                protocolVersion: MCP_APP_PROTOCOL,
                hostInfo: { name: 'DeepSeek Harness Desktop', version: '5.7.0' },
                hostCapabilities: {
                    openLinks: {}, serverTools: {}, serverResources: {},
                    sandbox: { csp: options.network ?? { connectDomains: [], resourceDomains: [] } },
                },
                hostContext,
            };
        }
        if (phase !== 'ready')
            throw new McpAppError(-32000, 'App is not initialized');
        switch (method) {
            case 'tools/call':
            case 'ui/callServerTool': {
                const args = params.arguments === undefined ? {} : asObject(params.arguments);
                if (!args)
                    throw new McpAppError(-32602, 'Invalid tool arguments');
                return options.call(requiredString(params.name), args, signal);
            }
            case 'resources/read': return options.read(requiredString(params.uri), signal);
            case 'ui/update-model-context':
            case 'ui/updateModelContext': return options.context(params, signal);
            case 'ui/open-link':
            case 'ui/openLink': return options.openLink(requiredString(params.url), signal);
            case 'ui/message': return options.message(params, signal);
            case 'ui/request-display-mode': {
                const mode = params.mode;
                if (mode !== 'inline' && mode !== 'fullscreen' && mode !== 'pip')
                    throw new McpAppError(-32602, 'Invalid display mode');
                return { mode: allowedDisplayModes?.includes(mode) === false ? hostContext.displayMode ?? 'inline' : options.display(mode) };
            }
            default: throw new McpAppError(-32601, 'Method not found');
        }
    }
    return {
        async receive(data) {
            const value = asObject(data);
            if (closed() || value?.jsonrpc !== '2.0')
                return;
            if (closing) {
                if (value.id === TEARDOWN_ID && value.method === undefined && (Object.hasOwn(value, 'result') || Object.hasOwn(value, 'error'))) {
                    closing.finish();
                }
                return;
            }
            if (typeof value.method !== 'string' || value.method.length > 128)
                return;
            const { method } = value;
            const params = asObject(value.params) ?? {};
            const id = toId(value.id);
            if (id === undefined) {
                if (Object.hasOwn(value, 'id'))
                    return;
                if (method === 'notifications/message' && params.level === 'error' && params.logger === 'dsh-app-script'
                    && typeof params.data === 'string') {
                    options.scriptFailed?.(params.data.slice(0, 600));
                    return;
                }
                if (method === 'ui/notifications/initialized' && phase === 'initializing') {
                    phase = 'ready';
                    options.initialized?.();
                    notify('ui/notifications/tool-input', { arguments: options.input });
                    notify('ui/notifications/tool-result', options.result);
                    return;
                }
                if (method === 'notifications/cancelled') {
                    const target = toId(params.requestId);
                    if (target !== undefined)
                        pending.get(target)?.abort();
                    return;
                }
                if (phase === 'ready' && (method === 'ui/notifications/size-changed' || method === 'ui/sizeChanged')) {
                    const { height } = params;
                    if (typeof height === 'number' && Number.isFinite(height))
                        options.resize(Math.max(72, Math.min(3200, Math.round(height))));
                }
                if (phase === 'ready' && method === 'ui/notifications/request-teardown')
                    options.teardownRequested?.();
                return;
            }
            if (seen.has(id))
                return;
            if (seen.size >= 4096 || pending.size >= 32) {
                send({ id, error: { code: -32000, message: 'App request limit exceeded' } });
                return;
            }
            seen.add(id);
            const controller = new AbortController();
            pending.set(id, controller);
            const timer = setTimeout(() => controller.abort(new McpAppError(-32000, 'App request timed out')), MCP_APP_TIMEOUT);
            try {
                if (!validParams(value.params))
                    throw new McpAppError(-32602, 'Invalid params');
                const result = await timed(dispatch(method, params, controller.signal), controller.signal);
                send({ id, result: result ?? {} });
            }
            catch (error) {
                if (!controller.signal.aborted || controller.signal.reason instanceof McpAppError) {
                    send({ id, error: error instanceof McpAppError ? { code: error.code, message: error.message } : { code: -32000, message: 'App request failed' } });
                }
            }
            finally {
                clearTimeout(timer);
                pending.delete(id);
            }
        },
        setHostContext(next) {
            hostContext = next;
            if (phase === 'ready' && !closing)
                notify('ui/notifications/host-context-changed', { ...next });
        },
        canDisplay(mode) { return allowedDisplayModes?.includes(mode) ?? true; },
        teardown(reason) {
            if (closing)
                return closing.wait;
            if (phase !== 'ready')
                return Promise.resolve();
            const { promise, resolve } = Promise.withResolvers();
            const finish = () => { clearTimeout(timer); resolve(); };
            const timer = setTimeout(finish, TEARDOWN_TIMEOUT);
            closing = { wait: promise, finish };
            for (const controller of pending.values())
                controller.abort();
            send({ id: TEARDOWN_ID, method: 'ui/resource-teardown', params: { reason } });
            return promise;
        },
        dispose() {
            phase = 'disposed';
            closing?.finish();
            for (const controller of pending.values())
                controller.abort();
            pending.clear();
        },
    };
}
