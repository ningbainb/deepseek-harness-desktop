import type { Context } from '@deepseek-ai/cordis';
import type { Message, RequestMessage } from '@deepseek-ai/dsh-llm';
export interface TranscriptBalanceDiagnostic {
    readonly outcome: 'balanced' | 'stripped-trailing-assistant';
    readonly droppedCallIds: readonly string[];
    readonly droppedMessagesCount: number;
}
interface ExtractedToolCall {
    id: string;
    name?: string;
}
export declare function extractToolCallsFromAssistantMessage(message: Message): ExtractedToolCall[];
export declare function balanceTranscriptMessages(messages: readonly RequestMessage[] | undefined): {
    messages: readonly RequestMessage[];
    diagnostic?: TranscriptBalanceDiagnostic;
};
export declare function installTranscriptBalanceGuard(ctx: Context): void;
export {};
