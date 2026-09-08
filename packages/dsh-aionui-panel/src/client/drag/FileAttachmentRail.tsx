import { useEffect, useRef, useSyncExternalStore } from 'react'
import { t } from '../locales.ts'
import type { FileAttachmentQueue } from './attachments.ts'
import css from '../styles/drag.module.css'

export function FileAttachmentRail({ queue, addImages }: { queue: FileAttachmentQueue; addImages: (files: readonly File[]) => void }) {
  const entries = useSyncExternalStore(queue.subscribe, queue.snapshot)
  const root = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const blocked = entries.some(entry => entry.state !== 'ready')
  useEffect(() => {
    if (!blocked) return
    const guard = (event: Event) => {
      if (!(event.target instanceof Element)) return
      const conversation = root.current?.closest('[data-slot="conversation"]')
      if (!conversation?.contains(event.target)) return
      if (event instanceof KeyboardEvent && (event.key !== 'Enter' || event.shiftKey || event.isComposing || !event.target.matches('textarea'))) return
      if (event instanceof MouseEvent && !event.target.closest('button[type="submit"],button[aria-label="发送"],button[aria-label="Send"],button[title="发送"],button[title="Send"]')) return
      event.preventDefault(); event.stopImmediatePropagation()
      root.current?.querySelector<HTMLElement>('[role="status"]')?.focus()
    }
    document.addEventListener('keydown', guard, true); document.addEventListener('click', guard, true)
    return () => { document.removeEventListener('keydown', guard, true); document.removeEventListener('click', guard, true) }
  }, [blocked])
  return <div ref={root} className={css.attachments} data-dsh-file-attachments>
    <div className={css.fileList}>{entries.map(entry => <div key={entry.id} className={css.fileCard} data-state={entry.state}>
      <strong title={entry.name}>{entry.name}</strong>
      <small>{entry.size ? `${Math.ceil(entry.size / 1024)} KB · ` : ''}{t(`attachment.${entry.state}`)}</small>
      {entry.state === 'ready' && <small>{t('attachment.reference')}</small>}
      {entry.duplicate && <small role="status">{t('attachment.duplicate')}</small>}
      {entry.error && <span role="alert">{entry.error === 'reference-missing' ? t('attachment.missing') : entry.error === 'size-limit' ? t('attachment.tooLarge') : t('attachment.failedHint')}</span>}
      {entry.state === 'failed' && entry.file && <button type="button" onClick={() => queue.retry(entry.id)}>{t('attachment.retry')}</button>}
      <button type="button" aria-label={`${t('attachment.remove')} ${entry.name}`} onClick={() => queue.remove(entry.id)}>×</button>
    </div>)}</div>
    {blocked && <div role="status" tabIndex={-1}>{t('attachment.blocked')}</div>}
    <button type="button" className={css.addFile} onClick={() => picker.current?.click()}>{t('attachment.add')}</button>
    <input ref={picker} type="file" multiple hidden onChange={event => {
      const files = [...(event.target.files ?? [])]
      queue.add(files.filter(file => !file.type.startsWith('image/')))
      addImages(files.filter(file => file.type.startsWith('image/')))
      event.target.value = ''
    }} />
  </div>
}
