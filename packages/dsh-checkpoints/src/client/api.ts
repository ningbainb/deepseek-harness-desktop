import { CHECKPOINT_API, CHECKPOINT_HEADER, type Checkpoint, type CheckpointDiff, type CheckpointRestorePreview, type CheckpointRestoreResult } from '../core/protocol.ts'

export interface NativeCheckpointActions {
  confirmCheckpointRestore?: (challengeId: string) => Promise<string | undefined>
  openExtensionDock?: (options: { setting: 'agent-inbox' }) => Promise<{ opened: boolean }>
}

export function nativeActions(): NativeCheckpointActions | undefined {
  return (window as Window & { dshDesktop?: NativeCheckpointActions }).dshDesktop
}

export class CheckpointRequestError extends Error {
  constructor(readonly code: string) { super(code) }
}

async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(CHECKPOINT_API + path, {
    method: body ? 'POST' : 'GET',
    headers: { [CHECKPOINT_HEADER]: '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin', cache: 'no-store', signal,
  })
  const envelope = await response.json() as { result?: T; error?: { code?: string } }
  if (!response.ok || envelope.result === undefined) throw new CheckpointRequestError(envelope.error?.code ?? 'failed')
  return envelope.result
}

export type Comparison = 'parent' | 'working'

export function checkpointList(sessionId: string, signal?: AbortSignal): Promise<Checkpoint[]> {
  return request('/list?sessionId=' + encodeURIComponent(sessionId), undefined, signal)
}

export function checkpointDiff(sessionId: string, checkpointId: string, against: Comparison, path: string | undefined, signal: AbortSignal): Promise<CheckpointDiff> {
  return request('/diff', { sessionId, checkpointId, against, path }, signal)
}

export function prepareCheckpoint(sessionId: string, checkpointId: string, paths?: string[]): Promise<CheckpointRestorePreview> {
  return request('/prepare', { sessionId, checkpointId, paths })
}

export function restoreCheckpoint(sessionId: string, challengeId: string, approvalProof: string): Promise<CheckpointRestoreResult> {
  return request('/restore', { sessionId, challengeId, approvalProof })
}
