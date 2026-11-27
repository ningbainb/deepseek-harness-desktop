import { randomUUID } from 'node:crypto';
import { chmod, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { languageFor, loadSyntaxApi } from "./ast-outline.js";
import { readWorkspaceCodeFile, selectCodeFiles } from "./code-files.js";
import { buildCompactDiff, collectSearchContext } from "./file-ops.js";
import { sha256Hex } from "./workspace-path.js";
export async function searchAst(root, params, signal) {
    if (typeof params.pattern !== 'string' || !params.pattern.trim() || params.pattern.length > 1000)
        return { ok: false, error: 'invalid-pattern' };
    const selected = await selectCodeFiles(root, params, 500, signal);
    if (selected.error)
        return { ok: false, error: selected.error };
    const api = await loadSyntaxApi();
    const nativePaths = selected.paths.filter(path => {
        const language = languageFor(path);
        return language && api?.supports(language);
    });
    const native = api !== undefined && nativePaths.length > 0;
    const paths = native ? nativePaths : selected.paths;
    const offset = Math.max(0, params.offset ?? 0);
    const limit = Math.max(1, Math.min(100, params.limit ?? 30));
    const radius = Math.min(5, Math.max(0, params.contextLines ?? 0));
    const items = [];
    const context = [];
    let count = 0;
    let bounded = selected.bounded;
    let parsedFiles = 0;
    let inputBytes = 0;
    for (const path of paths) {
        signal?.throwIfAborted();
        const file = await readWorkspaceCodeFile(root, path);
        if (!file)
            continue;
        inputBytes += Buffer.byteLength(file.text, 'utf8');
        if (inputBytes > 24 * 1024 * 1024) {
            bounded = true;
            break;
        }
        const lines = file.text.split(/\r?\n/u);
        let matches;
        try {
            matches = native
                ? api.parse(languageFor(path), file.text).root().findAll(params.pattern).map(node => ({ ...node.range(), text: () => node.text() }))
                : literalMatches(lines, params.pattern);
        }
        catch {
            continue;
        }
        parsedFiles++;
        const indexedLines = new Set();
        for (const match of matches) {
            if (++count <= offset || items.length >= limit)
                continue;
            const { start, end } = match;
            const endLine = Math.max(start.line + 1, end.line + (end.column ? 1 : 0));
            items.push({
                path, line: start.line + 1, endLine, startColumn: start.column + 1, endColumn: end.column + 1,
                text: match.text().slice(0, 360).replace(/[\uD800-\uDBFF]$/u, ''), revision: file.revision,
            });
            indexedLines.add(start.line + 1);
            indexedLines.add(endLine);
        }
        if (radius > 0 && indexedLines.size > 0) {
            context.push(...collectSearchContext(path, file.revision, lines, [...indexedLines].sort((a, b) => a - b), radius));
        }
        if (count > 20_000) {
            bounded = true;
            break;
        }
    }
    if (paths.length && !parsedFiles)
        return { ok: false, error: 'invalid-pattern-or-unreadable-source' };
    return {
        ok: true, parser: native ? 'ast' : 'fallback', items, context,
        totalMatches: count, nextOffset: offset + items.length < count ? offset + items.length : null,
        bounded, skippedUnsupportedFiles: native ? selected.paths.length - nativePaths.length : 0,
    };
}
function* literalMatches(lines, query) {
    for (let i = 0; i < lines.length; i++) {
        const column = lines[i].indexOf(query);
        if (column >= 0)
            yield { start: { line: i, column }, end: { line: i, column: column + query.length }, text: () => query };
    }
}
const METAVARIABLE = /([$]{1,3})([A-Z_][A-Z0-9_]*)/gu;
function expandReplacement(template, node, source, variables) {
    return template.replace(METAVARIABLE, (token, dollars, name) => {
        if (!variables.has(token))
            throw new Error(`unbound-metavariable:${token}`);
        if (dollars.length === 3) {
            const nodes = node.getMultipleMatches(name);
            if (!nodes.length)
                return '';
            return source.slice(nodes[0].range().start.index, nodes.at(-1).range().end.index);
        }
        const captured = node.getMatch(name);
        if (!captured)
            throw new Error(`unbound-metavariable:${token}`);
        return captured.text();
    });
}
const pendingWrites = new Map();
async function queueWrite(root, action) {
    const absolute = resolve(root);
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
    const run = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => { }).then(action);
    pendingWrites.set(key, run);
    try {
        return await run;
    }
    finally {
        if (pendingWrites.get(key) === run)
            pendingWrites.delete(key);
    }
}
function temporaryPath(file) {
    return join(dirname(file.absolutePath), `.${basename(file.absolutePath)}.dsh-fast-ops-${randomUUID()}.tmp`);
}
async function stillCurrent(root, file, revision) {
    return (await readWorkspaceCodeFile(root, file.path, 2 * 1024 * 1024))?.revision === revision;
}
export async function rewriteAst(root, params, options = {}) {
    if (typeof params.pattern !== 'string' || !params.pattern.trim() || params.pattern.length > 1000
        || typeof params.replacement !== 'string' || params.replacement.length > 8192)
        return { ok: false, error: 'invalid-rewrite' };
    const selected = await selectCodeFiles(root, params, 160, options.signal);
    if (selected.error)
        return { ok: false, error: selected.error };
    if (selected.bounded)
        return { ok: false, error: 'rewrite-scan-limit-narrow-selection' };
    const api = await loadSyntaxApi();
    if (!api)
        return { ok: false, error: 'ast-unavailable' };
    const candidates = [];
    const variables = new Set(Array.from(params.pattern.matchAll(METAVARIABLE), match => match[0]));
    let changes = 0;
    for (const path of selected.paths) {
        options.signal?.throwIfAborted();
        const language = languageFor(path);
        if (!language || !api.supports(language))
            continue;
        const file = await readWorkspaceCodeFile(root, path);
        if (!file)
            return { ok: false, path, error: 'unreadable-source' };
        if (params.dryRun === false && params.expectedRevisions?.[path] !== undefined
            && params.expectedRevisions[path] !== file.revision)
            return { ok: false, path, error: 'revision-mismatch', currentRevision: file.revision };
        try {
            const syntax = api.parse(language, file.text).root();
            const matches = syntax.findAll(params.pattern);
            if (!matches.length)
                continue;
            changes += matches.length;
            if (changes > 200 || candidates.length >= 25)
                return { ok: false, error: 'rewrite-match-limit-narrow-selection' };
            if (syntax.findAll({ rule: { kind: 'ERROR' } }).length)
                return { ok: false, path, error: 'invalid-source-syntax' };
            const edits = matches.map(node => node.replace(expandReplacement(params.replacement, node, file.text, variables)))
                .sort((a, b) => a.startPos - b.startPos || a.endPos - b.endPos);
            if (edits.some((edit, i) => i > 0 && edit.startPos < edits[i - 1].endPos)) {
                return { ok: false, path, error: 'overlapping-ast-matches' };
            }
            const output = syntax.commitEdits(edits);
            if (output === file.text)
                continue;
            if (Buffer.byteLength(output, 'utf8') > 2 * 1024 * 1024 || api.parse(language, output).root().findAll({ rule: { kind: 'ERROR' } }).length) {
                return { ok: false, path, error: 'invalid-rewrite-output' };
            }
            candidates.push({ ...file, output, matches: matches.length });
        }
        catch (error) {
            return { ok: false, path, error: error instanceof Error && error.message.startsWith('unbound-metavariable:')
                    ? error.message : 'invalid-rewrite-pattern' };
        }
    }
    if (params.dryRun !== false) {
        let available = 60_000;
        const files = candidates.map(file => {
            const unified = buildCompactDiff(file.text, file.output, file.path).replace(/^([+-]) /gmu, '$1');
            const diff = unified.slice(0, available).replace(/[\uD800-\uDBFF]$/u, '');
            available -= diff.length;
            return { path: file.path, revision: file.revision, matches: file.matches, diff, truncated: diff.length < unified.length };
        });
        return { ok: true, dryRun: true, affectedFiles: candidates.length, files };
    }
    const expected = params.expectedRevisions ?? {};
    for (const file of candidates) {
        if (!Object.hasOwn(expected, file.path) || expected[file.path] !== file.revision) {
            return { ok: false, error: 'revision-mismatch', path: file.path, currentRevision: file.revision };
        }
    }
    if (Object.keys(expected).some(path => !candidates.some(file => file.path === path))) {
        return { ok: false, error: 'preview-file-set-changed' };
    }
    if (!candidates.length)
        return { ok: true, dryRun: false, written: [] };
    return queueWrite(root, async () => {
        const paths = candidates.map(file => file.path);
        const temps = new Map();
        const written = [];
        let conflict;
        try {
            for (const file of candidates) {
                options.signal?.throwIfAborted();
                if (!await stillCurrent(root, file, file.revision))
                    return { ok: false, path: file.path, error: 'revision-mismatch' };
            }
            await options.beforeWrite?.(paths);
            for (const file of candidates) {
                options.signal?.throwIfAborted();
                const temp = temporaryPath(file);
                temps.set(file, temp);
                await writeFile(temp, file.output, { mode: file.mode, flag: 'wx', signal: options.signal });
                if (process.platform !== 'win32')
                    await chmod(temp, file.mode);
            }
            for (const file of candidates) {
                options.signal?.throwIfAborted();
                if (!await stillCurrent(root, file, file.revision)) {
                    conflict = file.path;
                    throw new Error('revision-mismatch');
                }
                await rename(temps.get(file), file.absolutePath);
                written.push(file);
            }
            return { ok: true, dryRun: false, written: paths };
        }
        catch {
            const rollbackFailed = [];
            for (const file of written.reverse()) {
                const temp = temporaryPath(file);
                try {
                    if (!await stillCurrent(root, file, sha256Hex(file.output)))
                        throw new Error('changed-after-write');
                    await writeFile(temp, file.text, { mode: file.mode, flag: 'wx' });
                    if (process.platform !== 'win32')
                        await chmod(temp, file.mode);
                    if (!await stillCurrent(root, file, sha256Hex(file.output)))
                        throw new Error('changed-after-write');
                    await rename(temp, file.absolutePath);
                }
                catch {
                    rollbackFailed.push(file.path);
                }
                finally {
                    await rm(temp, { force: true }).catch(() => { });
                }
            }
            return conflict
                ? { ok: false, error: 'revision-mismatch', path: conflict, rollbackFailed }
                : { ok: false, error: options.signal?.aborted ? 'cancelled' : 'write-failed', rollbackFailed };
        }
        finally {
            await Promise.allSettled([...temps.values()].map(path => rm(path, { force: true })));
        }
    });
}
