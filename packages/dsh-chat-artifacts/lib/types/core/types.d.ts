/**
 * Shared, DOM-free contracts and validation for Chat Artifact.
 *
 * The same validator runs before a value enters the session log and again
 * before a replayed value reaches an iframe. Keeping it DOM-free means the
 * host and browser halves cannot drift on the security boundary.
 */
export declare const ARTIFACT_KINDS: readonly ["architecture", "flow", "timeline", "comparison", "roadmap", "dashboard", "table", "wireframe", "report", "other"];
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export declare const ARTIFACT_MAX_BYTES: number;
export declare const ARTIFACT_DEFAULT_HEIGHT = 420;
export declare const ARTIFACT_MIN_HEIGHT = 240;
export declare const ARTIFACT_MAX_HEIGHT = 720;
export declare const ARTIFACT_MAX_TITLE_LENGTH = 160;
export declare const ARTIFACT_MAX_DESCRIPTION_LENGTH = 500;
export interface RenderArtifactArgs {
    title: string;
    kind: ArtifactKind;
    html: string;
    height?: number;
    description?: string;
}
export interface NormalizedArtifactArgs {
    title: string;
    kind: ArtifactKind;
    html: string;
    height: number;
    description?: string;
}
export interface ArtifactRecord extends NormalizedArtifactArgs {
    artifactId: string;
    bytes: number;
    sha256: string;
}
export declare class ArtifactValidationError extends Error {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
/** Return UTF-8 byte length without relying on a Node-only Buffer API. */
export declare function utf8ByteLength(value: string): number;
/** Validate the subset of HTML that the safe artifact frame is allowed to host. */
export declare function validateArtifactHtml(html: string): string[];
/** Normalize and validate the tool arguments before producing a durable record. */
export declare function normalizeArtifactArgs(args: RenderArtifactArgs): NormalizedArtifactArgs;
/** Softly validate a presentationMeta value received from a durable session. */
export declare function isArtifactRecord(value: unknown): value is ArtifactRecord;
/** Extract bounded source text from malformed metadata for the error fallback. */
export declare function artifactSourceFromMeta(value: unknown): string | undefined;
//# sourceMappingURL=types.d.ts.map