import type { ChatNode, ChatSnapshot, ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { isMcpAppDescriptor, type McpAppDescriptor } from '../core/mcp-apps.ts'
import { isArtifactRecord, type ArtifactRecord } from '../core/types.ts'
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_TOOL_NAME } from '../invariant.ts'

export const artifactVersion = (record: ArtifactRecord) => record.version ?? 1

const records = new WeakMap<object, ArtifactRecord | null>()

function readRecord(block: ToolResultNode): ArtifactRecord | undefined {
  const knownTool = block.name === CHAT_ARTIFACTS_TOOL_NAME || block.name === CHAT_ARTIFACTS_PATCH_TOOL_NAME
  const orphanedResult = block.name === '' && block.call === null
  if (block.isError || (!knownTool && !orphanedResult)) return undefined
  const meta = block.meta
  if (typeof meta !== 'object' || !meta) return undefined
  if (!records.has(meta)) records.set(meta, isArtifactRecord(meta) ? meta : null)
  return records.get(meta) ?? undefined
}

export interface ArtifactAtTurn {
  record: ArtifactRecord
  callId: string
  seq: number
  turn: number
}
interface ArtifactTranscript {
  tails: ReadonlyMap<number, readonly ArtifactAtTurn[]>
  mcpAppTails: ReadonlyMap<number, readonly McpAppDescriptor[]>
  history: ReadonlyMap<string, readonly ArtifactAtTurn[]>
  pinnedCalls: ReadonlyMap<string, ArtifactAtTurn>
}
const indexes = new WeakMap<ChatSnapshot, ArtifactTranscript>()

export function artifactTranscript(snapshot: ChatSnapshot): ArtifactTranscript {
  const cached = indexes.get(snapshot)
  if (cached) return cached

  const completed = new Set<number>()
  const ordered: ArtifactAtTurn[] = []
  const mcpAppTails = new Map<number, McpAppDescriptor[]>()
  const visit = (block: ToolCallBlock, turn: number) => {
    if (!('kind' in block)) return
    const record = readRecord(block)
    if (record) ordered.push({ record, turn, seq: block.seq, callId: block.callId })
    const app = block.meta
    if (!block.isError && block.name.startsWith('mcp__') && isMcpAppDescriptor(app)) {
      const apps = mcpAppTails.get(turn) ?? []
      if (!apps.some(entry => entry.handle === app.handle)) apps.push(app)
      mcpAppTails.set(turn, apps)
    }
    for (const child of block.subCalls) visit(child, turn)
  }

  for (const node of snapshot.nodes.values()) {
    const location = node.location
    if (location.kind !== 'turn' && location.kind !== 'step') continue
    if (node.kind === 'turn-tail' && location.turn.status === 'closed') completed.add(location.turn.turn)
    if (node.kind === 'tool-call') visit((node as ChatNode<'tool-call'>).data.root, location.turn.turn)
  }
  ordered.sort((a, b) => a.seq - b.seq)
  const byTurn = new Map<number, Map<string, ArtifactAtTurn>>()
  const history = new Map<string, ArtifactAtTurn[]>()
  for (const artifact of ordered) {
    const id = artifact.record.artifactId
    const entries = history.get(id) ?? []
    entries.push(artifact)
    history.set(id, entries)
    if (!completed.has(artifact.turn)) continue
    const latest = byTurn.get(artifact.turn) ?? new Map()
    latest.set(id, artifact)
    byTurn.set(artifact.turn, latest)
  }

  const pinnedCalls = new Map<string, ArtifactAtTurn>()
  for (const entry of ordered) {
    const pinned = byTurn.get(entry.turn)?.get(entry.record.artifactId)
    if (pinned) pinnedCalls.set(entry.callId, pinned)
  }
  const tails = new Map([...byTurn].map(([turn, latest]) => [turn, [...latest.values()]]))
  const result = { tails, history, pinnedCalls, mcpAppTails }
  indexes.set(snapshot, result)
  return result
}

export function artifactAnchor(turn: number, id: string): string {
  return 'dsh-artifact-' + turn + '-' + id
}

export function sameArtifactEntries(a: readonly ArtifactAtTurn[], b: readonly ArtifactAtTurn[]): boolean {
  return a.length === b.length && a.every((item, index) => item.record === b[index]?.record && item.seq === b[index]?.seq)
}
