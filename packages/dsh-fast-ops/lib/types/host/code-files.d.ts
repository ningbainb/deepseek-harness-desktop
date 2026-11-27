export interface CodeSelection {
    path?: string;
    include?: readonly string[];
}
export interface WorkspaceCodeFile {
    path: string;
    absolutePath: string;
    revision: string;
    mode: number;
    text: string;
}
export declare function protectedPath(path: string): boolean;
export declare function selectCodeFiles(root: string, selection: CodeSelection, maxFiles: number, signal?: AbortSignal): Promise<{
    paths: string[];
    bounded: boolean;
    error?: string;
}>;
export declare function readWorkspaceCodeFile(root: string, path: string, maxBytes?: number): Promise<WorkspaceCodeFile | undefined>;
//# sourceMappingURL=code-files.d.ts.map