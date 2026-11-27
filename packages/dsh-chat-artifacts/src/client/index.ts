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
import { ArtifactTurnTail } from './ArtifactTurnTail.tsx'
import { ArtifactFenceEnhancer } from './ArtifactFenceEnhancer.tsx'
import { ARTIFACT_LIVE_NODE, ArtifactLiveNode, registerArtifactLiveNode } from './ArtifactLiveNode.tsx'
import { dictionaries, type ChatArtifactsKey } from './locales.ts'
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_TOOL_NAME } from '../invariant.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'chat-artifacts': ChatArtifactsKey
  }
}

/** Locale namespace used by the Tool row and card. */
export const NS = 'chat-artifacts' as const

/** Required browser services: the keyed slot registry and locale service. */
export const inject = ['slots', 'locale', 'uiConversation']

/** Register dictionaries and the render_artifact keyed Tool view. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-chat-artifacts: dictionaries')
  ctx.effect(() => registerArtifactLiveNode(ctx), 'dsh-chat-artifacts: live conversation preview')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: ARTIFACT_LIVE_NODE, locale: NS,
  }, ArtifactLiveNode))
  ctx.slots.inject('tool.call.toolview', () => [CHAT_ARTIFACTS_TOOL_NAME, CHAT_ARTIFACTS_PATCH_TOOL_NAME].map(key => ctx.slots.register({
    name: 'tool.call.toolview',
    key,
    locale: NS,
  }, ArtifactToolRow)))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: NS, locale: NS,
  }, ArtifactTurnTail))
  ctx.slots.inject('conversation.chat.markdown.fence', () => ['html-live', 'html'].map(key => ctx.slots.register({
    name: 'conversation.chat.markdown.fence', id: NS, key, locale: NS,
  }, ArtifactFenceEnhancer)))
}
