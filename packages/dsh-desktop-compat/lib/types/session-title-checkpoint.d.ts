import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionStore } from '@deepseek-ai/dsh-session';
import type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache';
export declare function createSessionTitleCheckpointWriter(services: {
    sessions: Pick<SessionStore, 'get' | 'flush'>;
    cache: Pick<SessionProjectionCache, 'write'>;
}, signal: AbortSignal): (session: Session) => Promise<void>;
export declare function installSessionTitleCheckpoint(ctx: Context): void;
