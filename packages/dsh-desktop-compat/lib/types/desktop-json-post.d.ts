import type { IncomingMessage, ServerResponse } from 'node:http';
export declare function writeJson(response: ServerResponse, status: number, value: unknown): void;
/** Enforce the Desktop main-process capability before reading a request or consulting Host state. */
export declare function desktopJsonPost(capabilityToken: string | undefined, maxBodyBytes: number, handleBody: (body: unknown, response: ServerResponse) => Promise<void>): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
