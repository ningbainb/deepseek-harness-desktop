import type { IncomingMessage } from 'node:http';
/** Validate the socket, loopback Host and browser site/origin before route-specific authorization. */
export declare function isLoopbackRequest(request: IncomingMessage): boolean;
