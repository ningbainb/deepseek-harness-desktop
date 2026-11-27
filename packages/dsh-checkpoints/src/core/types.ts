import type { CheckpointFile, CheckpointSource } from './protocol.ts'

export type { Checkpoint, CheckpointDiff, CheckpointFile, CheckpointSource } from './protocol.ts'

export interface CaptureCheckpoint {
  sessionId: string
  turnId?: string
  baseCheckpointId?: string
  source: CheckpointSource
}

export interface CheckpointDiffOptions {
  path?: string
  against?: 'parent' | 'working'
  baseCheckpointId?: string
  summariesOnly?: boolean
}

export interface RestorePreview {
  checkpointId: string
  token: string
  files: CheckpointFile[]
}

export interface RestoreCheckpoints {
  checkpointId: string
  sessionId: string
  turnId?: string
  token: string
  paths?: string[]
  beforeApply?: () => void
}

export type { CheckpointRestoreResult as RestoreResult } from './protocol.ts'

export interface ShadowGitOptions {
  homePath: string
  gitPath: string
  maxFileBytes?: number
  retention?: { maxItems?: number; maxAgeMs?: number; maxBytes?: number; idleMs?: number }
}
