import { utf8ByteLength } from "./types.js";
export const MCP_APP_API = '/api/mcp-apps';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';
export const MCP_APP_PROTOCOL = '2026-01-26';
export const MCP_APP_MAX_HTML = 2 * 1024 * 1024;
export const MCP_APP_TIMEOUT = 30_000;
export const MCP_APP_USER_REJECTED = -32001;
export function asObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
export function isMcpAppDescriptor(input) {
    const value = asObject(input);
    return value?.kind === 'mcp-app'
        && typeof value.handle === 'string' && /^[a-f0-9]{32}$/u.test(value.handle)
        && typeof value.server === 'string' && /^[a-zA-Z0-9_-]{1,32}$/u.test(value.server)
        && typeof value.title === 'string' && value.title.length <= 160
        && typeof value.sessionId === 'string' && value.sessionId.length > 0 && value.sessionId.length <= 256
        && uiUri(value.resourceUri)
        && typeof value.resultPreview === 'string' && value.resultPreview.length <= 65_536;
}
function uiUri(value) {
    if (typeof value !== 'string' || value.length > 4096 || !/^ui:\/\/[^\s?#]+(?:[?#][^\s]*)?$/u.test(value))
        return false;
    try {
        const uri = new URL(value);
        return uri.protocol === 'ui:' && uri.hostname.length > 0 && !uri.username && !uri.password;
    }
    catch {
        return false;
    }
}
export function mcpAppResourceUri(metadata) {
    const data = asObject(metadata);
    const uri = asObject(data?.ui)?.resourceUri ?? data?.['ui/resourceUri'];
    return uiUri(uri) ? uri : undefined;
}
function declaredOrigins(input, connect) {
    if (!Array.isArray(input))
        return [];
    const valid = new Set();
    for (const candidate of input.slice(0, 32)) {
        if (typeof candidate !== 'string' || candidate.length > 253
            || !/^(?:https|wss):\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?\/?$/u.test(candidate))
            continue;
        try {
            const url = new URL(candidate);
            if ((url.protocol !== 'https:' && !(connect && url.protocol === 'wss:'))
                || !url.hostname.includes('.') || /^[\d.]+$/u.test(url.hostname)
                || /(?:^|\.)(?:local|localhost|internal|home|lan)$/u.test(url.hostname))
                continue;
            valid.add(url.origin);
        }
        catch {
            continue;
        }
    }
    return [...valid];
}
export function normalizeMcpAppPolicy(value) {
    const csp = asObject(value);
    return {
        connectDomains: declaredOrigins(csp?.connectDomains, true),
        resourceDomains: declaredOrigins(csp?.resourceDomains, false),
    };
}
function resourceHtml(item) {
    if (typeof item.text === 'string')
        return item.text;
    if (typeof item.blob !== 'string' || item.blob.length > 4 * Math.ceil(MCP_APP_MAX_HTML / 3))
        return;
    try {
        const bytes = Uint8Array.from(atob(item.blob), character => character.charCodeAt(0));
        if (bytes.length <= MCP_APP_MAX_HTML)
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch { }
}
export function readMcpAppResource(uri, result) {
    if (!uiUri(uri))
        return;
    const contents = asObject(result)?.contents;
    if (!Array.isArray(contents))
        return;
    for (const raw of contents.slice(0, 32)) {
        const item = asObject(raw);
        if (item?.uri !== uri || typeof item.mimeType !== 'string')
            continue;
        const mime = item.mimeType.toLowerCase().replace(/\s+/gu, '');
        if (mime !== MCP_APP_MIME && mime !== 'text/html')
            continue;
        const html = resourceHtml(item);
        if (!html || html.length > MCP_APP_MAX_HTML || utf8ByteLength(html) > MCP_APP_MAX_HTML)
            return;
        const csp = asObject(asObject(item._meta)?.ui)?.csp;
        return { html, ...normalizeMcpAppPolicy(csp) };
    }
}
export function readMcpAppPayload(value) {
    const input = asObject(value);
    if (typeof input?.html !== 'string' || input.html.length > MCP_APP_MAX_HTML || utf8ByteLength(input.html) > MCP_APP_MAX_HTML)
        return;
    const args = asObject(input.input);
    const result = asObject(input.result);
    if (!args || !result || !Array.isArray(result.content) || !Array.isArray(input.readOnlyTools))
        return;
    const readOnlyTools = input.readOnlyTools.slice(0, 256).filter((tool) => typeof tool === 'string');
    return { html: input.html, ...normalizeMcpAppPolicy(input), input: args, result, readOnlyTools };
}
export class McpAppError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
