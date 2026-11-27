import { type ArtifactActionRequest, type ArtifactFrameDiagnostic } from './frame-document.ts';
export { buildSafeArtifactDocument, SAFE_ARTIFACT_CSP } from './frame-document.ts';
export type { ArtifactActionRequest, ArtifactFrameDiagnostic } from './frame-document.ts';
export interface SafeArtifactFrameProps {
    html: string;
    title: string;
    height: number;
    expanded: boolean;
    unloadedLabel: string;
    mode?: 'static' | 'interactive';
    phase?: 'streaming' | 'settled';
    runNonce?: number;
    manualHeight?: number;
    onAutoHeight?: (height: number) => void;
    onDiagnostic?: (diagnostic: ArtifactFrameDiagnostic) => void;
    onAction?: (request: ArtifactActionRequest) => void;
}
export declare const MIN_PREVIEW_HEIGHT = 72;
export declare const MAX_PREVIEW_HEIGHT = 3200;
export declare function SafeArtifactFrame({ html, title, height, expanded, unloadedLabel, mode, phase, runNonce, manualHeight, onAutoHeight, onDiagnostic, onAction, }: SafeArtifactFrameProps): import("react").JSX.Element;
//# sourceMappingURL=SafeArtifactFrame.d.ts.map