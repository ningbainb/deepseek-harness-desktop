import { defineTool } from '@deepseek-ai/dsh-tools';
import { MemoryAccessError, MemoryNotFoundError, } from "./core/service.js";
import { extractCurrentUserQuery } from "./core/query.js";
import { toPublicMemoryItem } from "./core/schema.js";
function text(value) {
    return [{ type: 'text', text: value }];
}
const publicItemSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        scope: { type: 'string', enum: ['global', 'workspace', 'session'], required: true },
        workspaceId: { type: 'string' },
        sessionId: { type: 'string' },
        content: { type: 'string', required: true },
        tags: { type: 'array', items: { type: 'string' }, required: true },
        pinned: { type: 'boolean', required: true },
        source: { type: 'string', enum: ['explicit', 'confirmed-suggestion'], required: true },
        createdAt: { type: 'integer', required: true },
        updatedAt: { type: 'integer', required: true },
        expiresAt: { type: 'integer' },
    },
};
function genericErrorCode(error) {
    if (error instanceof MemoryAccessError)
        return error.code;
    if (error instanceof MemoryNotFoundError)
        return 'not-found';
    if (error instanceof Error && error.name === 'MemoryValidationError') {
        return 'invalid';
    }
    return 'store-unavailable';
}
function draftFromArgs(args, context) {
    if (typeof args.content !== 'string' || args.content.trim() === '')
        return undefined;
    const scope = args.scope ?? 'global';
    if (scope === 'workspace') {
        if (context.workspaceId === undefined || (args.workspaceId !== undefined && args.workspaceId !== context.workspaceId))
            return undefined;
        return {
            scope,
            workspaceId: context.workspaceId,
            content: args.content,
            ...(args.tags === undefined ? {} : { tags: args.tags }),
            ...(args.pinned === undefined ? {} : { pinned: args.pinned }),
            ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
        };
    }
    if (scope === 'session') {
        if (context.sessionId === undefined || (args.sessionId !== undefined && args.sessionId !== context.sessionId))
            return undefined;
        return {
            scope,
            sessionId: context.sessionId,
            content: args.content,
            ...(args.tags === undefined ? {} : { tags: args.tags }),
            ...(args.pinned === undefined ? {} : { pinned: args.pinned }),
            ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
        };
    }
    if (args.workspaceId !== undefined || args.sessionId !== undefined)
        return undefined;
    return {
        scope: 'global',
        content: args.content,
        ...(args.tags === undefined ? {} : { tags: args.tags }),
        ...(args.pinned === undefined ? {} : { pinned: args.pinned }),
        ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
    };
}
function searchText(items) {
    if (items.length === 0)
        return 'memory search returned no matching items';
    return items.map(item => '- ' + item.content).join('\n');
}
/** Model-facing search/suggestion tool; it has no direct persistence operation. */
export function createMemoryTool(service, options) {
    return defineTool({
        name: 'memory',
        description: 'Search owner-isolated memory for the current direct user turn, or propose a memory for user confirmation. Search ignores model-supplied query text and reads only direct user text from the current turn. The model cannot save memory directly; use operation suggest and wait for user confirmation. Never store credentials, passwords, tokens, cookies, authorization headers, or private keys.',
        parameters: {
            operation: { type: 'string', enum: ['search', 'suggest'], required: true },
            query: { type: 'string', description: 'Ignored for security; the Host derives search text from the current direct user turn.' },
            content: { type: 'string', description: 'The proposed fact for suggest; it remains pending until the user confirms it.' },
            tags: { type: 'array', items: { type: 'string' } },
            pinned: { type: 'boolean' },
            scope: { type: 'string', enum: ['global', 'workspace', 'session'] },
            workspaceId: { type: 'string', description: 'Must match the current session workspace when scope is workspace.' },
            sessionId: { type: 'string', description: 'Must match the current session when scope is session.' },
            expiresAt: { type: 'integer', description: 'Optional expiration time in Unix milliseconds.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    success: { type: 'boolean', required: true },
                    operation: { type: 'string', enum: ['search', 'suggest'], required: true },
                    items: { type: 'array', items: publicItemSchema, required: true },
                    pendingId: { type: 'string' },
                    errorCode: { type: 'string' },
                },
            },
            render: (_args, value) => {
                if (!value.success)
                    return text('memory operation unavailable');
                if (value.operation === 'search')
                    return text(searchText(value.items));
                return text('memory suggestion is pending user confirmation');
            },
        },
        async execute(args, exec) {
            if (!options.enabled()) {
                return { success: false, operation: args.operation, items: [], errorCode: 'disabled' };
            }
            const session = exec.agent?.session;
            if (session === undefined) {
                return { success: false, operation: args.operation, items: [], errorCode: 'access-denied' };
            }
            const context = options.contextForSession?.(session) ?? service.contextForCurrentSession(String(session.id));
            if (context === undefined) {
                return { success: false, operation: args.operation, items: [], errorCode: 'access-denied' };
            }
            if (args.operation === 'search') {
                const result = await service.search(context, extractCurrentUserQuery(session));
                if (!result.ok)
                    return { success: false, operation: args.operation, items: [], errorCode: result.warning.code };
                return {
                    success: true,
                    operation: args.operation,
                    items: service.toPublic(result.value.map(candidate => candidate.item)),
                };
            }
            const draft = draftFromArgs(args, context);
            if (draft === undefined)
                return { success: false, operation: args.operation, items: [], errorCode: 'invalid' };
            try {
                const pending = service.suggest(context, draft);
                return {
                    success: true,
                    operation: args.operation,
                    items: [],
                    pendingId: pending.id,
                };
            }
            catch (error) {
                return { success: false, operation: args.operation, items: [], errorCode: genericErrorCode(error) };
            }
        },
    });
}
export { toPublicMemoryItem };
