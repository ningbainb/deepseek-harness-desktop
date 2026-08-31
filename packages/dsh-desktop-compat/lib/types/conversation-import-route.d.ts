/** Loopback-only Host route for importing an external transcript as a DSH session. */
import type { Context } from '@deepseek-ai/cordis';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
export declare const DESKTOP_CONVERSATION_IMPORT_PATH = "/desktop/conversation-import";
type ImportFailure = {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
type ImportSuccess = {
    ok: true;
    workspaceId: string;
    sessionId: string;
    projectCwd: string;
    title: string;
    seedEventCount: number;
    eventCount: number;
};
/**
 * @deepseek-ai/dsh-base mounts the official log-backed title service, but
 * Desktop Compat keeps it optional so the route also works in a minimal Host
 * composition. The structural type avoids importing a runtime package solely
 * for a Cordis context augmentation.
 */
type SessionTitleAuthority = {
    get(session: unknown): {
        title?: string;
    } | undefined;
    rename(session: unknown, title: string): {
        title?: string;
    };
};
type ConversationImportContext = Pick<Context, 'sessions' | 'workspaceRegistry'> & {
    get?: (name: string, strict?: boolean) => unknown;
    sessionTitle?: SessionTitleAuthority;
};
declare function normalizeRequest(value: unknown): {
    projectCwd: string;
    title?: string;
    importId?: string;
    sessionId?: string;
    createdAt?: number;
    seed: readonly SessionEvent[];
} | undefined;
export declare function importConversationIntoHost(ctx: ConversationImportContext, request: ReturnType<typeof normalizeRequest>): Promise<ImportSuccess | ImportFailure>;
export declare function createDesktopConversationImportRoute(ctx: ConversationImportContext, { capabilityToken }?: {
    capabilityToken?: string;
}): WebRoute;
export declare function registerDesktopConversationImportRoute(ctx: Context): () => void;
export {};
