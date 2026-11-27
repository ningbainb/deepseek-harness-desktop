import { type KeyObject } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { McpAppError, type JsonRecord, type McpAppDescriptor, type McpAppPayload } from '../core/mcp-apps.ts';
type Risk = 'L0' | 'L1' | 'L2' | 'L3';
export interface McpAppTool {
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        openWorldHint?: boolean;
    };
    _meta?: unknown;
}
export interface McpAppProvider {
    server: string;
    tools: ReadonlyMap<string, McpAppTool>;
    readOnlyTools: ReadonlySet<string>;
    read(uri: string, signal: AbortSignal): Promise<unknown>;
    call(name: string, args: JsonRecord, signal: AbortSignal): Promise<unknown>;
    active(): boolean;
}
export declare class McpAppApprovalRequired extends McpAppError {
    readonly challengeId: string;
    constructor(challengeId: string);
}
export declare function mcpToolVisibility(tool: McpAppTool, scope: 'app' | 'model'): boolean;
export declare function mcpToolRisk(tool: McpAppTool, readOnlyTools: ReadonlySet<string>): Risk;
export declare function boundedMcpResult(value: unknown): JsonRecord;
export declare class McpAppsBridge {
    private readonly ctx;
    private readonly approvalKey;
    private readonly handles;
    private readonly resources;
    private readonly resourceIds;
    private readonly requests;
    private readonly contexts;
    private readonly providerIds;
    private readonly challenges;
    constructor(ctx: Context, approvalKey?: KeyObject | undefined);
    private getScope;
    private canUseAgent;
    private prune;
    private trim;
    private cachedResource;
    record(provider: McpAppProvider, tool: McpAppTool, args: JsonRecord, result: JsonRecord, execution: ToolRunContext): Promise<McpAppDescriptor | undefined>;
    private lookup;
    resource(handle: unknown, sessionId: unknown, signal: AbortSignal): Promise<McpAppPayload>;
    private consume;
    readResource(data: JsonRecord, signal: AbortSignal): Promise<JsonRecord>;
    describeApproval(challengeId: string): {
        serverName: string;
        toolName: string;
        argumentsPreview: string;
    };
    private createApproval;
    private consumeApproval;
    call(data: JsonRecord, signal: AbortSignal): Promise<JsonRecord>;
    updateContext(data: JsonRecord): void;
    modelContext(sessionId: string | undefined): string;
}
export {};
//# sourceMappingURL=mcp-app-bridge.d.ts.map