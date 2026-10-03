import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
/** Return only direct user text after the latest turn/start boundary. */
export declare function extractCurrentUserQuery(session: {
    header: SessionHeader;
    events: readonly SessionEvent[];
}): string;
//# sourceMappingURL=query.d.ts.map