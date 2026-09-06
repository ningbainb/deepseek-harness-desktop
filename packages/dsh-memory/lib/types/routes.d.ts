import type { IncomingMessage } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { MemoryService } from './core/service.ts';
export declare const MEMORY_API_PREFIX = "/api/dsh-memory";
export declare const MEMORY_ITEMS_PATH: string;
export declare const MEMORY_PENDING_PATH: string;
/** Loopback + same-origin fence; memory is never a LAN API. */
export declare function isTrustedMemoryRequest(request: IncomingMessage): boolean;
export declare function makeMemoryRoutes(options: {
    service: MemoryService;
}): WebRoute[];
//# sourceMappingURL=routes.d.ts.map