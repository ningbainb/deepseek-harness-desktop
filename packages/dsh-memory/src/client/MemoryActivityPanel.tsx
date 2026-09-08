import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { MemoryConfig } from '../core/config.ts'
import type { MemoryActivity } from '../core/activity.ts'
import type { MemoryPublicItem } from '../core/schema.ts'
import type { MemoryLocaleKey } from './locales.ts'
import styles from './memory.module.css'

type Props = { t: (key: MemoryLocaleKey) => string; enabled: boolean; sessionId?: string; onEdit?: (item: MemoryPublicItem) => void }

export function MemoryActivityPanel({ t, enabled, sessionId, onEdit }: Props) {
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState<MemoryActivity | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<MemoryPublicItem | null>(null)
  const [content, setContent] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const query = sessionId ? '?sessionId=' + encodeURIComponent(sessionId) : ''
  const refresh = async () => {
    const sequence = ++requestSequence.current
    try {
      const response = await fetch('/api/dsh-memory/activity' + query, { cache: 'no-store' })
      const value = await response.json()
      if (!response.ok || !value.ok) throw new Error('unavailable')
      if (sequence === requestSequence.current) { setActivity(value.activity); setError(false) }
    } catch { if (sequence === requestSequence.current) { setActivity(null); setError(true) } }
  }
  useEffect(() => {
    setActivity(null)
    if (!open) return
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 5_000)
    return () => { clearInterval(timer); requestSequence.current++ }
  }, [open, sessionId, enabled])
  useEffect(() => { setEditing(null); setDeleting(null) }, [sessionId])
  const mutate = async (path: string, body: unknown) => {
    if (busy) return
    setBusy(true); setError(false)
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const value = await response.json()
      if (!response.ok || !value.ok) throw new Error('unavailable')
      setEditing(null); setDeleting(null)
      await refresh()
    } catch { setError(true) }
    finally { setBusy(false) }
  }
  const activityQuery = activity?.sessionId ? '?sessionId=' + encodeURIComponent(activity.sessionId) : query
  return <details ref={detailsRef} className={styles.activity} data-memory-activity="true" onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
    if (event.key === 'Escape' && detailsRef.current) { event.stopPropagation(); detailsRef.current.open = false; detailsRef.current.querySelector('summary')?.focus() }
  }}>
    <summary>{t(onEdit ? 'settings.activity.ready' : 'settings.activityTitle')}{open && activity ? ` · ${activity.items.length}` : ''}</summary>
    <div className={styles.activityBody}>
      <p className={styles.muted}>{t('settings.activityHint')}</p>
      <p role="status">{t(('settings.activity.' + (!enabled ? 'disabled' : activity?.status ?? 'none')) as MemoryLocaleKey)}{activity?.preparedAt ? ' · ' + new Date(activity.preparedAt).toLocaleTimeString() : ''}</p>
      {error && <p className={styles.error} role="alert">{t('settings.activityError')}</p>}
      {enabled && activity?.items.map(({ item, reason, truncated }) => <article className={styles.activityItem} key={item.id}>
        <p>{item.content}</p>
        <p className={styles.muted}>{t(('settings.' + item.scope) as MemoryLocaleKey)} · {t(('settings.reason.' + reason) as MemoryLocaleKey)}{truncated ? ' · ' + t('settings.truncated') : ''}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={busy} onClick={() => void mutate('/api/dsh-memory/activity' + activityQuery, { operation: 'ignore', id: item.id })}>{t('settings.ignore')}</button>
          <button type="button" className={styles.button} disabled={busy} onClick={() => { if (onEdit) onEdit(item); else { setEditing(item); setContent(item.content) } }}>{t('settings.edit')}</button>
          <button type="button" className={styles.danger} disabled={busy} onClick={() => setDeleting(item.id)}>{t('settings.delete')}</button>
        </div>
        {deleting === item.id && <div className={styles.actions}><button className={styles.button} onClick={() => setDeleting(null)}>{t('settings.cancelAction')}</button><button className={styles.danger} disabled={busy} onClick={() => void mutate('/api/dsh-memory/items', { operation: 'remove', id: item.id, expectedUpdatedAt: item.updatedAt })}>{t('settings.confirmDelete')}</button></div>}
      </article>)}
      {editing && <div className={styles.field}><textarea aria-label={t('settings.content')} value={content} maxLength={2000} onChange={event => setContent(event.target.value)} /><div className={styles.actions}><button className={styles.button} onClick={() => setEditing(null)}>{t('settings.cancelAction')}</button><button className={styles.primary} disabled={busy || !content.trim()} onClick={() => void mutate('/api/dsh-memory/items', { ...editing, operation: 'save', content, expectedUpdatedAt: editing.updatedAt })}>{t('settings.save')}</button></div></div>}
      <div className={styles.actions}>
        {!!activity?.ignoredCount && <button type="button" className={styles.button} disabled={busy} onClick={() => void mutate('/api/dsh-memory/activity' + activityQuery, { operation: 'ignore', id: null })}>{t('settings.restoreIgnored')} · {activity.ignoredCount}</button>}
        <button type="button" className={styles.button} disabled={busy} onClick={() => void refresh()}>{t('settings.reload')}</button>
      </div>
    </div>
  </details>
}

export function MemoryHeaderStatus(props: { sessionId: string; settingsScope: SettingsScope<MemoryConfig>; t: Props['t'] }) {
  const snapshot = useSyncExternalStore(listener => props.settingsScope.subscribe(listener), () => props.settingsScope.getSnapshot())
  return <div className={styles.headerActivity}><MemoryActivityPanel sessionId={props.sessionId} t={props.t} enabled={snapshot.value?.enabled === true} /></div>
}
