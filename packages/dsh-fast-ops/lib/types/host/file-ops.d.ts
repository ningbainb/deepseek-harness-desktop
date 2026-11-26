import type { ResultCache, StorageReference } from './result-cache.ts';
export interface ReadRangeRequest {
    path: string;
    offset?: number;
    limit?: number;
}
export interface ReadBatchItemResult {
    path: string;
    revision?: string;
    totalLines?: number;
    startLine?: number;
    endLine?: number;
    truncated?: boolean;
    content?: string;
    error?: string;
}
export declare function readFilesBatch(rootDir: string, files: readonly ReadRangeRequest[], options?: {
    sessionId?: string;
    maxInlineBytes?: number;
    ttlMs?: number;
    cache?: ResultCache;
}): Promise<{
    items: ReadBatchItemResult[];
    ref?: StorageReference;
    spilled: boolean;
}>;
export interface SearchWorkspaceParams {
    mode: 'glob' | 'grep';
    path?: string;
    include?: readonly string[];
    pattern?: string;
    literal?: boolean;
    caseSensitive?: boolean;
    includeHidden?: boolean;
    offset?: number;
    limit?: number;
}
export declare function searchWorkspace(rootDir: string, params: SearchWorkspaceParams, options?: {
    sessionId?: string;
    maxInlineBytes?: number;
    ttlMs?: number;
    cache?: ResultCache;
}): Promise<{
    ok: boolean;
    error: string;
    items: never[];
    mode?: undefined;
    totalMatches?: undefined;
    filesMatched?: undefined;
    nextOffset?: undefined;
    spilled?: undefined;
    ref?: undefined;
} | {
    ok: boolean;
    mode: "glob";
    totalMatches: number;
    filesMatched: number;
    items: {
        path: string;
    }[];
    nextOffset: number | null;
    spilled: boolean;
    error?: undefined;
    ref?: undefined;
} | {
    ok: boolean;
    mode: "grep";
    totalMatches: number;
    filesMatched: number;
    items: {
        path: string;
        line: number;
        text: string;
    }[];
    nextOffset: null;
    ref: StorageReference;
    spilled: boolean;
    error?: undefined;
} | {
    ok: boolean;
    mode: "grep";
    totalMatches: number;
    filesMatched: number;
    items: {
        path: string;
        line: number;
        text: string;
    }[];
    nextOffset: number | null;
    spilled: boolean;
    error?: undefined;
    ref?: undefined;
}>;
export declare function writeFileAtomicBytes(targetPath: string, content: string): Promise<void>;
export declare function buildCompactDiff(beforeText: string, afterText: string, path: string): string;
export interface EditReplacement {
    oldText: string;
    newText: string;
}
export declare function editFilesBatch(rootDir: string, params: {
    path: string;
    expectedRevision: string;
    edits: readonly EditReplacement[];
    dryRun?: boolean;
}): Promise<{
    ok: boolean;
    error: string;
    currentRevision?: undefined;
    dryRun?: undefined;
    path?: undefined;
    previousRevision?: undefined;
    nextRevision?: undefined;
    appliedEdits?: undefined;
    diff?: undefined;
    revision?: undefined;
} | {
    ok: boolean;
    error: string;
    currentRevision: string;
    dryRun?: undefined;
    path?: undefined;
    previousRevision?: undefined;
    nextRevision?: undefined;
    appliedEdits?: undefined;
    diff?: undefined;
    revision?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    path: string;
    previousRevision: string;
    nextRevision: string;
    appliedEdits: number;
    diff: string;
    error?: undefined;
    currentRevision?: undefined;
    revision?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    path: string;
    previousRevision: string;
    revision: string;
    appliedEdits: number;
    error?: undefined;
    currentRevision?: undefined;
    nextRevision?: undefined;
    diff?: undefined;
}>;
export declare function statFile(rootDir: string, relPath: string): Promise<{
    ok: boolean;
    error: string;
    exists?: undefined;
    path?: undefined;
    kind?: undefined;
    bytes?: undefined;
    mtimeMs?: undefined;
    binary?: undefined;
    lines?: undefined;
    revision?: undefined;
} | {
    ok: boolean;
    exists: boolean;
    path: string;
    kind: string;
    bytes: number;
    mtimeMs: number;
    error?: undefined;
    binary?: undefined;
    lines?: undefined;
    revision?: undefined;
} | {
    ok: boolean;
    exists: boolean;
    path: string;
    kind: string;
    bytes: number;
    mtimeMs: number;
    binary: boolean;
    lines: number | undefined;
    revision: string;
    error?: undefined;
} | {
    ok: boolean;
    exists: boolean;
    path: string;
    error?: undefined;
    kind?: undefined;
    bytes?: undefined;
    mtimeMs?: undefined;
    binary?: undefined;
    lines?: undefined;
    revision?: undefined;
}>;
export declare function diffPreview(rootDir: string, relPath: string, proposedContent: string): Promise<{
    ok: boolean;
    error: string;
    path?: undefined;
    currentRevision?: undefined;
    diff?: undefined;
} | {
    ok: boolean;
    path: string;
    currentRevision: string;
    diff: string;
    error?: undefined;
}>;
export declare function replaceAcrossFiles(rootDir: string, params: {
    oldText: string;
    newText: string;
    include?: readonly string[];
    path?: string;
    dryRun?: boolean;
}): Promise<{
    ok: boolean;
    error: string;
    dryRun?: undefined;
    filesChanged?: undefined;
    totalReplacements?: undefined;
    files?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    filesChanged: number;
    totalReplacements: number;
    files: {
        path: string;
        replacements: number;
    }[];
    error?: undefined;
}>;
/** RFC-4180 CSV/TSV parser handling quoted commas and embedded newlines. */
export declare function parseDelimitedTable(text: string, delimiter: string): string[][];
export declare function readTableFile(rootDir: string, params: {
    path: string;
    delimiter?: ',' | '\t';
    offset?: number;
    limit?: number;
    columns?: readonly string[];
}, options?: {
    sessionId?: string;
    maxInlineBytes?: number;
    ttlMs?: number;
    cache?: ResultCache;
}): Promise<{
    ok: boolean;
    error: string;
    path?: undefined;
    headers?: undefined;
    totalRows?: undefined;
    rows?: undefined;
    ref?: undefined;
    spilled?: undefined;
    nextOffset?: undefined;
} | {
    ok: boolean;
    path: string;
    headers: never[];
    totalRows: number;
    rows: never[];
    error?: undefined;
    ref?: undefined;
    spilled?: undefined;
    nextOffset?: undefined;
} | {
    ok: boolean;
    path: string;
    headers: any[];
    totalRows: number;
    rows: Record<string, string>[];
    ref: StorageReference;
    spilled: boolean;
    error?: undefined;
    nextOffset?: undefined;
} | {
    ok: boolean;
    path: string;
    headers: any[];
    totalRows: number;
    rows: Record<string, string>[];
    nextOffset: number | null;
    spilled: boolean;
    error?: undefined;
    ref?: undefined;
}>;
//# sourceMappingURL=file-ops.d.ts.map