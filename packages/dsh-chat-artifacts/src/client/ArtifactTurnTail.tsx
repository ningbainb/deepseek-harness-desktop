import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ArtifactCard } from './ArtifactCard.tsx'
import { McpAppCard } from './McpAppFrame.tsx'
import type { McpAppDescriptor } from '../core/mcp-apps.ts'
import { artifactAnchor, artifactTranscript, sameArtifactEntries, type ArtifactAtTurn } from './artifact-transcript.ts'
import css from './artifact.module.css'

const empty: readonly ArtifactAtTurn[] = []
const noApps: readonly McpAppDescriptor[] = []

export function ArtifactTurnTail({ turn, useChat, inputActions, t }: PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'chat-artifacts'>) {
  const entries = useChat(snapshot => artifactTranscript(snapshot).tails.get(turn.turn) ?? empty, sameArtifactEntries)
  const apps = useChat(snapshot => artifactTranscript(snapshot).mcpAppTails.get(turn.turn) ?? noApps,
    (a, b) => a.length === b.length && a.every((item, index) => item === b[index]))
  return entries.length > 0 || apps.length > 0 ? <div className={css.tail} data-artifact-turn-tail={turn.turn}>
    {entries.map(entry => <PinnedArtifact key={entry.record.artifactId} entry={entry} useChat={useChat} inputActions={inputActions} t={t} />)}
    {apps.map(app => <McpAppCard key={app.handle} app={app} t={t} inputActions={inputActions} />)}
  </div> : null
}

type TailProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'chat-artifacts'>

function PinnedArtifact({ entry, useChat, inputActions, t }: Pick<TailProps, 'useChat' | 'inputActions' | 't'> & { entry: ArtifactAtTurn }) {
  const artifacts = useChat(snapshot =>
    artifactTranscript(snapshot).history.get(entry.record.artifactId)?.filter(item => item.seq <= entry.seq) ?? empty,
  sameArtifactEntries)
  return <ArtifactCard artifact={entry.record} versions={artifacts.map(item => item.record)}
    anchor={artifactAnchor(entry.turn, entry.record.artifactId)} inputActions={inputActions} t={t} />
}
