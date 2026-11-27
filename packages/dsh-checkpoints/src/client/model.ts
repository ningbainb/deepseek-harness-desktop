import type { Checkpoint } from '../core/protocol.ts'

export function changedTurns(checkpoints: readonly Checkpoint[]): Map<string, Checkpoint> {
  const turns = new Map<string, Checkpoint>()
  for (const checkpoint of checkpoints) {
    if (!checkpoint.turnId) continue
    if (checkpoint.source !== 'post-turn' && checkpoint.source !== 'post-tool') continue
    const previous = turns.get(checkpoint.turnId)
    if (previous?.source === 'post-turn' && checkpoint.source === 'post-tool') continue
    if (!previous || previous.source !== checkpoint.source || checkpoint.timestamp > previous.timestamp) {
      turns.set(checkpoint.turnId, checkpoint)
    }
  }
  for (const [turn, checkpoint] of turns) {
    if (checkpoint.stats.filesChanged === 0) turns.delete(turn)
  }
  return turns
}

type DiffRow = { shared: string } | { deleted: string | undefined; added: string | undefined }

export function splitDiffRows(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let inHunk = false
  let deletion: string[] = []
  let addition: string[] = []
  const flush = () => {
    const count = Math.max(deletion.length, addition.length)
    for (let index = 0; index < count; index++) rows.push({ deleted: deletion[index], added: addition[index] })
    deletion = []
    addition = []
  }
  for (const line of patch.replace(/\r?\n$/u, '').split(/\r?\n/u)) {
    if (line.startsWith('@@ ')) inHunk = true
    if (line.startsWith('diff --git ')) inHunk = false
    if (inHunk && line.startsWith('-')) deletion.push(line)
    else if (inHunk && line.startsWith('+')) addition.push(line)
    else {
      flush()
      rows.push({ shared: line })
    }
  }
  flush()
  return rows
}
