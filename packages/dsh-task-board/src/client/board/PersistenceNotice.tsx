import { useState } from 'react'
import type { BoardController } from '../../core/controller.ts'
import type { PersistenceStatus } from '../../core/persistence.ts'
import { t } from '../locales.ts'
import css from '../board.module.css'
import { ConfirmDialog } from './ConfirmDialog.tsx'

/** Save feedback stays visible inside the detail overlay as well as the board. */
export function PersistenceNotice({ controller, status }: { controller: BoardController; status: PersistenceStatus }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  if (status === 'saved') return null
  return <div className={css.persistenceNotice} role={status === 'saving' ? 'status' : 'alert'} data-persistence={status}>
    <span>{t(status === 'saving' ? 'save.pending' : status === 'conflict' ? 'save.conflict' : 'save.failed')}</span>
    {status !== 'saving' && <>
      <button type="button" className={css.ghostButton} onClick={() => { void controller.retryPersistence() }}>{t('save.retry')}</button>
      <button type="button" className={css.ghostButton} onClick={() => { setConfirmDiscard(true) }}>{t('save.reload')}</button>
    </>}
    {confirmDiscard && <ConfirmDialog title={t('save.reload')} message={t('save.discardConfirm')} confirmLabel={t('save.reload')} onCancel={() => { setConfirmDiscard(false) }} onConfirm={() => { setConfirmDiscard(false); void controller.reloadSavedTasks() }} />}
  </div>
}
