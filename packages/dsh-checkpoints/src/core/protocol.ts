export const CHECKPOINT_API = '/api/dsh-checkpoints'
export const CHECKPOINT_HEADER = 'x-dsh-checkpoints'

export type CheckpointSource = 'pre-turn' | 'post-turn' | 'pre-tool' | 'post-tool' | 'pre-restore' | 'restore'

export interface CheckpointFile {
  path: string
  status: 'added' | 'modified' | 'deleted'
  insertions: number
  deletions: number
  binary: boolean
}

export interface Checkpoint {
  checkpointId: string
  sessionId: string
  turnId?: string
  commitHash: string
  treeHash: string
  parentHash?: string
  baseCheckpointId?: string
  timestamp: number
  source: CheckpointSource
  skippedLargeFiles: string[]
  stats: { filesChanged: number; insertions: number; deletions: number }
}

export interface CheckpointDiff {
  patch: string
  files: CheckpointFile[]
}

export interface CheckpointRestorePreview {
  challengeId?: string
  files: CheckpointFile[]
}

export interface CheckpointRestoreResult {
  checkpoint: Checkpoint
  undoCheckpoint: Checkpoint
  files: CheckpointFile[]
}
