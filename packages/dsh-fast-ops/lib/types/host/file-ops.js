import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isLikelyBinary, resolveSafeWorkspacePath, sha256Hex } from "./workspace-path.js";
const DEFAULT_IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'lib', '.next', 'target']);
export async function readFilesBatch(rootDir, files, options = {}) {
    const capped = files.slice(0, 32);
    const results = await Promise.all(capped.map(async (item) => {
        const resolved = resolveSafeWorkspacePath(rootDir, item.path);
        if (!resolved.ok)
            return { path: item.path, error: resolved.error };
        try {
            const buf = await readFile(resolved.absolutePath);
            if (isLikelyBinary(buf))
                return { path: resolved.relativePath, error: 'binary-file' };
            const text = buf.toString('utf8');
            const lines = text.split(/\r?\n/u);
            const offset = Math.max(1, Math.floor(item.offset ?? 1));
            const limit = Math.max(1, Math.min(2000, Math.floor(item.limit ?? 200)));
            const startIdx = Math.min(lines.length, offset - 1);
            const endIdx = Math.min(lines.length, startIdx + limit);
            const slice = lines.slice(startIdx, endIdx).join('\n');
            return {
                path: resolved.relativePath,
                revision: sha256Hex(buf),
                totalLines: lines.length,
                startLine: lines.length === 0 ? 0 : startIdx + 1,
                endLine: endIdx,
                truncated: endIdx < lines.length,
                content: slice,
            };
        }
        catch (error) {
            return {
                path: resolved.relativePath,
                error: error?.code === 'ENOENT' ? 'not-found' : 'read-failed',
            };
        }
    }));
    const maxInlineBytes = options.maxInlineBytes ?? 16384;
    const serializedBytes = Buffer.byteLength(JSON.stringify(results), 'utf8');
    if (serializedBytes > maxInlineBytes && options.cache && options.sessionId) {
        const ref = options.cache.put({
            sessionId: options.sessionId,
            producerTool: 'fast_read_files',
            items: results,
            ttlMs: options.ttlMs ?? 3600000,
            preview: `fast_read_files: ${results.length} files (${serializedBytes} bytes) spilled to cache`,
        });
        return {
            items: results.map(({ content: _omit, ...summary }) => ({
                ...summary,
                truncated: true,
            })),
            ref,
            spilled: true,
        };
    }
    return { items: results, spilled: false };
}
function globToRegExp(glob) {
    let out = '^';
    let i = 0;
    const normalized = glob.replaceAll('\\', '/').replace(/^\.\//u, '');
    while (i < normalized.length) {
        const ch = normalized[i];
        if (ch === '*') {
            if (normalized[i + 1] === '*') {
                if (normalized[i + 2] === '/') {
                    out += '(?:.*/)?';
                    i += 3;
                    continue;
                }
                out += '.*';
                i += 2;
                continue;
            }
            out += '[^/]*';
            i += 1;
            continue;
        }
        if (ch === '?') {
            out += '[^/]';
            i += 1;
            continue;
        }
        out += ch.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
        i += 1;
    }
    out += '$';
    return new RegExp(out, 'u');
}
function compileGlobMatcher(patterns) {
    if (!patterns || patterns.length === 0)
        return () => true;
    const positives = [];
    const negatives = [];
    for (const raw of patterns) {
        const trimmed = raw.trim();
        if (!trimmed)
            continue;
        if (trimmed.startsWith('!'))
            negatives.push(globToRegExp(trimmed.slice(1)));
        else
            positives.push(globToRegExp(trimmed));
    }
    return (relPath) => {
        if (negatives.some(re => re.test(relPath)))
            return false;
        return positives.length === 0 || positives.some(re => re.test(relPath));
    };
}
async function walkFiles(rootDir, baseRel, includeHidden, maxScanFiles, out) {
    if (out.length >= maxScanFiles)
        return;
    const absDir = baseRel === '.' ? rootDir : join(rootDir, baseRel);
    let entries;
    try {
        entries = await readdir(absDir, { withFileTypes: true });
    }
    catch {
        return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (out.length >= maxScanFiles)
            break;
        if (!includeHidden && entry.name.startsWith('.'))
            continue;
        if (entry.isSymbolicLink())
            continue;
        const rel = baseRel === '.' ? entry.name : `${baseRel}/${entry.name}`;
        if (entry.isDirectory()) {
            if (DEFAULT_IGNORED_DIRS.has(entry.name))
                continue;
            await walkFiles(rootDir, rel, includeHidden, maxScanFiles, out);
        }
        else if (entry.isFile()) {
            out.push(rel);
        }
    }
}
export async function searchWorkspace(rootDir, params, options = {}) {
    const base = resolveSafeWorkspacePath(rootDir, params.path ?? '.');
    if (!base.ok)
        return { ok: false, error: base.error, items: [] };
    const matcher = compileGlobMatcher(params.include);
    const discovered = [];
    await walkFiles(rootDir, base.relativePath, params.includeHidden === true, 8000, discovered);
    const eligible = discovered.filter(matcher);
    const offset = Math.max(0, Math.floor(params.offset ?? 0));
    const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 80)));
    if (params.mode === 'glob') {
        const sliced = eligible.slice(offset, offset + limit).map(path => ({ path }));
        return {
            ok: true,
            mode: 'glob',
            totalMatches: eligible.length,
            filesMatched: eligible.length,
            items: sliced,
            nextOffset: offset + sliced.length < eligible.length ? offset + sliced.length : null,
            spilled: false,
        };
    }
    const query = params.pattern ?? '';
    if (!query)
        return { ok: false, error: 'pattern-required', items: [] };
    let regex;
    try {
        const escaped = params.literal ? query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') : query;
        regex = new RegExp(escaped, params.caseSensitive ? 'u' : 'iu');
    }
    catch {
        return { ok: false, error: 'invalid-regex', items: [] };
    }
    const matches = [];
    const matchedFiles = new Set();
    const maxCollected = 2000;
    for (const relPath of eligible) {
        if (matches.length >= maxCollected)
            break;
        let buf;
        try {
            buf = await readFile(join(rootDir, relPath));
        }
        catch {
            continue;
        }
        if (buf.byteLength > 2 * 1024 * 1024 || isLikelyBinary(buf))
            continue;
        const lines = Buffer.from(buf).toString('utf8').split(/\r?\n/u);
        for (let idx = 0; idx < lines.length; idx++) {
            if (!regex.test(lines[idx]))
                continue;
            matchedFiles.add(relPath);
            const snippet = lines[idx].length > 240 ? `${lines[idx].slice(0, 240)}...` : lines[idx];
            matches.push({ path: relPath, line: idx + 1, text: snippet });
            if (matches.length >= maxCollected)
                break;
        }
    }
    const paged = matches.slice(offset, offset + limit);
    const serializedBytes = Buffer.byteLength(JSON.stringify(paged), 'utf8');
    const maxInlineBytes = options.maxInlineBytes ?? 16384;
    if (serializedBytes > maxInlineBytes && options.cache && options.sessionId) {
        const ref = options.cache.put({
            sessionId: options.sessionId,
            producerTool: 'fast_search',
            items: matches,
            ttlMs: options.ttlMs ?? 3600000,
            preview: `fast_search: ${matches.length} matches across ${matchedFiles.size} files`,
        });
        return {
            ok: true,
            mode: 'grep',
            totalMatches: matches.length,
            filesMatched: matchedFiles.size,
            items: paged.slice(0, 15),
            nextOffset: null,
            ref,
            spilled: true,
        };
    }
    return {
        ok: true,
        mode: 'grep',
        totalMatches: matches.length,
        filesMatched: matchedFiles.size,
        items: paged,
        nextOffset: offset + paged.length < matches.length ? offset + paged.length : null,
        spilled: false,
    };
}
export async function writeFileAtomicBytes(targetPath, content) {
    await mkdir(dirname(targetPath), { recursive: true });
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tmpPath = `${targetPath}.tmp-${suffix}`;
    const backupPath = `${targetPath}.bak-${suffix}`;
    await writeFile(tmpPath, content, { encoding: 'utf8', flag: 'wx' });
    let backedUp = false;
    try {
        try {
            await rename(targetPath, backupPath);
            backedUp = true;
        }
        catch (error) {
            if (error?.code !== 'ENOENT' && process.platform !== 'win32')
                throw error;
        }
        await rename(tmpPath, targetPath).catch(async (error) => {
            if (process.platform !== 'win32' || error?.code !== 'EEXIST')
                throw error;
            if (!backedUp) {
                await rename(targetPath, backupPath);
                backedUp = true;
            }
            await rename(tmpPath, targetPath);
        });
        if (backedUp)
            await rm(backupPath, { force: true });
    }
    catch (error) {
        await rm(tmpPath, { force: true }).catch(() => { });
        if (backedUp)
            await rename(backupPath, targetPath).catch(() => { });
        throw error;
    }
}
export function buildCompactDiff(beforeText, afterText, path) {
    const a = beforeText.split(/\r?\n/u);
    const b = afterText.split(/\r?\n/u);
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
        prefix++;
    let suffix = 0;
    while (suffix < a.length - prefix
        && suffix < b.length - prefix
        && a[a.length - 1 - suffix] === b[b.length - 1 - suffix])
        suffix++;
    if (prefix === a.length && a.length === b.length)
        return `--- ${path}\n+++ ${path}\n(no changes)`;
    const removed = a.slice(prefix, a.length - suffix).map(line => `- ${line}`);
    const added = b.slice(prefix, b.length - suffix).map(line => `+ ${line}`);
    return [
        `--- ${path}`,
        `+++ ${path}`,
        `@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`,
        ...removed,
        ...added,
    ].join('\n');
}
export async function editFilesBatch(rootDir, params) {
    const resolved = resolveSafeWorkspacePath(rootDir, params.path);
    if (!resolved.ok)
        return { ok: false, error: resolved.error };
    if (!/^[a-f0-9]{64}$/u.test(params.expectedRevision)) {
        return { ok: false, error: 'invalid-expected-revision' };
    }
    if (!Array.isArray(params.edits) || params.edits.length === 0 || params.edits.length > 100) {
        return { ok: false, error: 'invalid-edits-count' };
    }
    let buf;
    try {
        buf = await readFile(resolved.absolutePath);
    }
    catch {
        return { ok: false, error: 'not-found' };
    }
    if (isLikelyBinary(buf))
        return { ok: false, error: 'binary-file' };
    const currentRevision = sha256Hex(buf);
    if (currentRevision !== params.expectedRevision) {
        return { ok: false, error: 'revision-mismatch', currentRevision };
    }
    const original = Buffer.from(buf).toString('utf8');
    const spans = [];
    for (let i = 0; i < params.edits.length; i++) {
        const edit = params.edits[i];
        if (!edit.oldText)
            return { ok: false, error: `edit[${i}]-empty-oldText` };
        const first = original.indexOf(edit.oldText);
        if (first < 0)
            return { ok: false, error: `edit[${i}]-not-found` };
        const second = original.indexOf(edit.oldText, first + 1);
        if (second >= 0)
            return { ok: false, error: `edit[${i}]-not-unique` };
        spans.push({ start: first, end: first + edit.oldText.length, newText: edit.newText });
    }
    spans.sort((a, b) => a.start - b.start);
    for (let i = 1; i < spans.length; i++) {
        if (spans[i].start < spans[i - 1].end) {
            return { ok: false, error: 'overlapping-edits' };
        }
    }
    let updated = '';
    let cursor = 0;
    for (const span of spans) {
        updated += original.slice(cursor, span.start) + span.newText;
        cursor = span.end;
    }
    updated += original.slice(cursor);
    const newRevision = sha256Hex(Buffer.from(updated, 'utf8'));
    if (params.dryRun) {
        return {
            ok: true,
            dryRun: true,
            path: resolved.relativePath,
            previousRevision: currentRevision,
            nextRevision: newRevision,
            appliedEdits: spans.length,
            diff: buildCompactDiff(original, updated, resolved.relativePath),
        };
    }
    await writeFileAtomicBytes(resolved.absolutePath, updated);
    return {
        ok: true,
        dryRun: false,
        path: resolved.relativePath,
        previousRevision: currentRevision,
        revision: newRevision,
        appliedEdits: spans.length,
    };
}
export async function statFile(rootDir, relPath) {
    const resolved = resolveSafeWorkspacePath(rootDir, relPath);
    if (!resolved.ok)
        return { ok: false, error: resolved.error };
    try {
        const st = await stat(resolved.absolutePath);
        if (st.isDirectory()) {
            return { ok: true, exists: true, path: resolved.relativePath, kind: 'directory', bytes: 0, mtimeMs: st.mtimeMs };
        }
        if (!st.isFile()) {
            return { ok: true, exists: true, path: resolved.relativePath, kind: 'other', bytes: st.size, mtimeMs: st.mtimeMs };
        }
        const buf = await readFile(resolved.absolutePath);
        const binary = isLikelyBinary(buf);
        const lines = binary ? undefined : Buffer.from(buf).toString('utf8').split(/\r?\n/u).length;
        return {
            ok: true,
            exists: true,
            path: resolved.relativePath,
            kind: 'file',
            bytes: st.size,
            mtimeMs: st.mtimeMs,
            binary,
            lines,
            revision: sha256Hex(buf),
        };
    }
    catch (error) {
        if (error?.code === 'ENOENT') {
            return { ok: true, exists: false, path: resolved.relativePath };
        }
        return { ok: false, error: 'stat-failed' };
    }
}
export async function diffPreview(rootDir, relPath, proposedContent) {
    const resolved = resolveSafeWorkspacePath(rootDir, relPath);
    if (!resolved.ok)
        return { ok: false, error: resolved.error };
    try {
        const buf = await readFile(resolved.absolutePath);
        if (isLikelyBinary(buf))
            return { ok: false, error: 'binary-file' };
        const before = Buffer.from(buf).toString('utf8');
        return {
            ok: true,
            path: resolved.relativePath,
            currentRevision: sha256Hex(buf),
            diff: buildCompactDiff(before, proposedContent, resolved.relativePath),
        };
    }
    catch {
        return { ok: false, error: 'not-found' };
    }
}
export async function replaceAcrossFiles(rootDir, params) {
    if (!params.oldText)
        return { ok: false, error: 'oldText-required' };
    const base = resolveSafeWorkspacePath(rootDir, params.path ?? '.');
    if (!base.ok)
        return { ok: false, error: base.error };
    const dryRun = params.dryRun !== false;
    const matcher = compileGlobMatcher(params.include);
    const files = [];
    await walkFiles(rootDir, base.relativePath, false, 4000, files);
    const changed = [];
    let totalReplacements = 0;
    for (const relPath of files.filter(matcher)) {
        const abs = join(rootDir, relPath);
        let buf;
        try {
            buf = await readFile(abs);
        }
        catch {
            continue;
        }
        if (buf.byteLength > 2 * 1024 * 1024 || isLikelyBinary(buf))
            continue;
        const text = Buffer.from(buf).toString('utf8');
        if (!text.includes(params.oldText))
            continue;
        const parts = text.split(params.oldText);
        const count = parts.length - 1;
        totalReplacements += count;
        changed.push({ path: relPath, replacements: count });
        if (!dryRun) {
            await writeFileAtomicBytes(abs, parts.join(params.newText));
        }
    }
    return {
        ok: true,
        dryRun,
        filesChanged: changed.length,
        totalReplacements,
        files: changed.slice(0, 100),
    };
}
/** RFC-4180 CSV/TSV parser handling quoted commas and embedded newlines. */
export function parseDelimitedTable(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += ch;
            }
            continue;
        }
        if (ch === '"' && field.length === 0) {
            inQuotes = true;
        }
        else if (ch === delimiter) {
            row.push(field);
            field = '';
        }
        else if (ch === '\r') {
            if (text[i + 1] === '\n')
                i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        }
        else if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        }
        else {
            field += ch;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
export async function readTableFile(rootDir, params, options = {}) {
    const resolved = resolveSafeWorkspacePath(rootDir, params.path);
    if (!resolved.ok)
        return { ok: false, error: resolved.error };
    let buf;
    try {
        buf = await readFile(resolved.absolutePath);
    }
    catch {
        return { ok: false, error: 'not-found' };
    }
    if (isLikelyBinary(buf))
        return { ok: false, error: 'binary-file' };
    const delimiter = params.delimiter ?? (resolved.relativePath.toLowerCase().endsWith('.tsv') ? '\t' : ',');
    const parsed = parseDelimitedTable(Buffer.from(buf).toString('utf8'), delimiter);
    if (parsed.length === 0) {
        return { ok: true, path: resolved.relativePath, headers: [], totalRows: 0, rows: [] };
    }
    const headers = parsed[0];
    const wantedCols = Array.isArray(params.columns) && params.columns.length > 0
        ? params.columns.filter(col => headers.includes(col))
        : headers;
    const dataRows = parsed.slice(1).map((cells) => {
        const record = {};
        for (const col of wantedCols) {
            const idx = headers.indexOf(col);
            record[col] = cells[idx] ?? '';
        }
        return record;
    });
    const offset = Math.max(0, Math.floor(params.offset ?? 0));
    const limit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 50)));
    const sliced = dataRows.slice(offset, offset + limit);
    const maxInlineBytes = options.maxInlineBytes ?? 16384;
    const bytes = Buffer.byteLength(JSON.stringify(sliced), 'utf8');
    if (bytes > maxInlineBytes && options.cache && options.sessionId) {
        const ref = options.cache.put({
            sessionId: options.sessionId,
            producerTool: 'fast_read_table',
            items: dataRows,
            ttlMs: options.ttlMs ?? 3600000,
            preview: `${resolved.relativePath}: ${dataRows.length} rows (${wantedCols.length} cols)`,
        });
        return {
            ok: true,
            path: resolved.relativePath,
            headers: wantedCols,
            totalRows: dataRows.length,
            rows: sliced.slice(0, 10),
            ref,
            spilled: true,
        };
    }
    return {
        ok: true,
        path: resolved.relativePath,
        headers: wantedCols,
        totalRows: dataRows.length,
        rows: sliced,
        nextOffset: offset + sliced.length < dataRows.length ? offset + sliced.length : null,
        spilled: false,
    };
}
