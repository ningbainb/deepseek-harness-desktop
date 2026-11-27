import { isAbsolute } from 'node:path';
import { getHostService, } from "../core/host-types.js";
import { isNativeAstAvailable, outlineWorkspace } from "./ast-outline.js";
import { rewriteAst, searchAst } from "./ast-tools.js";
import { denoiseCommandOutput } from "./command-output.js";
import { diffPreview, editFilesBatch, readFilesBatch, readTableFile, replaceAcrossFiles, searchWorkspace, statFile, } from "./file-ops.js";
import { mapRepository } from "./repo-map.js";
import { ResultCache } from "./result-cache.js";
export const RESIDENT_TOOLS = ['fast_read_files', 'fast_search', 'fast_edit_batch', 'fast_discover'];
export const SPECIALIZED_TOOLS = [
    'fast_stat', 'fast_diff', 'fast_replace', 'fast_read_table', 'fast_result',
    'fast_outline', 'fast_ast_search', 'fast_ast_rewrite', 'fast_repo_map',
];
export const ALL_FAST_OPS_TOOLS = [...RESIDENT_TOOLS, ...SPECIALIZED_TOOLS];
const SPECIALIZED_CATALOG = {
    fast_stat: 'Inspect file/directory metadata, size, line count, binary status, and SHA-256 revision.',
    fast_diff: 'Preview unified line diff between current file and proposed content without writing.',
    fast_replace: 'Batch literal replacement across glob-matched files (dryRun defaults to true).',
    fast_read_table: 'Parse RFC-4180 CSV/TSV files with quoted fields, column projection, and row paging.',
    fast_result: 'Page, filter (equals), project (fields), or release cached ref:// overflow results.',
    fast_outline: 'Read declaration names, signatures and exact line ranges without loading function bodies.',
    fast_ast_search: 'Find syntax patterns with ast-grep metavariables. Returns exact revisions and optional line context.',
    fast_ast_rewrite: 'Preview a syntax-pattern rewrite, or apply it using the exact file revisions from that preview.',
    fast_repo_map: 'Return a credential-filtered repository map of paths and signatures within a token budget.',
};
export const FAST_OPS_RESULTS_SERVICE = 'fastOpsResults';
export class FastOpsController {
    cache;
    counters = {
        batchCalls: 0,
        filesReadInBatches: 0,
        cacheSpills: 0,
        toolsActivated: 0,
        astCalls: 0,
        denoiseTokensSaved: 0,
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
    cacheScope(agent, requireSession = false) {
        const sessionId = agent?.session?.id || (requireSession ? undefined : agent?.id || 'default');
        if (!sessionId)
            return undefined;
        const userScope = getHostService(this.ctx, 'userScope');
        const scope = userScope?.currentScope?.() ?? userScope?.desktopScope?.();
        if (userScope && !scope?.principalId)
            return undefined;
        if (scope && userScope?.canAccess && (requireSession || scope.source === 'remote')) {
            if (!userScope.canAccess(scope, { kind: 'session', sessionId }).allowed)
                return undefined;
        }
        return { sessionId, principalId: scope?.principalId };
    }
    async isAstAvailable() {
        return isNativeAstAvailable();
    }
    putText(input) {
        const settings = this.getSettings();
        if (!settings.enabled || !input.agent)
            return undefined;
        const scope = this.cacheScope(input.agent, true);
        if (!scope)
            return undefined;
        const ref = this.cache.putText({
            ...scope, producerTool: input.producerTool, text: input.text,
            preview: input.preview, ttlMs: settings.resultCacheTtlMs,
        });
        if (!ref)
            return undefined;
        this.counters.cacheSpills++;
        const activated = this.activatedSetFor(input.agent);
        if (!activated.has('fast_result')) {
            activated.add('fast_result');
            this.counters.toolsActivated++;
            try {
                this.reapply(input.agent);
            }
            catch { /* The explicit discover tool remains available. */ }
        }
        return ref;
    }
    projectCommandResult(exec, result, decision) {
        if (!['bash', 'pwsh'].includes(exec.name) || result.isError || decision.kind !== 'accept'
            || decision.content !== undefined || decision.value !== undefined)
            return decision;
        const args = exec.arguments;
        const original = result.content[0];
        if (typeof args?.command !== 'string' || result.content.length !== 1 || original?.type !== 'text')
            return decision;
        const shell = result.value;
        if ((shell?.kind !== undefined && shell.kind !== 'foreground')
            || shell?.stdout?.truncated || shell?.stderr?.truncated
            || /(?:^|\n)\[output truncated; full output:/u.test(original.text))
            return decision;
        const compact = denoiseCommandOutput(original.text, args.command, this.getSettings().denoise);
        if (compact === undefined)
            return decision;
        const ref = this.putText({ agent: exec.agent, producerTool: exec.name, text: original.text });
        if (!ref)
            return decision;
        const rawBytes = Buffer.byteLength(original.text, 'utf8');
        const projectedBytes = Buffer.byteLength(compact, 'utf8');
        const percent = Math.round((1 - projectedBytes / rawBytes) * 100);
        const text = `${compact}\n[compressed ${rawBytes} B -> ${projectedBytes} B, saved ~${percent}%; full raw output: ${ref.refId} via fast_result]`;
        this.counters.denoiseTokensSaved += Math.max(0, Math.floor((original.text.length - text.length) / 4));
        return { ...decision, content: [{ ...original, text }] };
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
    async resolveCodeWorkspace(agent, signal) {
        if (!agent)
            return undefined;
        const directory = getHostService(this.ctx, 'workingDirectory');
        try {
            signal?.throwIfAborted();
            const root = directory
                ? await directory.ensure(agent, signal)
                : agent.workspace?.path || agent.cwd || agent.session?.header?.cwd;
            return typeof root === 'string' && isAbsolute(root) ? root : undefined;
        }
        catch {
            signal?.throwIfAborted();
            return undefined;
        }
    }
    canRewriteWorkspace(agent) {
        const permissions = getHostService(this.ctx, 'permissionPresets');
        const shell = getHostService(this.ctx, 'shell');
        try {
            const sandbox = (agent.session ? permissions?.permissionState?.(agent.session)?.sandbox : undefined) ?? shell?.sandboxMode;
            return sandbox !== 'read-only';
        }
        catch {
            return false;
        }
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
            const scoped = (agent.ctx?.get?.('tools') ?? agent.ctx?.tools);
            if (typeof scoped?.restrict !== 'function')
                return;
            let deny = this.denyListFor(agent);
            if (typeof scoped.view === 'function') {
                const known = scoped.view(agent)?.restrictableNames;
                if (known)
                    deny = deny.filter(name => known.has(name));
            }
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
            disposers.push(ctxAny.on('tools/post-execute', async (exec, result, next) => {
                const decision = await next();
                try {
                    return this.projectCommandResult(exec, result, decision);
                }
                catch {
                    return decision;
                }
            }));
        }
        const mountPrompt = (systemPrompt) => {
            if (!systemPrompt.section)
                return;
            const stopPrompt = systemPrompt.section({
                name: 'dsh:fast-ops',
                order: 45,
                text: () => {
                    const settings = this.getSettings();
                    if (!settings.enabled || !settings.batchingGuidance)
                        return '';
                    return [
                        '## nbfast Token-Efficiency Tips',
                        '- Prefer `fast_read_files` to inspect multiple files/ranges in a single turn and obtain SHA-256 `revision` tokens.',
                        '- Use `fast_search` for workspace glob/grep. For an unfamiliar symbol or call site, request `contextLines: 2` to get merged excerpts and their file revisions in one call. Reuse the revision for `fast_edit_batch` when the excerpt is sufficient. Read larger excerpts from `contextRef` via `fast_result`; call `fast_discover` when a specialized tool is needed.',
                        '- Use `fast_outline` for declaration signatures and `fast_ast_search` for source patterns. Run `fast_ast_rewrite` in preview mode before supplying its file revisions to apply a rewrite.',
                    ].join('\n');
                },
            });
            if (typeof stopPrompt === 'function')
                disposers.push(stopPrompt);
        };
        const existingPrompt = getHostService(this.ctx, 'systemPrompt');
        if (existingPrompt) {
            mountPrompt(existingPrompt);
        }
        else if (typeof this.ctx.inject === 'function') {
            try {
                const stopInject = this.ctx.inject(['systemPrompt'], (scoped) => {
                    if (scoped?.systemPrompt)
                        mountPrompt(scoped.systemPrompt);
                });
                if (typeof stopInject === 'function')
                    disposers.push(stopInject);
                else if (stopInject && typeof stopInject.dispose === 'function')
                    disposers.push(() => stopInject.dispose?.());
            }
            catch { }
        }
        const mountTools = (tools) => {
            if (!tools.register)
                return;
            const reg = (spec) => {
                const stop = tools.register({
                    ...spec,
                    output: {
                        schema: { type: 'object', additionalProperties: true },
                        render: (_args, value) => [{
                                type: 'text',
                                text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
                            }],
                    },
                });
                if (typeof stop === 'function')
                    disposers.push(stop);
            };
            const codeSelection = {
                path: { type: 'string', description: 'Workspace path or glob, default ".".' },
                include: { type: 'array', items: { type: 'string' }, maxItems: 32 },
            };
            const pattern = { type: 'string', minLength: 1, maxLength: 1000, description: 'ast-grep pattern such as ctx.on($EVENT, $HANDLER).' };
            const noWorkspace = { ok: false, error: 'workspace-unavailable' };
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
                        ...this.cacheScope(exec?.agent),
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
                description: 'Search workspace files by glob or grep. Opt into merged line context and exact file revisions when needed for explanation or a follow-up edit.',
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
                        contextLines: { type: 'integer', minimum: 0, maximum: 5,
                            description: 'Optional lines before and after each grep match. Returns merged excerpts for this match page, or contextRef for fast_result. Defaults to 0.' },
                    },
                },
                execute: async (args, exec) => {
                    this.counters.batchCalls++;
                    const settings = this.getSettings();
                    const res = await searchWorkspace(this.resolveWorkspaceRoot(exec?.agent), args, {
                        ...this.cacheScope(exec?.agent),
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
                description: 'Activate specialized nbfast file, AST, repository map, and result tools on demand by keyword or select:<tool>.',
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
                        ...this.cacheScope(exec?.agent),
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
                name: 'fast_outline',
                description: SPECIALIZED_CATALOG.fast_outline,
                parameters: {
                    type: 'object', additionalProperties: false,
                    properties: { ...codeSelection, maxSymbols: { type: 'integer', minimum: 1, maximum: 200 } },
                },
                execute: async (args, exec) => {
                    const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal);
                    if (!root)
                        return noWorkspace;
                    this.counters.astCalls++;
                    return outlineWorkspace(root, (args ?? {}), exec?.signal);
                },
            });
            reg({
                name: 'fast_ast_search',
                description: SPECIALIZED_CATALOG.fast_ast_search,
                parameters: {
                    type: 'object', additionalProperties: false, required: ['pattern'],
                    properties: {
                        ...codeSelection, pattern,
                        offset: { type: 'integer', minimum: 0 },
                        limit: { type: 'integer', minimum: 1, maximum: 100 },
                        contextLines: { type: 'integer', minimum: 0, maximum: 5 },
                    },
                },
                execute: async (args, exec) => {
                    const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal);
                    if (!root)
                        return noWorkspace;
                    this.counters.astCalls++;
                    const result = await searchAst(root, (args ?? {}), exec?.signal);
                    if (!result.context?.length)
                        return result;
                    const text = JSON.stringify(result.context);
                    if (Buffer.byteLength(text, 'utf8') <= this.getSettings().maxInlineBytes)
                        return result;
                    const contextRef = this.putText({ agent: exec?.agent, producerTool: 'fast_ast_search', text });
                    return contextRef ? { ...result, context: [], contextRef, contextEncoding: 'json-text' } : result;
                },
            });
            reg({
                name: 'fast_ast_rewrite',
                description: SPECIALIZED_CATALOG.fast_ast_rewrite,
                parameters: {
                    type: 'object', additionalProperties: false, required: ['pattern', 'replacement'],
                    properties: {
                        ...codeSelection, pattern,
                        replacement: { type: 'string', maxLength: 8192 },
                        dryRun: { type: 'boolean', description: 'Preview changes by default.' },
                        expectedRevisions: {
                            type: 'object',
                            description: 'Required to apply changes. Use the exact path-to-revision pairs returned by the preview.',
                            additionalProperties: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                        },
                    },
                },
                execute: async (args, exec) => {
                    const agent = exec?.agent;
                    const root = await this.resolveCodeWorkspace(agent, exec?.signal);
                    if (!root || !agent)
                        return noWorkspace;
                    if (args?.dryRun === false && !this.canRewriteWorkspace(agent))
                        return { ok: false, error: 'workspace-read-only' };
                    this.counters.astCalls++;
                    return rewriteAst(root, (args ?? {}), {
                        signal: exec?.signal,
                        beforeWrite: async (paths) => {
                            if (!this.canRewriteWorkspace(agent))
                                throw new Error('workspace-read-only');
                            const checkpoints = getHostService(this.ctx, 'workspaceCheckpoints');
                            await checkpoints?.beforeWorkspaceWrite({ agent, workspacePath: root, paths, tool: 'fast_ast_rewrite' });
                        },
                    });
                },
            });
            reg({
                name: 'fast_repo_map',
                description: SPECIALIZED_CATALOG.fast_repo_map,
                parameters: {
                    type: 'object', additionalProperties: false,
                    properties: { ...codeSelection, maxTokens: { type: 'integer', minimum: 40, maximum: 12_000 } },
                },
                execute: async (args, exec) => {
                    const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal);
                    if (!root)
                        return noWorkspace;
                    this.counters.astCalls++;
                    return mapRepository(root, (args ?? {}), exec?.signal);
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
                    const scope = this.cacheScope(exec?.agent);
                    const refId = String(args?.refId ?? '');
                    if (!scope)
                        return { ok: false, refId, error: 'reference-not-found' };
                    if (args?.action === 'release') {
                        return { ok: true, released: this.cache.release(scope.sessionId, refId, scope.principalId) };
                    }
                    return this.cache.page({
                        ...scope,
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
