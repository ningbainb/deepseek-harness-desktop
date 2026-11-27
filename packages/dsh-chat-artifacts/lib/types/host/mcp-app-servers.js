import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { z } from 'zod';
import { asObject, MCP_APP_MIME, MCP_APP_TIMEOUT } from "../core/mcp-apps.js";
import { boundedMcpResult, McpAppsBridge, mcpToolVisibility } from "./mcp-app-bridge.js";
import { registerMcpAppRoutes } from "./mcp-app-routes.js";
const MAX_SERVERS = 8;
const MAX_TOOLS = 256;
const scalar = z.string().max(4096);
const allow = { readOnlyTools: z.array(scalar).max(MAX_TOOLS).optional() };
const serverSchema = z.discriminatedUnion('transport', [
    z.object({
        transport: z.literal('stdio'), command: scalar.min(1), args: z.array(scalar).max(64).optional(),
        cwd: scalar.optional(), env: z.record(z.string(), scalar).optional(), ...allow,
    }).strict(),
    z.object({
        transport: z.literal('streamable-http'), url: scalar.min(1),
        headers: z.record(z.string(), scalar).optional(), ...allow,
    }).strict(),
]);
function publicToolName(server, name) {
    const full = 'mcp__' + server + '__' + name;
    if (/^[A-Za-z0-9_-]{1,64}$/u.test(full))
        return full;
    const suffix = createHash('sha256').update(JSON.stringify([server, name])).digest('hex').slice(0, 12);
    return full.replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 50) + '__' + suffix;
}
function isManagedServer(ctx, server) {
    const get = ctx;
    const manager = get.get('mcpManager');
    return manager?.list?.().some(item => item.name === server && item.configured !== false) === true;
}
function serverTransport(config) {
    if (config.transport === 'stdio') {
        return new StdioClientTransport({
            command: config.command, args: config.args, env: config.env, cwd: config.cwd,
            stderr: 'ignore', maxBufferSize: 3 * 1024 * 1024,
        });
    }
    const url = new URL(config.url);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.hash || !(url.protocol === 'https:' || loopback && url.protocol === 'http:')) {
        throw new Error('MCP App server must use HTTPS or a local HTTP endpoint');
    }
    return new StreamableHTTPClientTransport(url, { requestInit: { headers: config.headers } });
}
function modelText(value) {
    const wrapped = asObject(value);
    const content = asObject(wrapped?.result)?.content;
    if (!Array.isArray(content))
        return 'MCP tool returned no textual result.';
    const text = content.flatMap(item => {
        const part = asObject(item);
        return part?.type === 'text' && typeof part.text === 'string' ? [part.text] : [];
    }).join('\n');
    return text.trim() ? text : 'MCP tool returned structured content.';
}
function registerTool(ctx, bridge, provider, tool) {
    const output = {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: modelText(value) }],
        presentationMeta: (_args, value) => {
            const descriptor = asObject(value)?.mcpApp;
            return descriptor === undefined ? null : descriptor;
        },
    };
    const definition = {
        name: publicToolName(provider.server, tool.name),
        description: tool.description?.slice(0, 4096) ?? '',
        parameters: { ...tool.inputSchema, type: 'object' },
        output,
        async execute(input, execution) {
            if (!provider.active())
                throw new Error('MCP App server is disconnected');
            const args = asObject(input) ?? {};
            const result = boundedMcpResult(await provider.call(tool.name, args, execution.signal));
            if (result.isError === true)
                throw new Error(modelText({ result }).slice(0, 2048));
            const descriptor = await bridge.record(provider, tool, args, result, execution);
            return JSON.parse(JSON.stringify({ result, ...(descriptor ? { mcpApp: descriptor } : {}) }));
        },
    };
    return ctx.tools.register(definition);
}
async function openServer(ctx, bridge, server, config, lifecycle) {
    if (isManagedServer(ctx, server) || ctx.tools.definitions().some(tool => tool.name.startsWith('mcp__' + server + '__'))) {
        throw new Error('MCP App server name is already in use');
    }
    const client = new Client({ name: 'dsh-chat-artifacts', version: '0.1.0' }, {
        capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [MCP_APP_MIME] } } },
    });
    const transport = serverTransport(config);
    const syncSignal = () => AbortSignal.any([lifecycle, AbortSignal.timeout(MCP_APP_TIMEOUT)]);
    const registrations = [];
    let tools = new Map();
    let connected = false;
    const provider = {
        server,
        get tools() { return tools; },
        readOnlyTools: new Set(config.readOnlyTools),
        active: () => connected && !lifecycle.aborted,
        read: (uri, signal) => client.readResource({ uri }, {
            signal: AbortSignal.any([signal, lifecycle]), timeout: MCP_APP_TIMEOUT,
        }),
        call: (name, args, signal) => {
            if (!tools.has(name))
                throw new Error('MCP App tool is unavailable');
            return client.callTool({ name, arguments: args }, {
                signal: AbortSignal.any([signal, lifecycle]), timeout: MCP_APP_TIMEOUT,
            });
        },
        async close() {
            connected = false;
            for (const unregister of registrations.splice(0).reverse())
                unregister();
            tools = new Map();
            await client.close();
        },
    };
    const retire = () => { void provider.close().catch(() => { }); };
    lifecycle.addEventListener('abort', retire, { once: true });
    client.onclose = () => {
        connected = false;
        for (const unregister of registrations.splice(0).reverse())
            unregister();
    };
    client.onerror = () => { };
    try {
        lifecycle.throwIfAborted();
        await client.connect(transport, { signal: syncSignal(), timeout: MCP_APP_TIMEOUT });
        connected = true;
        if (client.getServerCapabilities()?.tools === undefined)
            return provider;
        const entries = (await client.listTools(undefined, { signal: syncSignal(), timeout: MCP_APP_TIMEOUT })).tools;
        if (entries.length > MAX_TOOLS)
            throw new Error('MCP App server exceeds the tool limit');
        for (const tool of entries) {
            if (tools.has(tool.name))
                throw new Error('MCP App server listed a duplicate tool');
            tools.set(tool.name, tool);
        }
        lifecycle.throwIfAborted();
        if (isManagedServer(ctx, server))
            throw new Error('MCP App server name is already in use');
        for (const tool of tools.values()) {
            if (mcpToolVisibility(tool, 'model'))
                registrations.push(registerTool(ctx, bridge, provider, tool));
        }
        return provider;
    }
    catch (error) {
        lifecycle.removeEventListener('abort', retire);
        await provider.close().catch(() => { });
        throw error;
    }
}
export function mountMcpApps(ctx, raw) {
    const configuration = asObject(raw);
    if (!configuration || Object.keys(configuration).length === 0)
        return;
    const servers = Object.entries(configuration);
    if (servers.length > MAX_SERVERS) {
        ctx.logger.warn('chat-artifacts: too many MCP App servers');
        return;
    }
    ctx.inject(['webServer', 'approval', 'userScope'], (scoped) => {
        const bridge = new McpAppsBridge(scoped);
        scoped.effect(() => registerMcpAppRoutes(scoped, bridge), 'chat-artifacts: MCP App routes');
        scoped.effect(() => scoped.systemPrompt.context({
            name: 'plugin:chat-artifacts:mcp-apps',
            order: 360,
            text: ({ session }) => bridge.modelContext(session?.id),
        }), 'chat-artifacts: MCP App context');
        scoped.effect(() => {
            const controller = new AbortController();
            for (const [server, rawServer] of servers) {
                const config = serverSchema.safeParse(rawServer);
                if (!/^[A-Za-z0-9_-]{1,32}$/u.test(server) || !config.success) {
                    scoped.logger.warn('chat-artifacts: invalid MCP App server configuration');
                    continue;
                }
                void openServer(scoped, bridge, server, config.data, controller.signal).catch(() => {
                    if (!controller.signal.aborted)
                        scoped.logger.warn('chat-artifacts: MCP App server %s did not connect', server);
                });
            }
            return () => controller.abort();
        }, 'chat-artifacts: MCP App server connections');
    });
}
