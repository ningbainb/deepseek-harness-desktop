import type { Session } from '@deepseek-ai/dsh-session';
/** Return only direct user text after the latest turn/start boundary. */
export declare function extractCurrentUserQuery(session: Pick<Session, 'events' | 'header'>): string;
//# sourceMappingURL=query.d.ts.map