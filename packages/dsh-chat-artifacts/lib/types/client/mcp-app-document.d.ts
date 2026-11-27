import { type McpAppResource } from '../core/mcp-apps.ts';
export declare function buildMcpAppDocument(resource: McpAppResource, token: string, networkAllowed: boolean): string;
export declare function readMcpAppFrameMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, source: Window, token: string): unknown;
export declare function sendMcpAppFrameMessage(source: Window | null | undefined, token: string, message: unknown): void;
//# sourceMappingURL=mcp-app-document.d.ts.map