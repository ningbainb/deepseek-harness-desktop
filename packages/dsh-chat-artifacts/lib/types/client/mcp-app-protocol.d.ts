import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { type JsonRecord } from '../core/mcp-apps.ts';
type Mode = 'inline' | 'fullscreen' | 'pip';
type RequestId = string | number;
type RpcMessage = JsonRecord & {
    jsonrpc: '2.0';
    id?: RequestId;
    method?: string;
};
type Operation = Promise<unknown>;
type JsonOperation = (params: JsonRecord, signal: AbortSignal) => Operation;
interface McpAppProtocolOptions {
    send(message: RpcMessage): void;
    input: JsonRecord;
    result: JsonRecord;
    hostContext: McpUiHostContext;
    network?: {
        connectDomains: string[];
        resourceDomains: string[];
    };
    call(name: string, args: JsonRecord, signal: AbortSignal): Operation;
    context: JsonOperation;
    openLink(url: string, signal: AbortSignal): Operation;
    message: JsonOperation;
    read(uri: string, signal: AbortSignal): Operation;
    resize(height: number): void;
    display(mode: Mode): Mode;
    initialized?(): void;
    scriptFailed?(message: string): void;
    teardownRequested?(): void;
}
export declare function createMcpAppProtocol(options: McpAppProtocolOptions): {
    receive(data: unknown): Promise<void>;
    setHostContext(next: McpUiHostContext): void;
    canDisplay(mode: Mode): boolean;
    teardown(reason: string): Promise<void>;
    dispose(): void;
};
export {};
//# sourceMappingURL=mcp-app-protocol.d.ts.map