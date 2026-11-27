import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import { nativeActions, type Comparison } from './api.ts'
import { CheckpointDialog } from './CheckpointDialog.tsx'
import { useCheckpointTimeline } from './timeline.ts'
import css from './checkpoints.module.css'

type TailProps = PropsLocale<'workspace-checkpoints'> & PropsRuntime<'conversation.chat.turnTail'>

export function CheckpointTurnTail({ sessionId, seq, turn, t, useSessions }: TailProps) {
  const cwd = useSessions(state => (state as { byId?: Record<string, { cwd?: string }> }).byId?.[sessionId]?.cwd)
  const [dialog, setDialog] = useState<Comparison>()
  const { checkpoint, timeline } = useCheckpointTimeline(sessionId, turn.turn, seq)
  if (!checkpoint) return null
  const { filesChanged, insertions, deletions } = checkpoint.stats
  return <div className={css.tail} data-dsh-checkpoint={checkpoint.checkpointId} data-checkpoint-turn={turn.turn}>
    <span>{t('saved', { files: filesChanged, insertions, deletions })}</span>
    <button className={css.button} type="button" data-checkpoint-open="" onClick={() => setDialog('parent')}>{t('view')}</button>
    {nativeActions()?.confirmCheckpointRestore && <button className={css.button} type="button" data-checkpoint-restore=""
      onClick={() => setDialog('working')}>{t('rollback')}</button>}
    {dialog && <CheckpointDialog initial={checkpoint} initialComparison={dialog} sessionId={sessionId} cwd={cwd}
      timeline={timeline.list()} close={() => setDialog(undefined)} refresh={timeline.refresh} t={t} />}
  </div>
}
