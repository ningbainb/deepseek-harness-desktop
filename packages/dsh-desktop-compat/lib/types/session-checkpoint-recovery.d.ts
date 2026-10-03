import type { SessionHandle, SessionPersistence } from '@deepseek-ai/dsh-session-persistence';
import type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache';
import type { SessionStore } from '@deepseek-ai/dsh-session';
export interface SessionCheckpointRecoveryServices {
    persistence: Pick<SessionPersistence, 'list'> & {
        open: (...args: Parameters<SessionPersistence['open']>) => Promise<Pick<SessionHandle, 'header' | 'inheritedEventCount' | 'read' | 'close'>>;
    };
    cache: Pick<SessionProjectionCache, 'cachedSnapshot' | 'coldSnapshot'>;
    sessions: Pick<SessionStore, 'get'>;
}
export declare function installSessionCheckpointRecovery(ctx: Context): void;
export declare function refreshBlankSessionCheckpoints(services: SessionCheckpointRecoveryServices, signal: AbortSignal): Promise<{
    scanned: number;
    refreshed: number;
    failed: number;
}>;
import type { Context } from '@deepseek-ai/cordis';
