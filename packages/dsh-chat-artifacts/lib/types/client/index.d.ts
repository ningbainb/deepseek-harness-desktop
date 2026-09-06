/**
 * Browser half of Chat Artifact.
 *
 * The official Tool UI dispatches this component by the wire name
 * render_artifact. The component reads only the frozen call/result block,
 * including its durable presentationMeta, so old sessions replay without
 * consulting current tool definitions.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type ChatArtifactsKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'chat-artifacts': ChatArtifactsKey;
    }
}
/** Locale namespace used by the Tool row and card. */
export declare const NS: "chat-artifacts";
/** Required browser services: the keyed slot registry and locale service. */
export declare const inject: string[];
/** Register dictionaries and the render_artifact keyed Tool view. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map