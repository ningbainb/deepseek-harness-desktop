import type { Context } from '@deepseek-ai/cordis'
import type { ChatNode, ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationMatch, ConversationNodeDefinitionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ARTIFACT_KINDS, ARTIFACT_MAX_BYTES, isArtifactRecord, type ArtifactKind } from '../core/types.ts'
import { CHAT_ARTIFACTS_TOOL_NAME } from '../invariant.ts'
import { StreamingArtifactCard } from './ArtifactCard.tsx'
import css from './artifact.module.css'

export const ARTIFACT_LIVE_NODE = 'chat-artifact-live' as const

interface ArtifactLiveData {
  readonly turn: number
  readonly callIds: readonly string[]
  readonly closed: boolean
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    [ARTIFACT_LIVE_NODE]: ArtifactLiveData
  }
}

export function registerArtifactLiveNode(ctx: Context): () => void {
  const definition: ConversationNodeDefinitionInput<ArtifactLiveData> = {
    kind: ARTIFACT_LIVE_NODE,
    target: 'chat',
    match: {
      'assistant/live-chunk': matchArtifactCall,
      'tool/call': matchArtifactCall,
      'turn/end': event => event.type === 'turn/end' ? { id: String(event.data.turn), role: 'update' } : null,
    },
    start: ({ id }, { event }) => {
      const call = artifactCall(event)
      return { turn: Number(id), callIds: call === undefined ? [] : [call.id], closed: false }
    },
    update: ({ state }, { event }) => {
      if (event.type === 'turn/end') return { ...state, closed: true }
      const call = artifactCall(event)
      return call === undefined || state.callIds.includes(call.id)
        ? state : { ...state, callIds: [...state.callIds, call.id] }
    },
    publication: match => match.event.type === 'assistant/live-chunk' ? 'animation-frame' : 'immediate',
    buildViewNode: ({ key, id, start, state }) => {
      if (start === undefined || state === undefined || state.closed) return null
      const node: ChatNode<typeof ARTIFACT_LIVE_NODE> = {
        key, id, target: 'chat', kind: ARTIFACT_LIVE_NODE, location: start.location,
        anchorSeq: start.event.seq + 0.01, visibility: 'visible', groupTree: 'turn', data: state,
      }
      return node
    },
  }
  return ctx.uiConversation.events.register(definition)
}

function artifactCall(event: ConversationMatch['event']): { turn: number; id: string } | undefined {
  if (event.type === 'tool/call' && event.data.name === CHAT_ARTIFACTS_TOOL_NAME) {
    return { turn: event.data.turn, id: String(event.data.callId) }
  }
  if (event.type !== 'assistant/live-chunk') return undefined
  const chunk = event.data.chunk
  if (chunk.type === 'tool-call-delta' && chunk.name === CHAT_ARTIFACTS_TOOL_NAME) {
    return { turn: event.data.turn, id: String(chunk.id) }
  }
}

function matchArtifactCall(event: ConversationMatch['event']) {
  const call = artifactCall(event)
  return call === undefined ? null : { id: String(call.turn), role: 'start' as const }
}

type LiveNodeProps = PropsRuntime<'conversation.chat.node', typeof ARTIFACT_LIVE_NODE> & PropsLocale<'chat-artifacts'>

export function ArtifactLiveNode({ node, useChat, t }: LiveNodeProps) {
  const { turn, callIds } = node.data
  const calls = useChat(snapshot => snapshot.locations.getTurn(turn).flatMap(key => {
    const item = snapshot.nodes.get(key)
    if (item?.kind !== 'tool-call') return []
    const block = (item as ChatNode<'tool-call'>).data.root
    return callIds.includes(block.callId) ? [block] : []
  }), (previous, next) => previous.length === next.length && previous.every((block, index) => block === next[index]))
  return <div className={css.tail}>
    {calls.map(block => <LiveArtifact key={block.callId} block={block} t={t} />)}
  </div>
}

function LiveArtifact({ block, t }: Pick<LiveNodeProps, 't'> & { block: ToolCallBlock }) {
  if ('kind' in block) {
    return block.isError || !isArtifactRecord(block.meta) ? null
      : <StreamingArtifactCard title={block.meta.title} kind={block.meta.kind} html={block.meta.html} t={t} />
  }
  const title = block.args.textPrefix('title', 160)?.trim() || t('tool.render')
  const kind = block.args.textPrefix('kind', 32)
  const safeKind = (ARTIFACT_KINDS as readonly string[]).includes(kind ?? '') ? kind as ArtifactKind : undefined
  const html = (block.args.stringLength('html', { step: 256 }) ?? 0) > ARTIFACT_MAX_BYTES
    ? '' : block.args.textPrefix('html', ARTIFACT_MAX_BYTES) ?? ''
  return <StreamingArtifactCard title={title} kind={safeKind} html={html} t={t} />
}
