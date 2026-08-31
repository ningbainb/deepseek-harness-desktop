/**
 * DSH_HOME resolution shared by the plugin family's Host halves: the
 * environment override wins, the platform home fallback follows. Mirrors
 * what dsh-pet and dsh-liangshen each used to implement locally.
 */
/** Expand a leading ~ (or ~user) in a path, platform-style. */
export declare function expandHome(path: string, home?: string): string;
/**
 * Resolve the DSH home directory.
 * @param env - process environment to read DSH_HOME from.
 * @param home - platform home directory fallback (test seam).
 * @returns the absolute DSH home path.
 */
export declare function resolveDshHome(env?: NodeJS.ProcessEnv, home?: string): string;
/** Resolve the DSH home directory from the live environment. */
export declare function dshHome(): string;
//# sourceMappingURL=dsh-home.d.ts.map