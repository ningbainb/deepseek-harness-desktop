import { carrierKeyOf } from '@deepseek-ai/dsh-scope';
import z from '@deepseek-ai/schemastery';
import { DEFAULT_MEMORY_CONFIG, normalizeMemoryConfig, } from "./core/config.js";
import { MemoryService, } from "./core/service.js";
import { MEMORY_PROMPT_SECTION_TEMPLATE, } from "./core/rank.js";
import { extractCurrentUserQuery, extractPendingUserQuery } from "./core/query.js";
import { MAX_MEMORY_QUERY_LENGTH } from "./core/schema.js";
import { createMemoryTool } from "./tools.js";
import { makeMemoryRoutes } from "./routes.js";
export const name = 'memory';
export const inject = ['systemPrompt', 'sessions', 'sessionQuery', 'userScope', 'tools'];
export * from "./core/config.js";
export * from "./core/schema.js";
export * from "./core/rank.js";
export * from "./core/query.js";
export * from "./core/service.js";
export { MemoryStore, MemoryStoreError } from "./store.js";
export { makeMemoryRoutes, MEMORY_API_PREFIX } from "./routes.js";
export { createMemoryTool } from "./tools.js";
export const Config = z.object({
    version: z.number().step(1).default(1).volatile(),
    enabled: z.boolean().default(false).volatile(),
});
function workspaceForSession(registry, sessionId) {
    try {
        return registry?.list().find(workspace => workspace.sessionIds.some(candidate => String(candidate) === sessionId))?.id;
    }
    catch {
        return undefined;
    }
}
function copyScope(scope) {
    return { ...scope };
}
/** Register owner-safe memory prompt, tool, settings and local routes. */
export function apply(ctx, initialConfig = { ...DEFAULT_MEMORY_CONFIG }) {
    const source = () => normalizeMemoryConfig(Object.fromEntries(Object.entries(initialConfig).map(([key, field]) => [key,
        typeof field === 'object' && field !== null && 'get' in field && typeof field.get === 'function'
            ? field.get() : field])));
    let workspaceRegistry;
    const userScope = ctx.userScope;
    const sessionScopes = new Map();
    const sessionsById = new Map();
    const currentConfig = () => {
        try {
            return normalizeMemoryConfig(source());
        }
        catch {
            return { ...DEFAULT_MEMORY_CONFIG };
        }
    };
    const service = new MemoryService({
        userScope,
        resolveWorkspaceForSession: sessionId => workspaceForSession(workspaceRegistry, sessionId),
        warningSink: warning => {
            // Structured diagnostics contain no memory content, identifiers, paths or
            // matched credential text. A failed memory operation never fails a model call.
            console.warn('memory: operation unavailable', warning);
        },
    });
    ctx.inject(['workspaceRegistry'], workspaceCtx => {
        workspaceRegistry = workspaceCtx.workspaceRegistry;
        return () => { workspaceRegistry = undefined; };
    });
    const contextForSession = (session) => {
        const entry = sessionsById.get(String(session.id));
        if (entry === undefined)
            return undefined;
        const liveScope = service.currentScope();
        if (liveScope === undefined || liveScope.principalId !== entry.scope.principalId
            || liveScope.source !== entry.scope.source || liveScope.deviceId !== entry.scope.deviceId)
            return undefined;
        return service.contextFor(entry.scope, { sessionId: String(session.id) });
    };
    const hydrate = async (entry) => {
        try {
            const snapshot = await ctx.sessionQuery.readSession(entry.session.id);
            entry.events = snapshot.events;
            const memoryContext = service.contextFor(entry.scope, { sessionId: String(entry.session.id) });
            if (memoryContext !== undefined)
                await service.preload(memoryContext);
        }
        catch {
            // User-scope and storage failures are fail-closed. The next lifecycle
            // event may retry; no memory text is logged here.
        }
    };
    const rememberSession = (key, session) => {
        const sessionId = String(session.id);
        let scope;
        try {
            scope = userScope.currentScope() ?? service.desktopScope();
        }
        catch {
            return;
        }
        if (scope === undefined)
            return;
        const entry = { session, scope: copyScope(scope), events: [] };
        sessionsById.set(sessionId, entry);
        if (key !== undefined)
            sessionScopes.set(key, entry);
        void hydrate(entry);
    };
    ctx.on('session/created', function (session) {
        rememberSession(carrierKeyOf(this), session);
    });
    ctx.on('session/disposed', function (session) {
        const sessionId = String(session.id);
        const entry = sessionsById.get(sessionId);
        if (entry?.session === session)
            sessionsById.delete(sessionId);
        const key = carrierKeyOf(this);
        if (key !== undefined && sessionScopes.get(key)?.session === session)
            sessionScopes.delete(key);
    });
    ctx.on('session/event', function (session, event) {
        const entry = sessionsById.get(String(session.id));
        if (entry !== undefined) {
            if (event.type === 'turn/end') {
                delete entry.pendingQuery;
                delete entry.pendingTurn;
            }
            entry.events = [...entry.events, event];
            void hydrate(entry);
        }
    });
    ctx.on('agent/created', async ({ agent }) => {
        const entry = sessionsById.get(String(agent.session.id));
        if (entry !== undefined)
            await hydrate(entry);
    });
    ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
        const entry = sessionsById.get(String(agent.session.id));
        if (entry === undefined)
            return;
        if (entry.pendingTurn !== turn)
            entry.pendingQuery = '';
        entry.pendingTurn = turn;
        // rc.3 assembles before pre-step admission and user/message commit.
        // Keep only claimed direct-user text; never change the durable log.
        entry.pendingQuery = [entry.pendingQuery, extractPendingUserQuery(agent.session.header, [message])]
            .filter(Boolean).join('\n').slice(0, MAX_MEMORY_QUERY_LENGTH);
    });
    ctx.on('system-prompt/assemble', async (assembly, context, next) => {
        const entry = context.scope === undefined ? undefined : sessionScopes.get(context.scope);
        if (entry !== undefined && currentConfig().enabled && contextForSession(entry.session) !== undefined)
            await hydrate(entry);
        const value = resolvedMemoryVariable(context.scope);
        // Populate our mutable registry presentation before downstream editors
        // capture it. Their subsequent filtering/replacement remains authoritative.
        for (const section of assembly.sections) {
            if (section.name === 'dsh:memory')
                section.text = value === '' ? '' : MEMORY_PROMPT_SECTION_TEMPLATE;
        }
        assembly.variables.dsh_memory = value;
        return next();
    }, { prepend: true });
    // Sessions already live when the plugin is mounted are registered for
    // ownership. Prompt injection still requires an actual scoped carrier key.
    for (const session of ctx.sessions.list())
        rememberSession(undefined, session);
    ctx.effect(() => {
        const disposeSection = ctx.systemPrompt.section({
            name: 'dsh:memory',
            order: 40,
            text: context => resolvedMemory(context.scope),
        });
        const disposeVariable = ctx.systemPrompt.variable('dsh_memory', context => resolvedMemoryVariable(context.scope));
        return () => {
            disposeVariable();
            disposeSection();
        };
    }, 'memory: system prompt contribution');
    ctx.effect(() => ctx.tools.register(createMemoryTool(service, {
        enabled: () => currentConfig().enabled,
        contextForSession,
        eventsForSession: async (session) => (await ctx.sessionQuery.readSession(session.id)).events,
    })), 'memory: model tool');
    ctx.inject(['webServer'], webCtx => {
        const routes = makeMemoryRoutes({
            service,
            enabled: () => currentConfig().enabled,
        });
        const disposers = routes.map(route => webCtx.webServer.register(route));
        return () => { for (const dispose of disposers)
            dispose(); };
    });
    function resolvedMemory(scope) {
        const value = resolvedMemoryVariable(scope);
        return value === '' ? '' : MEMORY_PROMPT_SECTION_TEMPLATE;
    }
    function resolvedMemoryVariable(scope) {
        try {
            if (scope === undefined)
                return '';
            const entry = sessionScopes.get(scope);
            if (entry === undefined)
                return '';
            const memoryContext = contextForSession(entry.session);
            if (memoryContext === undefined)
                return '';
            return service.prepare(memoryContext, entry.pendingQuery ?? extractCurrentUserQuery({
                header: entry.session.header,
                events: entry.events,
            }), currentConfig().enabled);
        }
        catch {
            return '';
        }
    }
}
