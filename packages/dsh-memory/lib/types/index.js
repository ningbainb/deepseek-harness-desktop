import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { carrierKeyOf } from '@deepseek-ai/dsh-scope';
import z from 'schemastery';
import { DEFAULT_MEMORY_CONFIG, normalizeMemoryConfig, assertMemoryConfig, } from "./core/config.js";
import { MEMORY_SETTINGS_NAMESPACE } from "./core/schema.js";
import { MemoryService, } from "./core/service.js";
import { MEMORY_PROMPT_SECTION_TEMPLATE, renderMemoryItems, } from "./core/rank.js";
import { extractCurrentUserQuery } from "./core/query.js";
import { createMemoryTool } from "./tools.js";
import { makeMemoryRoutes } from "./routes.js";
export const name = 'memory';
export const inject = ['systemPrompt', 'sessions', 'userScope', 'tools'];
export * from "./core/config.js";
export * from "./core/schema.js";
export * from "./core/rank.js";
export * from "./core/query.js";
export * from "./core/service.js";
export { MemoryStore, MemoryStoreError } from "./store.js";
export { makeMemoryRoutes, MEMORY_API_PREFIX } from "./routes.js";
export { createMemoryTool } from "./tools.js";
export const Config = z.object({
    version: z.number().step(1).default(1),
    enabled: z.boolean().default(false),
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
    let source = () => initialConfig;
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
        return service.contextFor(entry.scope, { sessionId: String(session.id) });
    };
    const hydrate = async (entry) => {
        try {
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
        const entry = { session, scope: copyScope(scope) };
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
    ctx.on('session/event', function (session) {
        const entry = sessionsById.get(String(session.id));
        if (entry !== undefined)
            void hydrate(entry);
    });
    // Sessions already live when the plugin is mounted are registered for
    // ownership. Prompt injection still requires an actual scoped carrier key.
    for (const session of ctx.sessions.list())
        rememberSession(undefined, session);
    installSettingsSection(ctx, settingsNamespace(MEMORY_SETTINGS_NAMESPACE), Config, initialConfig, {
        setSource: next => { source = next; },
        onChange: () => { },
        validate: value => { assertMemoryConfig(value); },
    });
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
    })), 'memory: model tool');
    ctx.inject(['webServer'], webCtx => {
        const routes = makeMemoryRoutes({
            service,
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
            if (!currentConfig().enabled || scope === undefined)
                return '';
            const entry = sessionScopes.get(scope);
            if (entry === undefined)
                return '';
            const memoryContext = service.contextFor(entry.scope, { sessionId: String(entry.session.id) });
            if (memoryContext === undefined)
                return '';
            const ranked = service.searchCached(memoryContext, extractCurrentUserQuery(entry.session));
            return ranked === undefined ? '' : renderMemoryItems(ranked);
        }
        catch {
            return '';
        }
    }
}
