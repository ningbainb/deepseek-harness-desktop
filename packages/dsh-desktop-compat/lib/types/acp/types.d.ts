export declare const ACP_API_PREFIX = "/api/dsh-acp";
export type AcpAuthMode = 'oauth-personal' | 'oauth-business' | 'gemini-api-key' | 'agent-platform' | 'custom';
export type AcpInvocationSource = 'human-interactive' | 'scheduler' | 'subagent' | 'agent-team' | 'workflow-ptc' | 'background' | 'remote-bot' | 'auto-prompt';
export interface AcpAgentDefinition {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    authMode: AcpAuthMode;
    custom?: boolean;
    timeoutMs?: number;
}
export interface AcpNegotiatedCapabilities {
    protocolVersion: number;
    agentInfo?: {
        name?: string;
        version?: string;
    };
    loadSession: boolean;
    mcpHttp: boolean;
    mcpSse: boolean;
    authMethods: Array<{
        id: string;
        name?: string;
    }>;
    raw?: Record<string, unknown>;
}
export interface AcpModelOption {
    id: string;
    name?: string;
}
export interface AcpConfigOption {
    id: string;
    name?: string;
    currentValue?: string;
    options?: Array<{
        value: string;
        name?: string;
    }>;
}
export interface AcpSessionInfo {
    sessionId: string;
    acpSessionId: string;
    agentId: string;
    cwd: string;
    currentModelId?: string;
    availableModels: AcpModelOption[];
    configOptions: AcpConfigOption[];
}
export interface AcpPermissionRequest {
    requestId: string | number;
    sessionId: string;
    toolCall?: {
        title?: string;
        kind?: string;
        rawInput?: unknown;
    };
    options: Array<{
        optionId: string;
        name?: string;
        kind?: string;
    }>;
}
export interface AcpPermissionResponse {
    outcome: {
        outcome: 'selected';
        optionId: string;
    } | {
        outcome: 'cancelled';
    };
}
export type AcpStreamEvent = {
    type: 'message_delta';
    text: string;
} | {
    type: 'thought_delta';
    text: string;
} | {
    type: 'plan_update';
    entries: Array<{
        content: string;
        status?: string;
        priority?: string;
    }>;
} | {
    type: 'tool_call';
    toolCallId: string;
    title?: string;
    kind?: string;
    status?: string;
    rawInput?: unknown;
} | {
    type: 'tool_call_update';
    toolCallId: string;
    status?: string;
    content?: unknown;
    diff?: {
        path: string;
        oldText?: string;
        newText?: string;
    };
} | {
    type: 'permission_request';
    permissionId: string;
    title?: string;
    kind?: string;
    rawInput?: unknown;
    options: Array<{
        optionId: string;
        name?: string;
        kind?: string;
    }>;
} | {
    type: 'turn_finished';
    stopReason: string;
} | {
    type: 'error';
    message: string;
};
export interface AcpMcpServerParam {
    name: string;
    type: 'stdio' | 'http';
    command?: string;
    args?: string[];
    env?: Array<{
        name: string;
        value: string;
    }>;
    url?: string;
    headers?: Array<{
        name: string;
        value: string;
    }>;
}
export interface AcpProbeResult {
    agentId: string;
    state: 'ready' | 'not-installed' | 'not-authenticated' | 'error';
    capabilities?: AcpNegotiatedCapabilities;
    error?: string;
}
