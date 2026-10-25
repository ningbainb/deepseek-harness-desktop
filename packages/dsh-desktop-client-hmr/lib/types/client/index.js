import { startClientBridge } from "./bridge.js";
export const name = 'desktop-client-hmr';
export const inject = ['modules'];
export function apply(ctx) {
    const modules = ctx.get('modules');
    const transport = globalThis.__DSH_TRANSPORT__;
    const request = transport?.fetch ?? globalThis.fetch.bind(globalThis);
    ctx.effect(() => startClientBridge({ entries: modules.entries, fetch: request,
        report: message => ctx.logger.warn(message) }), 'desktop-client-hmr: reconnecting event stream');
}
