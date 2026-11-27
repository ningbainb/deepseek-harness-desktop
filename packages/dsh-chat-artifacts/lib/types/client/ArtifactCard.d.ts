import type { PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { type ArtifactKind, type ArtifactRecord } from '../core/types.ts';
type Translate = TranslateNS<'chat-artifacts'>;
type InputActions = PropsRuntime<'conversation.input.left'>['inputActions'];
export interface ArtifactCardProps {
    artifact: ArtifactRecord;
    t: Translate;
    versions?: readonly ArtifactRecord[];
    anchor?: string;
    inputActions?: InputActions;
}
export declare function ArtifactCard({ artifact, t, versions, anchor, inputActions }: ArtifactCardProps): import("react").JSX.Element;
export declare function StreamingArtifactCard({ title, kind, html, t }: {
    title: string;
    kind?: ArtifactKind;
    html: string;
    t: Translate;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=ArtifactCard.d.ts.map