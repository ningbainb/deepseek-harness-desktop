import { spawn } from 'node:child_process';
import type { AcpConfigOption, AcpMcpServerParam, AcpModelOption, AcpNegotiatedCapabilities, AcpPermissionRequest, AcpPermissionResponse, AcpStreamEvent } from './types.ts';
export declare class AcpClientError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function assertWorkspaceContained(workspaceCwd: string, targetPath: string): Promise<string>;
export interface AcpClientHandlers {
    onPermissionRequest?: (request: AcpPermissionRequest) => Promise<AcpPermissionResponse>;
    onFsWriteApprove?: (path: string, content: string) => Promise<boolean>;
}
export interface AcpClientLaunchOptions {
    command: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    handlers?: AcpClientHandlers;
    launch?: typeof spawn;
}
export declare class AcpClient {
    private readonly options;
    private child?;
    private nextId;
    private pending;
    private sessionListeners;
    private stderrTail;
    private closed;
    private closePromise?;
    private negotiated?;
    constructor(options: AcpClientLaunchOptions);
    get capabilities(): AcpNegotiatedCapabilities | undefined;
    private ensureStarted;
    private sendRaw;
    private request;
    private notify;
    private handleMessage;
    private normalizeUpdate;
    private handleAgentRequest;
    initialize(clientInfo?: {
        name: string;
        version: string;
    }, clientCapabilities?: {
        fs?: {
            readTextFile?: boolean;
            writeTextFile?: boolean;
        };
        terminal?: boolean;
    }): Promise<AcpNegotiatedCapabilities>;
    authenticate(methodId: string): Promise<void>;
    private parseSessionPayload;
    newSession({ cwd, mcpServers }: {
        cwd: string;
        mcpServers?: AcpMcpServerParam[];
    }): Promise<{
        acpSessionId: string;
        currentModelId?: string;
        availableModels: AcpModelOption[];
        configOptions: AcpConfigOption[];
    }>;
    loadSession({ sessionId, cwd, mcpServers }: {
        sessionId: string;
        cwd: string;
        mcpServers?: AcpMcpServerParam[];
    }): Promise<{
        acpSessionId: string;
        currentModelId?: string;
        availableModels: AcpModelOption[];
        configOptions: AcpConfigOption[];
    }>;
    setModel(sessionId: string, modelId: string): Promise<void>;
    setConfigOption(sessionId: string, configId: string, value: string): Promise<void>;
    prompt({ sessionId, text, signal, onEvent, timeoutMs, }: {
        sessionId: string;
        text: string;
        signal?: AbortSignal;
        onEvent?: (event: AcpStreamEvent) => void;
        timeoutMs?: number;
    }): Promise<{
        stopReason: string;
    }>;
    cancel(sessionId: string): void;
    close(): Promise<void>;
}
