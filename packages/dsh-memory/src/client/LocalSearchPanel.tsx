import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { MemoryMatchReason } from '../core/activity.ts'
import type { MemoryLocaleKey } from './locales.ts'
import styles from './memory.module.css'

interface IndexStatus {
  status: { counts: { memory: number; sessions: number; knowledge: number }; engine: 'fts5' | 'typescript'; vectorCount: number }
  workspaces: Array<{ id: string; title: string }>
  sources: Array<{ path: string; kind: 'path' | 'document' }>
  indexing: boolean
}

interface SessionMatch {
  sessionId: string
  seq: number
  turn: number
  title: string
  excerpt: string
  timestamp: number
  reasons: readonly MemoryMatchReason[]
}

type Translate = (key: MemoryLocaleKey) => string

async function post<T>(operation: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/dsh-local-search/' + operation, {
    method: 'POST', cache: 'no-store', signal,
    headers: { 'content-type': 'application/json', 'x-dsh-local-search': '1' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('Local search is unavailable')
  return await response.json() as T
}

export function LocalSearchPanel({ t, onSuggest, onOpenSession }: {
  t: Translate
  onSuggest: (sessionId: string) => void
  onOpenSession?: (sessionId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<IndexStatus>()
  const [workspaceId, setWorkspaceId] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [query, setQuery] = useState('')
  const [after, setAfter] = useState('')
  const [before, setBefore] = useState('')
  const [hits, setHits] = useState<SessionMatch[]>()
  const [searchIndexing, setSearchIndexing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const action = useRef<AbortController>()
  useEffect(() => () => action.current?.abort(), [])
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const snapshot = await post<IndexStatus>('status', { workspaceId: workspaceId || undefined }, abort.signal)
        if (!abort.signal.aborted) {
          setStatus(snapshot)
          if (snapshot.indexing) timer = setTimeout(() => { void refresh() }, 2500)
        }
      } catch {
        if (!abort.signal.aborted) {
          setStatus(undefined)
          setError(true)
        }
      }
    }
    void refresh()
    return () => { clearTimeout(timer); abort.abort() }
  }, [open, workspaceId, revision])

  const perform = async (operation: (signal: AbortSignal) => Promise<void>) => {
    action.current?.abort()
    const abort = new AbortController()
    action.current = abort
    setBusy(true)
    setError(false)
    try { await operation(abort.signal) }
    catch { if (!abort.signal.aborted) setError(true) }
    finally { if (action.current === abort && !abort.signal.aborted) setBusy(false) }
  }

  const search = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!query.trim()) return
    void perform(async signal => {
      const result = await post<{ hits: SessionMatch[]; indexing: boolean }>('sessions', {
        query: query.trim(), workspaceId: workspaceId || undefined,
        after: after ? new Date(after + 'T00:00:00').getTime() : undefined,
        before: before ? new Date(before + 'T23:59:59.999').getTime() : undefined,
      }, signal)
      if (!signal.aborted) {
        setHits(result.hits)
        setSearchIndexing(result.indexing)
        setRevision(value => value + 1)
      }
    })
  }

  const change = (operation: 'add' | 'remove', path: string): void => {
    if (!workspaceId || !path.trim()) return
    void perform(async signal => {
      await post('sources', { workspaceId, path: path.trim(), operation }, signal)
      if (!signal.aborted) {
        if (operation === 'add') setSourcePath('')
        setRevision(value => value + 1)
      }
    })
  }

  return <details className={styles.details} data-memory-local-search="true" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('search.title')}</summary>
    <div className={styles.searchBody}>
      {status && <div className={styles.searchStatus} aria-live="polite">
        <span>{status.status.vectorCount > 0 ? 'BM25 + ' + t('search.vector') : 'BM25'}</span>
        <span>{t('search.memoryCount')} {status.status.counts.memory}</span>
        <span>{t('search.sessionCount')} {status.status.counts.sessions}</span>
        <span>{t('search.chunkCount')} {status.status.counts.knowledge}</span>
        {status.indexing && <span>{t('search.indexing')}</span>}
      </div>}
      {error && <p className={styles.error} role="alert">{t('search.unavailable')}</p>}
      {status && <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={busy || status.indexing} onClick={() => void perform(async signal => {
          await post('rebuild', {}, signal)
          if (!signal.aborted) setRevision(value => value + 1)
        })}>{t('search.rebuild')}</button>
      </div>}
      <label className={styles.field}>{t('settings.workspace')}
        <select value={workspaceId} onChange={event => { setWorkspaceId(event.target.value); setHits(undefined) }} disabled={busy}>
          <option value="">{t('search.allWorkspaces')}</option>
          {status?.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}
        </select>
      </label>
      <form onSubmit={search} className={styles.searchForm}>
        <label className={styles.field}>{t('search.history')}
          <input type="search" value={query} maxLength={1200} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className={styles.searchDates}>
          <label className={styles.field}>{t('search.after')}<input type="date" value={after} onChange={event => setAfter(event.target.value)} /></label>
          <label className={styles.field}>{t('search.before')}<input type="date" value={before} onChange={event => setBefore(event.target.value)} /></label>
        </div>
        <button type="submit" className={styles.primary} disabled={busy || !query.trim()}>{t('search.submit')}</button>
      </form>
      {hits && hits.length === 0 && <p className={styles.muted} role="status">
        {t(searchIndexing ? 'search.indexing' : 'search.noMatches')}
      </p>}
      {hits && hits.length > 0 && <ul className={styles.searchHits} aria-label={t('search.history')}>
        {hits.map(hit => <li key={hit.sessionId + ':' + hit.seq + ':' + hit.excerpt} className={styles.activityItem}>
          <strong>{hit.title || hit.sessionId}</strong>
          <p>{hit.excerpt}</p>
          <p className={styles.muted}>{t('search.turn')} {hit.turn} · {new Date(hit.timestamp).toLocaleString()}</p>
          <div className={styles.searchStatus}>{hit.reasons.map(reason =>
            <span key={reason}>{t(('search.reason.' + reason) as MemoryLocaleKey)}</span>)}</div>
          <div className={styles.actions}>
            {onOpenSession && <button type="button" className={styles.button} onClick={() => onOpenSession(hit.sessionId)}>{t('search.openSession')}</button>}
            <button type="button" className={styles.button} onClick={() => onSuggest(hit.sessionId)}>{t('search.suggestTurn')}</button>
          </div>
        </li>)}
      </ul>}
      <details className={styles.details}>
        <summary>{t('search.sources')}</summary>
        <form className={styles.searchForm} onSubmit={event => { event.preventDefault(); change('add', sourcePath) }}>
          <label className={styles.field}>{t('search.sourcePath')} <input value={sourcePath} maxLength={4096}
            onChange={event => setSourcePath(event.target.value)} disabled={!workspaceId || busy} /></label>
          <button type="submit" className={styles.button} disabled={!workspaceId || !sourcePath.trim() || busy}>{t('search.addSource')}</button>
        </form>
        <ul className={styles.searchHits}>{status?.sources.map(source => <li key={source.path} className={styles.actions}>
          <span className={styles.searchSource}>{source.path}</span>
          <button type="button" className={styles.button} disabled={busy} onClick={() => change('remove', source.path)}>{t('search.removeSource')}</button>
        </li>)}</ul>
      </details>
    </div>
  </details>
}
