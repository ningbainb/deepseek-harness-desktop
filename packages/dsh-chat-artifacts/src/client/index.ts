/**
 * Browser half of Chat Artifact.
 *
 * The official Tool UI dispatches this component by the wire name
 * render_artifact. The component reads only the frozen call/result block,
 * including its durable presentationMeta, so old sessions replay without
 * consulting current tool definitions.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ArtifactToolRow } from './ArtifactToolRow.tsx'
import { dictionaries, type ChatArtifactsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'chat-artifacts': ChatArtifactsKey
  }
}

/** Locale namespace used by the Tool row and card. */
export const NS = 'chat-artifacts' as const

/** Required browser services: the keyed slot registry and locale service. */
export const inject = ['slots', 'locale']

/** Register dictionaries and the render_artifact keyed Tool view. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-chat-artifacts: dictionaries')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'render_artifact',
    locale: NS,
  }, ArtifactToolRow))
}
