import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_TOOL_NAME } from '../invariant.ts'
import { isArtifactId, isArtifactRecord, type ArtifactRecord } from './types.ts'

const artifactTools = [CHAT_ARTIFACTS_TOOL_NAME, CHAT_ARTIFACTS_PATCH_TOOL_NAME] as const

interface ArtifactCall {
  callId: ToolCallId
  name: (typeof artifactTools)[number]
  artifactId?: string
}

interface ArtifactIndex {
  latest: Record<string, ArtifactRecord>
  calls: Record<string, ArtifactCall>
  recent?: string[]
}

const RECENT_ARTIFACT_LIMIT = 3

export function recentArtifactReferences(state: ArtifactIndex): string {
  const ids = state.recent ?? Object.keys(state.latest).slice(-RECENT_ARTIFACT_LIMIT).reverse()
  const references = ids.flatMap(id => {
    const record = state.latest[id]
    return record ? [id + ' (' + record.kind + ', v' + (record.version ?? 1) + ')'] : []
  })
  return references.length > 0 ? 'Recent diagrams in this conversation, most recently updated first: '
    + references.join(', ') + '. Match the current subject before using an identifier in patch_artifact.' : ''
}

function resultKey(turn: number, step: number, callId: ToolCallId): string {
  return `${turn}/${step}/${callId}`
}

function patchTarget(args: string): string | undefined {
  try {
    const value = (JSON.parse(args) as { artifactId?: unknown } | null)?.artifactId
    if (isArtifactId(value)) return value
  } catch {
    // The runtime settles malformed arguments without running the tool body.
  }
}

function projectArtifactEvent(state: ArtifactIndex, event: SessionEvent): ArtifactIndex {
  if (event.type === 'tool/call') {
    const { turn, step, name, callId } = event.data
    if (name !== CHAT_ARTIFACTS_TOOL_NAME && name !== CHAT_ARTIFACTS_PATCH_TOOL_NAME) return state
    const artifactId = name === CHAT_ARTIFACTS_PATCH_TOOL_NAME ? patchTarget(event.data.arguments) : undefined
    const key = resultKey(turn, step, callId)
    const call: ArtifactCall = { name, callId, ...(artifactId === undefined ? {} : { artifactId }) }
    return { ...state, calls: { ...state.calls, [key]: call } }
  }
  if (event.type !== 'tool/result') return state

  const { turn, step, message, meta } = event.data
  const key = resultKey(turn, step, message.toolCallId)
  const call = state.calls[key]
  if (!call) return state
  const calls = { ...state.calls }
  delete calls[key]
  if (message.isError || !isArtifactRecord(meta)) return { ...state, calls }

  const current = state.latest[meta.artifactId]
  const valid = call.name === CHAT_ARTIFACTS_TOOL_NAME
    ? current === undefined && (meta.version ?? 1) === 1
    : call.artifactId === meta.artifactId && current !== undefined && meta.version === (current.version ?? 1) + 1
  if (!valid) return { ...state, calls }
  const recent = state.recent ?? Object.keys(state.latest).slice(-RECENT_ARTIFACT_LIMIT).reverse()
  return {
    calls,
    latest: { ...state.latest, [meta.artifactId]: meta },
    recent: [meta.artifactId, ...recent.filter(id => id !== meta.artifactId)].slice(0, RECENT_ARTIFACT_LIMIT),
  }
}

/** Fold only committed records, including the SDK's restored session prefix. */
export const artifactIndex: ProjectionDefinition<'chatArtifacts', ArtifactIndex> = {
  key: 'chatArtifacts',
  stateVersion: 1,
  stateSchema: z.object({
    latest: z.record(z.custom<string>(isArtifactId), z.custom<ArtifactRecord>(isArtifactRecord)),
    recent: z.array(z.custom<string>(isArtifactId)).max(RECENT_ARTIFACT_LIMIT).optional(),
    calls: z.record(z.string(), z.object({
      callId: z.custom<ToolCallId>(value => typeof value === 'string'),
      name: z.enum(artifactTools),
      artifactId: z.custom<string>(isArtifactId).optional(),
    })),
  }),
  init: () => ({ latest: {}, calls: {} }),
  apply: projectArtifactEvent,
}
