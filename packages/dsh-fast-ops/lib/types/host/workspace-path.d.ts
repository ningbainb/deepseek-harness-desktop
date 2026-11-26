/** Resolve a user-supplied path strictly within `rootDir`, blocking traversals and symlink escapes. */
export declare function resolveSafeWorkspacePath(rootDir: string, relPath?: string): {
    ok: true;
    absolutePath: string;
    relativePath: string;
} | {
    ok: false;
    error: string;
};
export declare function sha256Hex(content: Uint8Array | string): string;
export declare function isLikelyBinary(buf: Uint8Array): boolean;
//# sourceMappingURL=workspace-path.d.ts.map