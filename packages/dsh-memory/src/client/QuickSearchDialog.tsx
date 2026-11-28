import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { postLocalSearch, type IndexStatus, type SessionMatch } from './local-search-api.ts'
import type { MemoryLocaleKey } from './locales.ts'
import styles from './memory.module.css'

type Translate = (key: MemoryLocaleKey) => string

let dialogOpen = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function setDialogOpen(next: boolean): void {
  if (dialogOpen === next) return
  dialogOpen = next
  for (const listener of listeners) listener()
}

export function openQuickSearch(): void {
  setDialogOpen(true)
}

export function toggleQuickSearch(): void {
  setDialogOpen(!dialogOpen)
}

function SearchGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function QuickSearchDialog({ t, onOpenSession }: {
  t: Translate
  onOpenSession?: (sessionId: string) => void
}) {
  const open = useSyncExternalStore(subscribe, () => dialogOpen, () => false)
  const dialog = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [status, setStatus] = useState<IndexStatus>()
  const [hits, setHits] = useState<SessionMatch[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) {
      node.showModal()
      inputRef.current?.focus()
    } else if (!open && node.open) {
      node.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void postLocalSearch<IndexStatus>('status', { workspaceId: workspaceId || undefined }, controller.signal)
      .then(next => { if (!controller.signal.aborted) setStatus(next) })
      .catch(() => {})
    return () => controller.abort()
  }, [open, workspaceId])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setHits(undefined)
      setError(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setBusy(true)
      setError(false)
      void postLocalSearch<{ hits: SessionMatch[] }>('sessions', {
        query: trimmed,
        workspaceId: workspaceId || undefined,
        limit: 20,
      }, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) setHits(result.hits)
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false)
        })
    }, 160)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query, workspaceId])

  if (!open) return null

  return (
    <dialog
      ref={dialog}
      className={styles.quickDialog}
      data-dsh-quick-search-dialog="true"
      aria-label={t('search.quickOpen')}
      onClose={() => setDialogOpen(false)}
      onClick={event => {
        if (event.target === event.currentTarget) setDialogOpen(false)
      }}
    >
      <header className={styles.quickHeader}>
        <div className={styles.quickSearchBox}>
          <SearchGlyph />
          <input
            ref={inputRef}
            type="search"
            value={query}
            maxLength={1200}
            aria-label={t('search.history')}
            placeholder={t('search.quickPlaceholder')}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <button type="button" className={styles.button} onClick={() => setDialogOpen(false)}>
          {t('search.close')}
        </button>
      </header>
      <div className={styles.quickControls}>
        <select
          aria-label={t('settings.workspace')}
          value={workspaceId}
          onChange={event => setWorkspaceId(event.target.value)}
        >
          <option value="">{t('search.allWorkspaces')}</option>
          {status?.workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.title}</option>)}
        </select>
        {status && (
          <div className={styles.searchStatus}>
            <span>{status.status.vectorCount > 0 ? `BM25 + ${t('search.vector')}` : 'BM25'}</span>
            <span>{t('search.sessionCount')} {status.status.counts.sessions}</span>
            <span>{t('search.chunkCount')} {status.status.counts.knowledge}</span>
          </div>
        )}
      </div>
      <div className={styles.quickResults}>
        {error && <p className={styles.error} role="alert">{t('search.unavailable')}</p>}
        {!query.trim() && <p className={styles.muted}>{t('search.quickHint')}</p>}
        {busy && <p className={styles.muted} role="status">{t('settings.loading')}</p>}
        {!busy && query.trim() && hits && hits.length === 0 && (
          <p className={styles.muted} role="status">{t('search.noMatches')}</p>
        )}
        {hits && hits.length > 0 && (
          <ul className={styles.searchHits} aria-label={t('search.history')}>
            {hits.map(hit => (
              <li key={`${hit.sessionId}:${hit.seq}:${hit.excerpt}`}>
                <button
                  type="button"
                  className={styles.quickHitBtn}
                  onClick={() => {
                    onOpenSession?.(hit.sessionId)
                    setDialogOpen(false)
                  }}
                >
                  <div className={styles.quickHitHead}>
                    <strong>{hit.title || hit.sessionId}</strong>
                    <span className={styles.muted}>{t('search.turn')} {hit.turn}</span>
                  </div>
                  <p className={styles.quickHitExcerpt}>{hit.excerpt}</p>
                  <div className={styles.searchStatus}>
                    {hit.reasons.map(reason => (
                      <span key={reason}>{t(('search.reason.' + reason) as MemoryLocaleKey)}</span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}

export function QuickSearchSidebarEntry({ wide, t, onOpenSession }: {
  wide: boolean
  t: Translate
  onOpenSession?: (sessionId: string) => void
}) {
  const label = t('search.quickOpen')
  return (
    <div className={styles.quickFooterWrap} data-wide={wide ? 'wide' : 'rail'} data-dsh-quick-search-entry="true">
      <button
        type="button"
        className={styles.quickFooterBtn}
        data-dsh-quick-search-trigger="true"
        aria-label={label}
        title={`${label} (Ctrl+K)`}
        onClick={() => openQuickSearch()}
      >
        <SearchGlyph />
        {wide && <span className={styles.quickFooterLabel}>{label}</span>}
        {wide && <span className={styles.quickShortcut}>Ctrl+K</span>}
      </button>
      <QuickSearchDialog t={t} onOpenSession={onOpenSession} />
    </div>
  )
}
