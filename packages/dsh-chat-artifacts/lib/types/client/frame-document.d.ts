import { type ArtifactTheme } from './theme-bridge.ts';
export declare const SAFE_ARTIFACT_CSP: string;
interface DocumentOptions {
    mode?: 'static' | 'interactive';
    theme?: ArtifactTheme;
    token?: string;
}
/** Build the frame document for validated HTML. The default also serves standalone exports. */
export declare function buildSafeArtifactDocument(html: string, options?: DocumentOptions): string;
export declare function canRunArtifactScripts(location: Pick<Location, 'protocol' | 'hostname' | 'port'>, guarded: boolean): boolean;
export interface ArtifactFrameDiagnostic {
    message: string;
    line?: number;
    column?: number;
}
export interface ArtifactActionRequest {
    action: string;
    payload: unknown;
}
type FrameMessage = {
    type: 'resize';
    height: number;
} | ({
    type: 'diagnostic';
} & ArtifactFrameDiagnostic) | ({
    type: 'action';
} & ArtifactActionRequest);
export declare function readArtifactFrameMessage(event: Pick<MessageEvent<unknown>, 'source' | 'origin' | 'data'>, source: Window, token: string): FrameMessage | undefined;
export declare function sendArtifactTheme(frame: Window | null | undefined, token: string, theme: ArtifactTheme): void;
export {};
//# sourceMappingURL=frame-document.d.ts.map