import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { LOCAL_SEARCH_UPDATED_EVENT, notifyLocalSearchUpdated, postLocalSearch, type IndexStatus } from './local-search-api.ts'
import type { MemoryLocaleKey } from './locales.ts'
import styles from './memory.module.css'

type Translate = (key: MemoryLocaleKey) => string

type SessionStoreHook = (selector: (state: {
  byId?: Record<string, { workspaceId?: string; cwd?: string } | undefined>
}) => { workspaceId?: string; cwd?: string } | undefined) => { workspaceId?: string; cwd?: string } | undefined

export function WorkspaceKnowledgeCount({ sessionId, useSessions }: {
  sessionId: string
  useSessions: SessionStoreHook
}) {
  const session = useSessions(state => state.byId?.[sessionId])
  const workspaceId = session?.workspaceId
  const [count, setCount] = useState<number>()

  useEffect(() => {
    if (!workspaceId) {
      setCount(undefined)
      return
    }
    const controller = new AbortController()
    const load = () => {
      void postLocalSearch<IndexStatus>('status', { workspaceId }, controller.signal)
        .then(res => { if (!controller.signal.aborted) setCount(res.sources.length) })
        .catch(() => {})
    }
    load()
    window.addEventListener(LOCAL_SEARCH_UPDATED_EVENT, load)
    return () => {
      controller.abort()
      window.removeEventListener(LOCAL_SEARCH_UPDATED_EVENT, load)
    }
  }, [workspaceId])

  if (!count) return null
  return <span className={styles.kbBadge}>{count}</span>
}

export function WorkspaceKnowledgeSection({ sessionId, useSessions, t }: {
  sessionId: string
  useSessions: SessionStoreHook
  t: Translate
}) {
  const session = useSessions(state => state.byId?.[sessionId])
  const workspaceId = session?.workspaceId
  const [status, setStatus] = useState<IndexStatus>()
  const [pathInput, setPathInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!workspaceId) return
    try {
      const res = await postLocalSearch<IndexStatus>('status', { workspaceId }, signal)
      if (!signal?.aborted) {
        setStatus(res)
        setError(false)
      }
    } catch {
      if (!signal?.aborted) setError(true)
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    const controller = new AbortController()
    void refresh(controller.signal)
    const onUpdated = () => { void refresh() }
    window.addEventListener(LOCAL_SEARCH_UPDATED_EVENT, onUpdated)
    return () => {
      controller.abort()
      window.removeEventListener(LOCAL_SEARCH_UPDATED_EVENT, onUpdated)
    }
  }, [workspaceId, refresh])

  if (!workspaceId) return null

  const mutateSource = async (operation: 'add' | 'remove', path: string) => {
    const trimmed = path.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(false)
    try {
      await postLocalSearch('sources', { workspaceId, path: trimmed, operation })
      if (operation === 'add') setPathInput('')
      notifyLocalSearchUpdated()
      await refresh()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void mutateSource('add', pathInput)
  }

  return (
    <div className={styles.kbSection} data-dsh-workspace-kb="true">
      {status && (
        <div className={styles.searchStatus}>
          <span>{t('search.chunkCount')} {status.status.counts.knowledge}</span>
          <button
            type="button"
            className={styles.kbSmallBtn}
            disabled={busy || status.indexing}
            onClick={() => {
              setBusy(true)
              void postLocalSearch('rebuild', {})
                .then(() => { notifyLocalSearchUpdated(); return refresh() })
                .catch(() => setError(true))
                .finally(() => setBusy(false))
            }}
          >
            {t('search.rebuild')}
          </button>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{t('search.unavailable')}</p>}
      <form className={styles.kbAddForm} onSubmit={onSubmit}>
        <input
          type="text"
          value={pathInput}
          maxLength={4096}
          aria-label={t('search.sourcePath')}
          placeholder={t('search.sourcePath')}
          disabled={busy}
          onChange={event => setPathInput(event.target.value)}
        />
        <button type="submit" className={styles.kbSmallBtn} disabled={busy || !pathInput.trim()}>
          {t('search.addSource')}
        </button>
      </form>
      {status && status.sources.length === 0 && (
        <p className={styles.muted}>{t('search.kbEmpty')}</p>
      )}
      {status && status.sources.length > 0 && (
        <ul className={styles.kbSourceList}>
          {status.sources.map(source => (
            <li key={source.path} className={styles.kbSourceRow}>
              <span className={styles.searchSource}>{source.path}</span>
              <button
                type="button"
                className={styles.kbSmallBtn}
                disabled={busy}
                onClick={() => void mutateSource('remove', source.path)}
              >
                {t('search.removeSource')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function relativeSourcePath(cwd: string, absolutePath: string): string | undefined {
  const norm = (value: string) => value.replaceAll('\\', '/').replace(/\/+$/u, '')
  const root = norm(cwd)
  const target = norm(absolutePath)
  if (!root || !target) return undefined
  if (target.toLowerCase() === root.toLowerCase()) return '.'
  if (target.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return target.slice(root.length + 1)
  }
  return undefined
}

export function FilesTreeKnowledgeButton({ sessionId, absolutePath, useSessions, t }: {
  sessionId: string
  absolutePath: string
  useSessions: SessionStoreHook
  t: Translate
}) {
  const session = useSessions(state => state.byId?.[sessionId])
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const rel = session?.cwd ? relativeSourcePath(session.cwd, absolutePath) : undefined
  if (!session?.workspaceId || !rel) return null

  const workspaceId = session.workspaceId
  const label = state === 'done'
    ? t('search.kbAddedToast')
    : state === 'error'
      ? t('search.kbFailedToast')
      : t('search.kbAddCurrentDir')

  return (
    <button
      type="button"
      className={styles.kbFileAction}
      data-dsh-kb-index-dir="true"
      disabled={state === 'busy'}
      title={t('search.kbSectionTitle')}
      onClick={() => {
        setState('busy')
        void postLocalSearch('sources', { workspaceId, path: rel, operation: 'add' })
          .then(() => {
            notifyLocalSearchUpdated()
            setState('done')
            setTimeout(() => setState('idle'), 2400)
          })
          .catch(() => {
            setState('error')
            setTimeout(() => setState('idle'), 2400)
          })
      }}
    >
      {label}
    </button>
  )
}
