import { useMemo, useState } from 'react'
import type { Checkpoint } from '../core/protocol.ts'
import { nativeActions, type Comparison } from './api.ts'
import { CheckpointDialog } from './CheckpointDialog.tsx'
import type { CheckpointKey } from './locales.ts'
import { changedTurns } from './model.ts'
import { useSessionCheckpoints } from './timeline.ts'
import css from './checkpoints.module.css'

type SessionStoreHook = <R>(selector: (state: { byId?: Record<string, { cwd?: string }> }) => R) => R
type SectionProps = {
  sessionId: string
  useSessions: SessionStoreHook
  t: (key: CheckpointKey, params?: Record<string, unknown>) => string
  dismissOverlay?: () => void
}

function visibleCheckpoints(checkpoints: readonly Checkpoint[]): Checkpoint[] {
  const byId = new Map<string, Checkpoint>()
  for (const item of changedTurns(checkpoints).values()) {
    byId.set(item.checkpointId, item)
  }
  for (const item of checkpoints) {
    if (item.source === 'pre-restore' && item.stats.filesChanged > 0) {
      byId.set(item.checkpointId, item)
    }
  }
  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp)
}

export function CheckpointSessionCount({ sessionId }: { sessionId: string }) {
  const { checkpoints } = useSessionCheckpoints(sessionId)
  const count = useMemo(() => visibleCheckpoints(checkpoints).length, [checkpoints])
  if (count === 0) return null
  return <span className={css.sectionCount}>{count}</span>
}

export function CheckpointSessionSection({ sessionId, t, useSessions }: SectionProps) {
  const cwd = useSessions(state => (state as { byId?: Record<string, { cwd?: string }> }).byId?.[sessionId]?.cwd)
  const { checkpoints, timeline } = useSessionCheckpoints(sessionId)
  const [selected, setSelected] = useState<{ checkpoint: Checkpoint; comparison: Comparison }>()
  const entries = useMemo(() => visibleCheckpoints(checkpoints), [checkpoints])

  if (entries.length === 0) return null

  const canRestore = Boolean(nativeActions()?.confirmCheckpointRestore)

  return <div className={css.sessionSection} data-dsh-checkpoints-panel="true">
    <ul className={css.sessionList}>
      {entries.map(item => (
        <li key={item.checkpointId} className={css.sessionItem}>
          <div className={css.sessionItemMain}>
            <strong className={css.sessionItemTitle}>
              {item.source === 'pre-restore' ? t('undoCheckpoint') : t('turn', { turn: item.turnId ?? '' })}
            </strong>
            <span className={css.sessionItemMeta}>
              {t('filesShort', { files: item.stats.filesChanged })} · +{item.stats.insertions} / -{item.stats.deletions}
            </span>
          </div>
          <div className={css.sessionItemActions}>
            <button type="button" className={css.button} onClick={() => setSelected({ checkpoint: item, comparison: 'parent' })}>
              {t('view')}
            </button>
            {canRestore && (
              <button type="button" className={css.button} onClick={() => setSelected({ checkpoint: item, comparison: 'working' })}>
                {t('rollback')}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
    {selected && (
      <CheckpointDialog
        initial={selected.checkpoint}
        initialComparison={selected.comparison}
        sessionId={sessionId}
        cwd={cwd}
        timeline={timeline.list()}
        close={() => setSelected(undefined)}
        refresh={timeline.refresh}
        t={t as never}
      />
    )}
  </div>
}
