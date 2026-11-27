import { type CodeSelection } from './code-files.ts';
export declare function resolveGitExecutable(workspace: string): Promise<string | undefined>;
export declare function mapRepository(root: string, params: CodeSelection & {
    maxTokens?: number;
}, signal?: AbortSignal): Promise<{
    ok: boolean;
    error: string;
    map?: undefined;
    files?: undefined;
    estimatedTokens?: undefined;
    bounded?: undefined;
} | {
    ok: boolean;
    map: string;
    files: number;
    estimatedTokens: number;
    bounded: boolean;
    error?: undefined;
}>;
//# sourceMappingURL=repo-map.d.ts.map