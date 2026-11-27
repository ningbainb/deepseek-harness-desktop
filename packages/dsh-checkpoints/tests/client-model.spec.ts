import { describe, expect, it } from 'vitest'
import type { Checkpoint } from '../src/core/protocol.ts'
import { changedTurns, splitDiffRows } from '../src/client/model.ts'

function snapshot(checkpointId: string, source: Checkpoint['source'], turnId: string, filesChanged = 1): Checkpoint {
  return {
    checkpointId, source, turnId, sessionId: 'workspace-session', timestamp: 1,
    commitHash: checkpointId, treeHash: checkpointId, skippedLargeFiles: [],
    stats: { filesChanged, insertions: 1, deletions: 0 },
  }
}

describe('checkpoint timeline', () => {
  it('shows a completed turn checkpoint even when the same turn has an intermediate tool snapshot', () => {
    const final = snapshot('final', 'post-turn', '7')
    const items = [snapshot('tool', 'post-tool', '7'), final, snapshot('undo', 'pre-restore', '7')]
    expect([...changedTurns(items)]).toEqual([['7', final]])
  })

  it('keeps the most recent changed tool when a no-op turn produced no final checkpoint', () => {
    const first = snapshot('tool-a', 'post-tool', '7')
    const latest = { ...snapshot('tool-b', 'post-tool', '7'), timestamp: 2 }
    expect([...changedTurns([first, latest, snapshot('noop', 'post-turn', '8', 0)])]).toEqual([['7', latest]])
  })

  it('hides an intermediate edit when the completed turn reverted all of its changes', () => {
    const edited = snapshot('tool-a', 'post-tool', '7')
    const restored = { ...snapshot('same-as-start', 'post-turn', '7', 0), timestamp: 2 }
    expect(changedTurns([restored, edited]).size).toBe(0)
  })
})

describe('plain split diff fallback', () => {
  it('keeps patch headers, aligns changed rows and handles unequal replacement blocks', () => {
    const head = '@@ -2,2 +2,3 @@'
    expect(splitDiffRows(`${head}\n old\n-before\n+after\n+extra\n\\ No newline at end of file`)).toEqual([
      { shared: head }, { shared: ' old' }, { deleted: '-before', added: '+after' },
      { deleted: undefined, added: '+extra' }, { shared: '\\ No newline at end of file' },
    ])
  })

  it('treats a changed line starting with another pair of signs as content inside hunks', () => {
    expect(splitDiffRows('--- a/demo\n+++ b/demo\n@@ -1 +1 @@\n---old\n+++new')).toEqual([
      { shared: '--- a/demo' }, { shared: '+++ b/demo' }, { shared: '@@ -1 +1 @@' },
      { deleted: '---old', added: '+++new' },
    ])
  })
})
