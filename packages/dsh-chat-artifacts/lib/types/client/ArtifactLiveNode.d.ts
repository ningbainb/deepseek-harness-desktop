import type { Context } from '@deepseek-ai/cordis';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export declare const ARTIFACT_LIVE_NODE: "chat-artifact-live";
interface ArtifactLiveData {
    readonly turn: number;
    readonly callIds: readonly string[];
    readonly closed: boolean;
}
declare module '@deepseek-ai/dsh-client-ui-chat/client' {
    interface ChatNodeDataMap {
        [ARTIFACT_LIVE_NODE]: ArtifactLiveData;
    }
}
export declare function registerArtifactLiveNode(ctx: Context): () => void;
type LiveNodeProps = PropsRuntime<'conversation.chat.node', typeof ARTIFACT_LIVE_NODE> & PropsLocale<'chat-artifacts'>;
export declare function ArtifactLiveNode({ node, useChat, t }: LiveNodeProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ArtifactLiveNode.d.ts.map