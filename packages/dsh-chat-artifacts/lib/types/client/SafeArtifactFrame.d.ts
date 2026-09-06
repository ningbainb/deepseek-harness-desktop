/** Defense-in-depth policy for the isolated artifact document. */
export declare const SAFE_ARTIFACT_CSP: string;
/** Wrap a validated fragment in a document with a restrictive CSP and theme tokens. */
export declare function buildSafeArtifactDocument(html: string): string;
export interface SafeArtifactFrameProps {
    html: string;
    title: string;
    height: number;
    expanded: boolean;
    unloadedLabel: string;
}
/**
 * Render an artifact in a sandbox without allow-scripts. Far-away frames are
 * removed to keep long conversations cheap; the document is deterministic, so
 * remounting has no application state to lose.
 */
export declare function SafeArtifactFrame({ html, title, height, expanded, unloadedLabel, }: SafeArtifactFrameProps): import("react").JSX.Element;
//# sourceMappingURL=SafeArtifactFrame.d.ts.map