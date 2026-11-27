export declare const MCP_APP_API = "/api/mcp-apps";
export declare const MCP_APP_MIME = "text/html;profile=mcp-app";
export declare const MCP_APP_PROTOCOL = "2026-01-26";
export declare const MCP_APP_MAX_HTML: number;
export declare const MCP_APP_TIMEOUT = 30000;
export declare const MCP_APP_USER_REJECTED = -32001;
export type JsonRecord = Record<string, unknown>;
export declare function asObject(value: unknown): JsonRecord | undefined;
export interface McpAppResource {
    html: string;
    connectDomains: string[];
    resourceDomains: string[];
}
export interface McpAppDescriptor {
    kind: 'mcp-app';
    handle: string;
    title: string;
    server: string;
    sessionId: string;
    resourceUri: string;
    resultPreview: string;
}
export interface McpAppPayload extends McpAppResource {
    input: JsonRecord;
    result: JsonRecord;
    readOnlyTools: string[];
}
export declare function isMcpAppDescriptor(input: unknown): input is McpAppDescriptor;
export declare function mcpAppResourceUri(metadata: unknown): string | undefined;
export declare function normalizeMcpAppPolicy(value: unknown): Pick<McpAppResource, 'connectDomains' | 'resourceDomains'>;
export declare function readMcpAppResource(uri: string, result: unknown): McpAppResource | undefined;
export declare function readMcpAppPayload(value: unknown): McpAppPayload | undefined;
export declare class McpAppError extends Error {
    readonly code: number;
    constructor(code: number, message: string);
}
//# sourceMappingURL=mcp-apps.d.ts.map