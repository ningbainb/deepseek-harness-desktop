export { getHostService } from './get-host-service.ts';
export interface ToolSchemaLike {
    name?: string;
    description?: string;
    parameters?: unknown;
}
export interface AgentSessionLike {
    id: string;
    header?: {
        cwd?: string;
    };
}
export interface AgentLike {
    id?: string;
    cwd?: string;
    session?: AgentSessionLike | null;
    workspace?: {
        path?: string;
    } | null;
    ctx?: {
        get?: (name: string) => unknown;
        tools?: unknown;
    };
}
export interface ScopedToolsLike {
    restrict?: (rule: {
        deny?: string[];
        allow?: string[];
    }) => () => void;
    schemas?: () => ReadonlyArray<ToolSchemaLike | [string, ToolSchemaLike?]>;
    view?: (scope?: unknown) => {
        restrictableNames?: ReadonlySet<string>;
    };
}
export interface ToolOutputSpec {
    schema: Record<string, unknown>;
    render: (args: unknown, value: unknown) => Array<{
        type: 'text';
        text: string;
    }>;
}
export interface ToolRegistrationSpec {
    name: string;
    description: string;
    parameters: unknown;
    output: ToolOutputSpec;
    returns?: unknown;
    execute: (args: Record<string, unknown> | undefined, exec?: {
        agent?: AgentLike;
        signal?: AbortSignal;
    }) => unknown;
}
export interface ToolsServiceLike {
    schemas?: () => ReadonlyArray<ToolSchemaLike | [string, ToolSchemaLike?]>;
    view?: (scope?: unknown) => {
        restrictableNames?: ReadonlySet<string>;
    };
    restrict?: (rule: {
        deny?: string[];
        allow?: string[];
    }) => () => void;
    register?: (spec: ToolRegistrationSpec | Omit<ToolRegistrationSpec, 'execute'>, execute?: ToolRegistrationSpec['execute']) => (() => void) | void;
}
export interface SystemPromptServiceLike {
    section?: (spec: {
        name: string;
        order: number;
        text: (() => string) | string;
    }) => (() => void) | void;
}
export interface WorkspaceEntryLike {
    id: string;
    path: string;
}
export interface WorkspacesServiceLike {
    list?: () => ReadonlyArray<WorkspaceEntryLike>;
}
export interface WorkingDirectoryServiceLike {
    ensure: (agent: AgentLike, signal?: AbortSignal) => Promise<string>;
}
export interface UserScopeServiceLike {
    desktopScope?: () => ScopeIdentity | undefined;
    currentScope?: () => ScopeIdentity | undefined;
    canAccess?: (scope: ScopeIdentity, resource: {
        kind: 'session';
        sessionId: string;
    }) => {
        allowed: boolean;
    };
}
interface ScopeIdentity {
    source?: string;
    principalId: string;
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
//# sourceMappingURL=host-types.d.ts.map