import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client';
import { type McpAppDescriptor } from '../core/mcp-apps.ts';
import { type ArtifactRecord } from '../core/types.ts';
export declare const artifactVersion: (record: ArtifactRecord) => number;
export interface ArtifactAtTurn {
    record: ArtifactRecord;
    callId: string;
    seq: number;
    turn: number;
}
interface ArtifactTranscript {
    tails: ReadonlyMap<number, readonly ArtifactAtTurn[]>;
    mcpAppTails: ReadonlyMap<number, readonly McpAppDescriptor[]>;
    history: ReadonlyMap<string, readonly ArtifactAtTurn[]>;
    pinnedCalls: ReadonlyMap<string, ArtifactAtTurn>;
}
export declare function artifactTranscript(snapshot: ChatSnapshot): ArtifactTranscript;
export declare function artifactAnchor(turn: number, id: string): string;
export declare function sameArtifactEntries(a: readonly ArtifactAtTurn[], b: readonly ArtifactAtTurn[]): boolean;
export {};
//# sourceMappingURL=artifact-transcript.d.ts.map