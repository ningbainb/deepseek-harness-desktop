import { useState, type ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './artifact.module.css'

type Viewport = 'desktop' | 'tablet' | 'phone'
type Translate = TranslateNS<'chat-artifacts'>

export function ArtifactFullscreenModal({ title, open, onClose, t, children }: {
  title: string
  open: boolean
  onClose: () => void
  t: Translate
  children: ReactNode
}) {
  const [viewport, setViewport] = useState<Viewport>('desktop')
  return <Modal headless open={open} title={title} onClose={onClose} className={css.modal}>
    <header className={css.modalHeader}>
      <strong>{title}</strong>
      <div className={css.segments} role="group" aria-label={t('card.viewport')}>
        {(['desktop', 'tablet', 'phone'] as const).map(size =>
          <button key={size} type="button" aria-pressed={viewport === size} onClick={() => setViewport(size)}>
            {t(`viewport.${size}`)}
          </button>)}
      </div>
      <button type="button" className={css.actionButton} onClick={onClose} aria-label={t('card.close')}>{t('card.close')}</button>
    </header>
    <div data-artifact-viewport={viewport} className={css.modalCanvas}>{children}</div>
  </Modal>
}
