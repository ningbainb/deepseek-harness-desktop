import { type CodeSelection } from './code-files.ts';
interface PatternSelection extends CodeSelection {
    pattern: string;
}
type SearchMatch = {
    path: string;
    line: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    text: string;
    revision: string;
};
export declare function searchAst(root: string, params: PatternSelection & {
    contextLines?: number;
    offset?: number;
    limit?: number;
}, signal?: AbortSignal): Promise<{
    ok: boolean;
    error: string;
    parser?: undefined;
    items?: undefined;
    context?: undefined;
    totalMatches?: undefined;
    nextOffset?: undefined;
    bounded?: undefined;
    skippedUnsupportedFiles?: undefined;
} | {
    ok: boolean;
    parser: string;
    items: SearchMatch[];
    context: {
        path: string;
        revision: string;
        startLine: number;
        endLine: number;
        matchLines: number[];
        lines: string[];
        truncated: boolean;
    }[];
    totalMatches: number;
    nextOffset: number | null;
    bounded: boolean;
    skippedUnsupportedFiles: number;
    error?: undefined;
}>;
interface RewriteParams extends PatternSelection {
    replacement: string;
    dryRun?: boolean;
    expectedRevisions?: Record<string, string>;
}
export declare function rewriteAst(root: string, params: RewriteParams, options?: {
    signal?: AbortSignal;
    beforeWrite?: (paths: string[]) => Promise<void>;
}): Promise<{
    ok: boolean;
    path: string;
    error: string;
    dryRun?: undefined;
    written?: undefined;
    rollbackFailed?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    written: string[];
    path?: undefined;
    error?: undefined;
    rollbackFailed?: undefined;
} | {
    ok: boolean;
    error: string;
    path: string;
    rollbackFailed: string[];
    dryRun?: undefined;
    written?: undefined;
} | {
    ok: boolean;
    error: string;
    rollbackFailed: string[];
    path?: undefined;
    dryRun?: undefined;
    written?: undefined;
} | {
    ok: boolean;
    error: string;
    path?: undefined;
    currentRevision?: undefined;
    dryRun?: undefined;
    affectedFiles?: undefined;
    files?: undefined;
} | {
    ok: boolean;
    path: string;
    error: string;
    currentRevision: string;
    dryRun?: undefined;
    affectedFiles?: undefined;
    files?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    affectedFiles: number;
    files: {
        path: string;
        revision: string;
        matches: number;
        diff: string;
        truncated: boolean;
    }[];
    error?: undefined;
    path?: undefined;
    currentRevision?: undefined;
}>;
export {};
//# sourceMappingURL=ast-tools.d.ts.map