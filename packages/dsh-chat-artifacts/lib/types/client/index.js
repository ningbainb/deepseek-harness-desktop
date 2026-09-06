/**
 * Browser half of Chat Artifact.
 *
 * The official Tool UI dispatches this component by the wire name
 * render_artifact. The component reads only the frozen call/result block,
 * including its durable presentationMeta, so old sessions replay without
 * consulting current tool definitions.
 */
import { ArtifactToolRow } from "./ArtifactToolRow.js";
import { dictionaries } from "./locales.js";
/** Locale namespace used by the Tool row and card. */
export const NS = 'chat-artifacts';
/** Required browser services: the keyed slot registry and locale service. */
export const inject = ['slots', 'locale'];
/** Register dictionaries and the render_artifact keyed Tool view. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-chat-artifacts: dictionaries');
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'render_artifact',
        locale: NS,
    }, ArtifactToolRow));
}
