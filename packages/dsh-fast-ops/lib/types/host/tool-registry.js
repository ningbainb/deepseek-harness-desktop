import { getHostService, } from "../core/host-types.js";
import { diffPreview, editFilesBatch, readFilesBatch, readTableFile, replaceAcrossFiles, searchWorkspace, statFile, } from "./file-ops.js";
import { ResultCache } from "./result-cache.js";
export const RESIDENT_TOOLS = ['fast_read_files', 'fast_search', 'fast_edit_batch', 'fast_discover'];
export const SPECIALIZED_TOOLS = ['fast_stat', 'fast_diff', 'fast_replace', 'fast_read_table', 'fast_result'];
export const ALL_FAST_OPS_TOOLS = [...RESIDENT_TOOLS, ...SPECIALIZED_TOOLS];
const SPECIALIZED_CATALOG = {
    fast_stat: 'Inspect file/directory metadata, size, line count, binary status, and SHA-256 revision.',
    fast_diff: 'Preview unified line diff between current file and proposed content without writing.',
    fast_replace: 'Batch literal replacement across glob-matched files (dryRun defaults to true).',
    fast_read_table: 'Parse RFC-4180 CSV/TSV files with quoted fields, column projection, and row paging.',
    fast_result: 'Page, filter (equals), project (fields), or release cached ref:// overflow results.',
};
function sessionIdOf(agent) {
    return agent?.session?.id || agent?.id || 'default';
}
export class FastOpsController {
    cache;
    counters = {
        batchCalls: 0,
        filesReadInBatches: 0,
        cacheSpills: 0,
        toolsActivated: 0,
    };
    activated = new WeakMap();
    applied = new WeakMap();
    liveAgents = new Set();
    applying = false;
    ctx;
    getSettings;
    constructor(options) {
        this.ctx = options.ctx;
        this.getSettings = options.getSettings;
        this.cache = new ResultCache({ getMaxRefs: () => this.getSettings().maxCachedRefs });
    }
    resolveWorkspaceRoot(agent) {
        if (agent?.workspace?.path)
            return agent.workspace.path;
        if (agent?.cwd)
            return agent.cwd;
        const registry = getHostService(this.ctx, 'workspaceRegistry');
        try {
            const first = registry?.list?.()[0];
            if (first?.path)
                return first.path;
        }
        catch { }
        return process.cwd();
    }
    activatedSetFor(agent) {
        if (!agent || typeof agent !== 'object')
            return new Set();
        let set = this.activated.get(agent);
        if (!set) {
            set = new Set();
            this.activated.set(agent, set);
        }
        return set;
    }
    denyListFor(agent) {
        const settings = this.getSettings();
        if (!settings.enabled)
            return [...ALL_FAST_OPS_TOOLS];
        if (!settings.lazySpecializedTools)
            return ['fast_discover'];
        const revealed = this.activatedSetFor(agent);
        return SPECIALIZED_TOOLS.filter(name => !revealed.has(name));
    }
    releaseAgent(agent) {
        if (!agent || typeof agent !== 'object')
            return;
        const prev = this.applied.get(agent);
        if (!prev)
            return;
        this.applied.delete(agent);
        try {
            prev.dispose();
        }
        catch { }
    }
    applyToAgent(agent) {
        if (this.applying || !agent || typeof agent !== 'object')
            return;
        this.liveAgents.add(agent);
        this.applying = true;
        try {
            const scoped = agent.ctx?.get?.('tools') ?? agent.ctx?.tools;
            if (typeof scoped?.restrict !== 'function')
                return;
            const deny = this.denyListFor(agent);
            const key = deny.slice().sort().join(',');
            const prev = this.applied.get(agent);
            if (prev && prev.key === key)
                return;
            this.releaseAgent(agent);
            if (deny.length === 0)
                return;
            this.applied.set(agent, { key, dispose: scoped.restrict({ deny }) });
        }
        finally {
            this.applying = false;
        }
    }
    reapply(agent) {
        if (agent !== undefined) {
            this.applyToAgent(agent);
            return;
        }
        for (const live of this.liveAgents)
            this.applyToAgent(live);
    }
    mount() {
        const disposers = [];
        const ctxAny = this.ctx;
        if (typeof ctxAny.on === 'function') {
            disposers.push(ctxAny.on('agent/created', (payload) => {
                this.applyToAgent(payload?.agent);
            }));
            disposers.push(ctxAny.on('agent/disposed', (payload) => {
                this.releaseAgent(payload?.agent);
                if (payload?.agent)
                    this.liveAgents.delete(payload.agent);
            }));
            // `agent/pre-step` is a Cordis WATERFALL: always invoke and return next().
            disposers.push(ctxAny.on('agent/pre-step', async (payload, next) => {
                try {
                    this.applyToAgent(payload?.agent);
                }
                catch { }
                return typeof next === 'function' ? next() : undefined;
            }));
            disposers.push(ctxAny.on('tools/change', () => {
                this.reapply();
            }));
        }
        const systemPrompt = getHostService(this.ctx, 'systemPrompt');
        if (systemPrompt?.section) {
            const stopPrompt = systemPrompt.section({
                id: 'fast-ops-batching-guidance',
                order: 45,
                render: () => {
                    const settings = this.getSettings();
                    if (!settings.enabled || !settings.batchingGuidance)
                        return null;
                    return [
                        '## Fast Ops Token-Efficiency Tips',
                        '- Prefer `fast_read_files` to inspect multiple files/ranges in a single turn and obtain SHA-256 `revision` tokens.',
                        '- Prefer `fast_search` for workspace glob/grep and `fast_edit_batch` for multi-hunk atomic edits; call `fast_discover` only when specialized tools (`fast_stat`, `fast_diff`, `fast_replace`, `fast_read_table`, `fast_result`) are needed.',
                    ].join('\n');
                },
            });
            if (typeof stopPrompt === 'function')
                disposers.push(stopPrompt);
        }
        const mountTools = (tools) => {
            if (!tools.register)
                return;
            const reg = (spec) => {
                const stop = tools.register(spec);
                if (typeof stop === 'function')
                    disposers.push(stop);
            };
            reg({
                name: 'fast_read_files',
                description: 'Read 1-32 UTF-8 workspace file line ranges in one call, returning per-file SHA-256 revision and content (or ref:// cache handle when oversized).',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['files'],
                    properties: {
                        files: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['path'],
                                properties: {
                                    path: { type: 'string' },
                                    offset: { type: 'integer', description: '1-based start line; default 1.' },
                                    limit: { type: 'integer', description: '1-2000 lines; default 200.' },
                                },
                            },
                        },
                    },
                },
                execute: async (args, exec) => {
                    this.counters.batchCalls++;
                    const files = Array.isArray(args?.files) ? args.files : [];
                    this.counters.filesReadInBatches += files.length;
                    const settings = this.getSettings();
                    const result = await readFilesBatch(this.resolveWorkspaceRoot(exec?.agent), files, {
                        sessionId: sessionIdOf(exec?.agent),
                        maxInlineBytes: settings.maxInlineBytes,
                        ttlMs: settings.resultCacheTtlMs,
                        cache: this.cache,
                    });
                    if (result.spilled)
                        this.counters.cacheSpills++;
                    return result;
                },
            });
            reg({
                name: 'fast_search',
                description: 'Unified workspace file glob and regex/literal grep skipping .git/node_modules/build outputs.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['mode'],
                    properties: {
                        mode: { type: 'string', enum: ['glob', 'grep'] },
                        path: { type: 'string', description: 'Relative workspace directory; default ".".' },
                        include: { type: 'array', items: { type: 'string' } },
                        pattern: { type: 'string', description: 'Required for grep.' },
                        literal: { type: 'boolean' },
                        caseSensitive: { type: 'boolean' },
                        includeHidden: { type: 'boolean' },
                        offset: { type: 'integer' },
                        limit: { type: 'integer' },
                    },
                },
                execute: async (args, exec) => {
                    this.counters.batchCalls++;
                    const settings = this.getSettings();
                    const res = await searchWorkspace(this.resolveWorkspaceRoot(exec?.agent), args, {
                        sessionId: sessionIdOf(exec?.agent),
                        maxInlineBytes: settings.maxInlineBytes,
                        ttlMs: settings.resultCacheTtlMs,
                        cache: this.cache,
                    });
                    if ('spilled' in res && res.spilled)
                        this.counters.cacheSpills++;
                    return res;
                },
            });
            reg({
                name: 'fast_edit_batch',
                description: 'Apply 1-100 non-overlapping unique text replacements atomically with required SHA-256 expectedRevision CAS check.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['path', 'expectedRevision', 'edits'],
                    properties: {
                        path: { type: 'string' },
                        expectedRevision: { type: 'string', description: '64-hex SHA-256 revision from fast_read_files or fast_stat.' },
                        dryRun: { type: 'boolean', description: 'Preview diff without writing; default false.' },
                        edits: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['oldText', 'newText'],
                                properties: {
                                    oldText: { type: 'string' },
                                    newText: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                execute: (args, exec) => {
                    this.counters.batchCalls++;
                    return editFilesBatch(this.resolveWorkspaceRoot(exec?.agent), args);
                },
            });
            reg({
                name: 'fast_discover',
                description: 'Activate specialized Fast Ops tools (fast_stat, fast_diff, fast_replace, fast_read_table, fast_result) on demand by keyword or select:<tool>.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['query'],
                    properties: {
                        query: { type: 'string', description: 'Keyword or select:<tool_name> (or "all").' },
                    },
                },
                execute: (args, exec) => {
                    const query = String(args?.query ?? '').trim().toLowerCase();
                    const set = this.activatedSetFor(exec?.agent);
                    const matched = [];
                    for (const name of SPECIALIZED_TOOLS) {
                        const desc = SPECIALIZED_CATALOG[name].toLowerCase();
                        const exact = query === `select:${name}` || query === name || query === 'all' || query === '*';
                        if (exact || (query.length > 0 && (name.includes(query) || desc.includes(query)))) {
                            if (!set.has(name)) {
                                set.add(name);
                                this.counters.toolsActivated++;
                            }
                            matched.push(name);
                        }
                    }
                    this.reapply(exec?.agent);
                    return {
                        activated: matched,
                        catalog: matched.map(name => ({ name, description: SPECIALIZED_CATALOG[name] })),
                        note: matched.length > 0
                            ? 'Activated for the next step in this session.'
                            : `No match. Available: ${SPECIALIZED_TOOLS.join(', ')}`,
                    };
                },
            });
            reg({
                name: 'fast_stat',
                description: SPECIALIZED_CATALOG.fast_stat,
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['path'],
                    properties: { path: { type: 'string' } },
                },
                execute: (args, exec) => statFile(this.resolveWorkspaceRoot(exec?.agent), String(args?.path ?? '')),
            });
            reg({
                name: 'fast_diff',
                description: SPECIALIZED_CATALOG.fast_diff,
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['path', 'content'],
                    properties: {
                        path: { type: 'string' },
                        content: { type: 'string' },
                    },
                },
                execute: (args, exec) => diffPreview(this.resolveWorkspaceRoot(exec?.agent), String(args?.path ?? ''), String(args?.content ?? '')),
            });
            reg({
                name: 'fast_replace',
                description: SPECIALIZED_CATALOG.fast_replace,
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['oldText', 'newText'],
                    properties: {
                        oldText: { type: 'string' },
                        newText: { type: 'string' },
                        path: { type: 'string' },
                        include: { type: 'array', items: { type: 'string' } },
                        dryRun: { type: 'boolean', description: 'Preview without modifying files; default true.' },
                    },
                },
                execute: (args, exec) => replaceAcrossFiles(this.resolveWorkspaceRoot(exec?.agent), args),
            });
            reg({
                name: 'fast_read_table',
                description: SPECIALIZED_CATALOG.fast_read_table,
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['path'],
                    properties: {
                        path: { type: 'string' },
                        delimiter: { type: 'string', enum: [',', '\t'] },
                        offset: { type: 'integer' },
                        limit: { type: 'integer' },
                        columns: { type: 'array', items: { type: 'string' } },
                    },
                },
                execute: async (args, exec) => {
                    const settings = this.getSettings();
                    const res = await readTableFile(this.resolveWorkspaceRoot(exec?.agent), args, {
                        sessionId: sessionIdOf(exec?.agent),
                        maxInlineBytes: settings.maxInlineBytes,
                        ttlMs: settings.resultCacheTtlMs,
                        cache: this.cache,
                    });
                    if ('spilled' in res && res.spilled)
                        this.counters.cacheSpills++;
                    return res;
                },
            });
            reg({
                name: 'fast_result',
                description: SPECIALIZED_CATALOG.fast_result,
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['action', 'refId'],
                    properties: {
                        action: { type: 'string', enum: ['page', 'release'] },
                        refId: { type: 'string' },
                        offset: { type: 'integer' },
                        limit: { type: 'integer' },
                        maxBytes: { type: 'integer' },
                        fields: { type: 'array', items: { type: 'string' } },
                        equals: { type: 'object' },
                    },
                },
                execute: (args, exec) => {
                    const sessionId = sessionIdOf(exec?.agent);
                    const refId = String(args?.refId ?? '');
                    if (args?.action === 'release') {
                        return { ok: true, released: this.cache.release(sessionId, refId) };
                    }
                    return this.cache.page({
                        sessionId,
                        refId,
                        offset: typeof args?.offset === 'number' ? args.offset : undefined,
                        limit: typeof args?.limit === 'number' ? args.limit : undefined,
                        maxBytes: typeof args?.maxBytes === 'number' ? args.maxBytes : undefined,
                        fields: Array.isArray(args?.fields) ? args.fields : undefined,
                        equals: args?.equals && typeof args.equals === 'object' ? args.equals : undefined,
                    });
                },
            });
        };
        const existingTools = getHostService(this.ctx, 'tools');
        if (existingTools) {
            mountTools(existingTools);
        }
        else if (typeof this.ctx.inject === 'function') {
            try {
                const stopInject = this.ctx.inject(['tools'], (scoped) => {
                    if (scoped?.tools)
                        mountTools(scoped.tools);
                });
                if (typeof stopInject === 'function')
                    disposers.push(stopInject);
                else if (stopInject && typeof stopInject.dispose === 'function')
                    disposers.push(() => stopInject.dispose?.());
            }
            catch { }
        }
        return () => {
            for (const agent of this.liveAgents)
                this.releaseAgent(agent);
            this.liveAgents.clear();
            this.cache.reclaimAll();
            for (const dispose of disposers) {
                try {
                    dispose();
                }
                catch { }
            }
        };
    }
}
