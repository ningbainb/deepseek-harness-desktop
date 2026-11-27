export { getHostService } from './get-host-service.ts';
export interface SessionLike {
    id?: string;
    header?: {
        id: string;
    };
    seq?: number;
    eventAt?: (seq: number) => Record<string, unknown> | undefined;
    snapshotEvents?: () => ReadonlyArray<Record<string, unknown>>;
}
export interface AgentLike {
    id: string;
    cwd?: string;
    session?: SessionLike | null;
    followup: (message: unknown) => void;
    whenIdle: () => Promise<void>;
    cancel?: (reason?: unknown) => void;
}
export interface AgentHandleLike {
    agent: AgentLike;
    dispose: () => Promise<void>;
}
export interface AgentsServiceLike {
    get?: (sessionId: string) => AgentLike | undefined;
    resume?: (options: {
        resumeSessionId: string;
        agentOptions?: {
            provider?: string;
            model?: string;
            reasoningEffort?: string;
        };
    }) => Promise<AgentHandleLike>;
    create?: (options: {
        sessionId: string;
        meta?: {
            cwd?: string;
        };
        agentOptions?: {
            provider?: string;
            model?: string;
            reasoningEffort?: string;
        };
    }) => Promise<AgentHandleLike>;
}
export interface AgentDefaultModelServiceLike {
    currentSelection?: () => {
        provider?: string;
        model?: string;
        reasoningEffort?: string;
    } | undefined;
}
export interface LlmServiceLike {
    listProviders?: () => ReadonlyArray<string | {
        id: string;
    }>;
    listModels?: (provider: string) => Promise<ReadonlyArray<{
        id: string;
    }>> | ReadonlyArray<{
        id: string;
    }>;
}
export interface ApprovalRequestLike {
    agent: AgentLike;
    toolName: string;
    callId?: string;
    signal?: AbortSignal;
}
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
export interface WorkspaceInfoLike {
    id: string;
    title?: string;
    path: string;
}
export interface WorkspaceRegistryLike {
    list?: () => ReadonlyArray<WorkspaceInfoLike>;
}
export interface UserScopeServiceLike {
    desktopScope?: () => {
        principalId: string;
    } | undefined;
    currentScope?: () => {
        source?: string;
        principalId: string;
    } | undefined;
}
export interface WebRouteRequestLike {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    socket?: {
        remoteAddress?: string;
    };
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
}
export interface WebRouteResponseLike {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
}
export interface WebRoutePeerLike {
    principal?: {
        kind?: string;
    };
}
export interface WebRouteSpec {
    path: string;
    kind?: 'prefix' | 'exact';
    handler: (request: WebRouteRequestLike, response: WebRouteResponseLike, peer?: WebRoutePeerLike) => Promise<void> | void;
}
export interface WebServerLike {
    register?: (route: WebRouteSpec) => (() => void) | void;
    route?: (method: string, path: string, handler: WebRouteSpec['handler']) => (() => void) | void;
}
export interface SlotsServiceLike {
    inject: (slot: string, factory: () => () => void) => () => void;
    register: (spec: Record<string, unknown>, component: unknown) => () => void;
}
export interface LocaleServiceLike {
    register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => () => void;
}
export interface LoggerLike {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
}
//# sourceMappingURL=host-types.d.ts.map