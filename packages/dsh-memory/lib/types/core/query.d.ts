import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
/** Read uncommitted direct-user input from the official pre-step admission batch. */
export declare function extractPendingUserQuery(header: SessionHeader, messages: readonly UserMessage[]): string;
/** Return only direct user text after the latest turn/start boundary. */
export declare function extractCurrentUserQuery(session: {
    header: SessionHeader;
    events: readonly SessionEvent[];
}): string;
/** Propose one short, user-authored observation from the latest ended turn. */
export declare function proposeTurnMemory(snapshot: {
    header: SessionHeader;
    events: readonly SessionEvent[];
}, passive: boolean): string | undefined;
//# sourceMappingURL=query.d.ts.map