export interface ArtifactEdit {
    oldString: string;
    newString: string;
}
export interface PatchArtifactArgs {
    artifactId: string;
    edits: readonly ArtifactEdit[];
    title?: string;
    height?: number;
    summary?: string;
}
/** Apply literal edits in order. Every anchor must match exactly once at its step. */
export declare function applyArtifactEdits(html: string, edits: readonly ArtifactEdit[]): string;
//# sourceMappingURL=patch.d.ts.map