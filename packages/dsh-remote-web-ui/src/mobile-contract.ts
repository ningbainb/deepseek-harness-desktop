/** Browser-safe mobile contract owned by this plugin. */

import type {
  ModelCatalogFailure,
  ModelProviderGroup,
  ModelSelection,
  SessionProjectionBaseline,
  SessionSummary,
  SessionWireEvent,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/types'

export type { SessionSummary, WorkspaceView }

export interface SessionModels {
  readonly current: ModelSelection
  readonly routable: boolean
  readonly groups: readonly ModelProviderGroup[]
  readonly failures: readonly ModelCatalogFailure[]
}

export interface HistoryEntry {
  readonly event: SessionWireEvent
}

export type SessionProjectionsBlock = SessionProjectionBaseline

export type MobileMuxFrame =
  | { readonly type: 'session/event'; readonly sessionId: string; readonly event: SessionWireEvent }
  | { readonly type: 'session/subscribed'; readonly sessionId: string; readonly lastSeq: number }
  | { readonly type: 'session/queue'; readonly sessionId: string; readonly items: readonly unknown[] }
  | { readonly type: 'session/jobs'; readonly sessionId: string; readonly jobs: readonly unknown[] }
  | { readonly type: 'session/projection'; readonly sessionId: string; readonly key: string; readonly value: unknown; readonly seq: number }

export interface MobileProxyResponse<T> {
  readonly rpcId: string
  readonly result:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
}

export interface MobileProxyPush {
  readonly rpcId: string
  readonly payload: MobileMuxFrame | { readonly type: string; readonly [key: string]: unknown }
}

export interface MobileApiProxy {
  readonly workspace: {
    list(request: { readonly rpcId: string; readonly payload: Record<string, never> }): Promise<MobileProxyResponse<{
      readonly items: readonly WorkspaceView[]
      readonly archivedSessionIds: readonly string[]
    }>>
  }
  readonly sessions: {
    create(request: { readonly rpcId: string; readonly payload: unknown }): Promise<MobileProxyResponse<unknown>>
    list(request: { readonly rpcId: string; readonly payload: unknown }): Promise<MobileProxyResponse<{ readonly items: readonly SessionSummary[] }>>
    history(request: { readonly rpcId: string; readonly payload: unknown }): Promise<MobileProxyResponse<unknown>>
    prompt(request: { readonly rpcId: string; readonly payload: unknown }): Promise<MobileProxyResponse<unknown>>
    models(request: { readonly rpcId: string; readonly payload: unknown }): Promise<MobileProxyResponse<unknown>>
    selectModel(request: { readonly rpcId: string; readonly payload: unknown }): Promise<MobileProxyResponse<unknown>>
    rename(request: { readonly rpcId: string; readonly payload: unknown }): Promise<MobileProxyResponse<unknown>>
  }
  readonly events: {
    mux(
      request: { readonly rpcId: string; readonly payload: { readonly sessionId?: string } },
      signal: AbortSignal,
    ): AsyncIterable<MobileProxyPush>
  }
}

export function isMobileMuxFrame(value: unknown): value is MobileMuxFrame {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const frame = value as Record<string, unknown>
  if (typeof frame.type !== 'string' || typeof frame.sessionId !== 'string') return false
  switch (frame.type) {
    case 'session/event':
      return typeof frame.event === 'object' && frame.event !== null && !Array.isArray(frame.event)
    case 'session/subscribed':
      return typeof frame.lastSeq === 'number'
    case 'session/queue':
      return Array.isArray(frame.items)
    case 'session/jobs':
      return Array.isArray(frame.jobs)
    case 'session/projection':
      return typeof frame.key === 'string' && typeof frame.seq === 'number'
    default:
      return false
  }
}
