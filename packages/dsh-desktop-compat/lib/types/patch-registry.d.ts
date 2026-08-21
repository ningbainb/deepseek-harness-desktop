/**
 * Compatibility metadata remains source-compatible with the 2.x registry while
 * exposing the 3.0 public fields. Consumers should prefer `appliesTo` and
 * `tests`; the legacy aliases are retained on normalized entries.
 */
export interface DesktopCompatPatch {
    id: string;
    appliesTo?: readonly string[];
    upstreamReference: string;
    owner?: string;
    tests?: readonly string[];
    removeWhen: string;
    lastVerified: string;
    reason?: string;
    /** @deprecated Use `appliesTo`. */
    applicableVersions?: readonly string[];
    /** @deprecated Use `tests`. */
    test?: string;
}
export interface NormalizedDesktopCompatPatch extends DesktopCompatPatch {
    appliesTo: readonly string[];
    owner: string;
    tests: readonly string[];
    applicableVersions: readonly string[];
    test: string;
}
export interface CompatPatchRegistryValidationOptions {
    /**
     * An ISO calendar date used to enforce verification freshness. Omit it to
     * use the current UTC date; tests can supply a fixed date.
     */
    today?: string;
    maxAgeDays?: number;
    /** Only the static package export disables this policy during module load. */
    enforceFreshness?: boolean;
    /** A repository-aware predicate supplied by CI or the schema validator. */
    testExists?: (testPath: string) => boolean;
}
export declare const COMPAT_PATCH_MAX_AGE_DAYS = 90;
/**
 * Validates and normalizes canonical 3.0 fields plus legacy 2.x aliases.
 * Freshness is enforced against the current UTC date unless a caller supplies
 * a fixed date or explicitly bypasses it for static package initialization.
 * CI supplies a repository-aware test-file predicate through the public schema
 * validator.
 */
export declare function validateCompatPatchRegistry(entries: readonly DesktopCompatPatch[], options?: CompatPatchRegistryValidationOptions): readonly NormalizedDesktopCompatPatch[];
export declare const DESKTOP_COMPAT_PATCHES: readonly NormalizedDesktopCompatPatch[];
