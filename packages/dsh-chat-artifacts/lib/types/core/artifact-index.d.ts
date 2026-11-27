import type { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import { type ArtifactRecord } from './types.ts';
declare const artifactTools: readonly ["render_artifact", "patch_artifact"];
interface ArtifactCall {
    callId: ToolCallId;
    name: (typeof artifactTools)[number];
    artifactId?: string;
}
interface ArtifactIndex {
    latest: Record<string, ArtifactRecord>;
    calls: Record<string, ArtifactCall>;
    recent?: string[];
}
export declare function recentArtifactReferences(state: ArtifactIndex): string;
/** Fold only committed records, including the SDK's restored session prefix. */
export declare const artifactIndex: ProjectionDefinition<'chatArtifacts', ArtifactIndex>;
export {};
//# sourceMappingURL=artifact-index.d.ts.map