import type { MemoryLocaleKey } from './locales.ts';
type Translate = (key: MemoryLocaleKey) => string;
type SessionStoreHook = (selector: (state: {
    byId?: Record<string, {
        workspaceId?: string;
        cwd?: string;
    } | undefined>;
}) => {
    workspaceId?: string;
    cwd?: string;
} | undefined) => {
    workspaceId?: string;
    cwd?: string;
} | undefined;
export declare function WorkspaceKnowledgeCount({ sessionId, useSessions }: {
    sessionId: string;
    useSessions: SessionStoreHook;
}): import("react").JSX.Element | null;
export declare function WorkspaceKnowledgeSection({ sessionId, useSessions, t }: {
    sessionId: string;
    useSessions: SessionStoreHook;
    t: Translate;
}): import("react").JSX.Element | null;
export declare function FilesTreeKnowledgeButton({ sessionId, absolutePath, useSessions, t }: {
    sessionId: string;
    absolutePath: string;
    useSessions: SessionStoreHook;
    t: Translate;
}): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=WorkspaceKnowledgeSection.d.ts.map