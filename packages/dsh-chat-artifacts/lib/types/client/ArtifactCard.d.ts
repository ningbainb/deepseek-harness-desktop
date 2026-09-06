import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ArtifactRecord } from '../core/types.ts';
type ArtifactTranslate = TranslateNS<'chat-artifacts'>;
export interface ArtifactCardProps {
    artifact: ArtifactRecord;
    t: ArtifactTranslate;
}
/** Card body for one validated artifact record. */
export declare function ArtifactCard({ artifact, t }: ArtifactCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ArtifactCard.d.ts.map