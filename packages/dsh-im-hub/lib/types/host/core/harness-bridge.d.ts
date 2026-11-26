import type { Context } from '@deepseek-ai/cordis';
import { type AgentHandleLike, type AgentLike } from '../../core/host-types.ts';
import type { InboundMessage, OutboundReply } from './types.ts';
export interface ConversationBinding {
    conversationKey: string;
    sessionId: string;
    agentId: string;
    agent: AgentLike;
    handle?: AgentHandleLike;
    workspacePath: string;
    lastActivity: number;
    lastReplyContext?: Record<string, unknown>;
}
export type TurnRunner = (message: InboundMessage, bindingKey: string, workspacePath: string) => Promise<string>;
export interface HarnessBridgeOptions {
    ctx?: Context;
    getDefaultWorkspacePath: () => string;
    getMaxReplyChars: () => number;
    turnRunner?: TurnRunner;
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}
export declare function buildConversationKey(channel: string, conversationId: string): string;
export declare class HarnessBridge {
    private readonly ctx?;
    private readonly getDefaultWorkspacePath;
    private readonly getMaxReplyChars;
    private readonly customTurnRunner?;
    private readonly onLog?;
    private readonly bindings;
    private readonly sessionToKey;
    private readonly workspaceOverrides;
    private readonly inflightOpen;
    private readonly turnCollectors;
    constructor(options: HarnessBridgeOptions);
    install(ctx: Context): () => void;
    getBinding(conversationKey: string): ConversationBinding | undefined;
    getBindingByAgentId(agentId: string): ConversationBinding | undefined;
    resolveWorkspacePath(conversationKey: string): string;
    setWorkspace(conversationKey: string, nextPath: string): Promise<string>;
    stopConversation(conversationKey: string): Promise<boolean>;
    resetConversation(conversationKey: string): Promise<boolean>;
    runTurn(message: InboundMessage, sendReply: (reply: OutboundReply) => Promise<void>): Promise<void>;
    disposeAll(): Promise<void>;
    private getOrCreateBinding;
    private resolveDefaultAgentOptions;
    private createBinding;
    private executeAgentTurn;
}
//# sourceMappingURL=harness-bridge.d.ts.map