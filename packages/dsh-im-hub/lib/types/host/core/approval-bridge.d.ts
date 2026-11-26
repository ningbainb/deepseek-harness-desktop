import type { Context } from '@deepseek-ai/cordis';
import type { ApprovalOutcome, ApprovalRequestLike } from '../../core/host-types.ts';
import type { ChannelAccessPolicy } from '../../core/settings.ts';
export interface BoundConversationRef {
    conversationKey: string;
    sendPrompt: (text: string) => Promise<void>;
}
export declare function summarizeToolRequest(request: ApprovalRequestLike): string | undefined;
export declare class ApprovalBridge {
    private readonly pending;
    private dualApproval;
    private readonly lookupBinding;
    private readonly onLog?;
    constructor(options: {
        lookupBinding: (agentId: string) => BoundConversationRef | undefined;
        dualApproval?: boolean;
        onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
    });
    setDualApproval(enabled: boolean): void;
    pendingCount(): number;
    pendingForConversation(conversationKey: string): ReadonlyArray<{
        id: string;
        toolName: string;
        commandPreview?: string;
        createdAt: number;
    }>;
    install(ctx: Context): () => void;
    handleRequest(request: ApprovalRequestLike, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>;
    resolveFromIm(conversationKey: string, approvalId: string | undefined, decision: 'allowed-once' | 'rejected', senderId: string, policy: ChannelAccessPolicy): {
        ok: boolean;
        id?: string;
        toolName?: string;
        message: string;
    };
    resolveById(approvalId: string, decision: 'allowed-once' | 'rejected'): boolean;
    cancelConversation(conversationKey: string): void;
    disposeAll(): void;
    private finishEntry;
    private cleanupEntry;
}
//# sourceMappingURL=approval-bridge.d.ts.map