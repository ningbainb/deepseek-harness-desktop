import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ConfigForm as SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  MAX_MEMORY_CONTENT_LENGTH,
  MAX_MEMORY_TAGS,
  type MemoryPublicItem,
  type MemoryScope,
} from '../core/schema.ts'
import { normalizeMemoryConfig, type MemoryConfig } from '../core/config.ts'
import type { MemoryLocaleKey } from './locales.ts'
import styles from './memory.module.css'
import { MemoryActivityPanel } from './MemoryActivityPanel.tsx'
import { filterMemoryItems, isMemoryItem, memoryRequestErrorCode, postMemoryJson, readMemoryCatalog, type MemoryCatalog, type PendingMemoryItem } from './settings-data.ts'

type CatalogState = { status: 'loading' | 'error' } | { status: 'ready'; value: MemoryCatalog }

const emptyCatalog: MemoryCatalog = { items: [], pending: [] }

interface Draft {
  id?: string
  scope: MemoryScope
  workspaceId: string
  sessionId: string
  content: string
  tags: string
  pinned: boolean
  expiresAt: string
  expectedUpdatedAt?: number
}

export type MemorySettingsCardProps = PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'memory'>
  & {
    config: MemoryConfig
    settingsScope: SettingsScope<MemoryConfig>
  }

function emptyDraft(scope: MemoryScope = 'global'): Draft {
  return {
    scope,
    workspaceId: '',
    sessionId: '',
    content: '',
    tags: '',
    pinned: false,
    expiresAt: '',
  }
}

function draftOf(item: MemoryPublicItem): Draft {
  return {
    id: item.id,
    expectedUpdatedAt: item.updatedAt,
    scope: item.scope,
    workspaceId: item.workspaceId ?? '',
    sessionId: item.sessionId ?? '',
    content: item.content,
    tags: item.tags.join(', '),
    pinned: item.pinned,
    expiresAt: item.expiresAt === undefined ? '' : String(item.expiresAt),
  }
}

function itemFromDraft(draft: Draft): Record<string, unknown> | undefined {
  const content = draft.content.trim()
  if (content === '' || content.length > MAX_MEMORY_CONTENT_LENGTH) return undefined
  const tags = draft.tags.split(',').map(tag => tag.trim()).filter(Boolean)
  if (tags.length > MAX_MEMORY_TAGS) return undefined
  const body: Record<string, unknown> = {
    operation: 'save',
    ...(draft.expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt: draft.expectedUpdatedAt }),
    ...(draft.id === undefined ? {} : { id: draft.id }),
    scope: draft.scope,
    content,
    tags,
    pinned: draft.pinned,
  }
  if (draft.scope === 'workspace') {
    if (draft.workspaceId.trim() === '') return undefined
    body.workspaceId = draft.workspaceId.trim()
  } else if (draft.scope === 'session') {
    if (draft.sessionId.trim() === '') return undefined
    body.sessionId = draft.sessionId.trim()
  }
  if (draft.expiresAt.trim() !== '') {
    const expiresAt = Number(draft.expiresAt.trim())
    if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) return undefined
    body.expiresAt = expiresAt
  }
  return body
}

function errorMessage(code: unknown, t: (key: MemoryLocaleKey) => string): string {
  if (code === 'sensitive') return t('settings.errorSensitive')
  if (code === 'invalid' || code === 'invalid-target') return t('settings.errorInvalid')
  if (code === 'store-unavailable') return t('settings.errorStore')
  if (code === 'duplicate') return t('settings.duplicate')
  if (code === 'conflict') return t('settings.errorConflict')
  return t('settings.errorSave')
}

function retryableLoadError(reason: unknown): boolean {
  const code = memoryRequestErrorCode(reason)
  return code === 'scope-unavailable' || code === 'store-unavailable'
}

async function waitBeforeReload(attempt: number): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, Math.min(1_000, 150 * 2 ** attempt)))
}

export function MemorySettingsCard(props: MemorySettingsCardProps) {
  const { config, settingsScope, t } = props
  const settingsSnapshot = useSyncExternalStore(
    listener => settingsScope.subscribe(listener),
    () => settingsScope.getSnapshot(),
    () => settingsScope.getSnapshot(),
  )
  const liveConfig = useMemo(() => {
    try { return normalizeMemoryConfig(settingsSnapshot.value ?? config) } catch { return config }
  }, [config, settingsSnapshot.value])
  const dock = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('desktop-dock-setting')
  const [editorOpen, setEditorOpen] = useState(!dock)
  const [memoryTab, setMemoryTab] = useState<'items' | 'pending'>('items')
  const [cleanDraft, setCleanDraft] = useState(() => JSON.stringify(emptyDraft()))
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [filter, setFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | MemoryScope>('all')
  const [clearEntries, setClearEntries] = useState<MemoryPublicItem[] | null>(null)
  const [deleteRequested, setDeleteRequested] = useState(false)
  const [replacements, setReplacements] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<MemoryLocaleKey>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const pendingRead = useRef<AbortController>()
  const mounted = useRef(false)
  const content = useRef<HTMLTextAreaElement>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const panelId = useId()
  const ready = catalog.status === 'ready'
  const { items, pending } = ready ? catalog.value : emptyCatalog
  const mayWrite = ready && settingsSnapshot.writable && !saving
  const editorVisible = ready && editorOpen && (!dock || memoryTab === 'items')
  const dirty = editorOpen && JSON.stringify(draft) !== cleanDraft

  useEffect(() => {
    if (!focusRequest) return
    content.current?.focus()
  }, [focusRequest])

  const load = useCallback((notice?: MemoryLocaleKey): void => {
    if (!mounted.current) return
    pendingRead.current?.abort()
    const read = new AbortController()
    pendingRead.current = read
    const { signal } = read
    setCatalog({ status: 'loading' })
    setClearEntries(null)
    setDeleteRequested(false)
    setReplacements({})
    setFeedback(undefined)
    setError(null)
    void (async () => {
      for (let attempt = 0; attempt < 8 && !signal.aborted; attempt += 1) {
        try {
          const value = await readMemoryCatalog(signal)
          if (signal.aborted) return
          setCatalog({ status: 'ready', value })
          setFeedback(notice)
          return
        } catch (reason) {
          if (signal.aborted) return
          if (!retryableLoadError(reason) || attempt === 7) {
            setCatalog({ status: 'error' })
            return
          }
          await waitBeforeReload(attempt)
        }
      }
    })()
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
      pendingRead.current?.abort()
    }
  }, [load])

  const filtering = scopeFilter !== 'all' || filter.trim() !== ''
  const visibleItems = useMemo(() => filterMemoryItems(items, scopeFilter, filter), [filter, items, scopeFilter])
  const scopeCounts = useMemo(() => items.reduce((counts, item) => {
    counts[item.scope] += 1
    return counts
  }, { global: 0, workspace: 0, session: 0 }), [items])

  const select = (item: MemoryPublicItem): void => {
    if (!ready || saving) return
    setMemoryTab('items')
    setEditorOpen(true)
    const entry = draftOf(item)
    setCleanDraft(JSON.stringify(entry))
    setSelectedId(item.id)
    setDraft(entry)
    setDeleteRequested(false)
    setSaved(false)
    setError(null)
    setFocusRequest(current => current + 1)
  }

  const create = (): void => {
    const entry = emptyDraft(scopeFilter === 'all' ? 'global' : scopeFilter)
    setEditorOpen(true)
    setCleanDraft(JSON.stringify(entry))
    setSelectedId(undefined)
    setDraft(entry)
    setDeleteRequested(false)
    setSaved(false)
    setError(null)
    setFocusRequest(current => current + 1)
  }

  const saveConfig = (next: boolean): void => {
    if (saving || !settingsSnapshot.writable) return
    setSaving(true)
    setSaved(false)
    setError(null)
    void (async () => {
      try {
        if (!await settingsScope.set('enabled', next)) throw new Error('memory setting not accepted')
        if (mounted.current) setSaved(true)
      } catch {
        if (mounted.current) setError(t('settings.errorSave'))
      } finally {
        if (mounted.current) setSaving(false)
      }
    })()
  }

  const mutate = (path: string, body: unknown, onSuccess: (value: Record<string, unknown>) => void, notice?: MemoryLocaleKey): void => {
    if (!mayWrite) return
    setSaving(true)
    setSaved(false)
    setError(null)
    void (async () => {
      try {
        const value = await postMemoryJson(path, body)
        if (!mounted.current) return
        onSuccess(value)
        load(notice)
      } catch (reason) {
        if (mounted.current) setError(errorMessage(memoryRequestErrorCode(reason), t))
      } finally {
        if (mounted.current) setSaving(false)
      }
    })()
  }

  const save = (): void => {
    const body = itemFromDraft(draft)
    if (body === undefined) {
      setError(t('settings.errorInvalid'))
      return
    }
    mutate('/api/dsh-memory/items', body, value => {
      if (!isMemoryItem(value.item)) throw new Error('invalid memory response')
      const next = draftOf(value.item)
      setSelectedId(value.item.id)
      setDraft(next)
      setCleanDraft(JSON.stringify(next))
      setSaved(true)
    })
  }

  const discardDraft = (): void => {
    setSelectedId(undefined)
    setDraft(emptyDraft())
    setCleanDraft(JSON.stringify(emptyDraft()))
    setDeleteRequested(false)
    setEditorOpen(!dock)
  }

  const remove = (): void => {
    if (!selectedId || !deleteRequested) return
    mutate('/api/dsh-memory/items', { operation: 'remove', id: selectedId, expectedUpdatedAt: draft.expectedUpdatedAt }, discardDraft, 'settings.removed')
  }

  const clear = (): void => {
    if (!clearEntries) return
    mutate('/api/dsh-memory/items', { operation: 'clear', entries: clearEntries.map(item => ({ id: item.id, updatedAt: item.updatedAt })) }, discardDraft, 'settings.removed')
  }

  const confirm = (entry: PendingMemoryItem): void => {
    const replacement = items.find(item => item.id === replacements[entry.id])
    mutate('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'confirm', ...(replacement ? { replaceId: replacement.id, expectedUpdatedAt: replacement.updatedAt } : {}) }, () => {}, 'settings.confirmed')
  }

  const reject = (entry: PendingMemoryItem): void => {
    mutate('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'cancel' }, () => {}, 'settings.dismissed')
  }

  const requestReload = (): void => load('settings.refreshed')
  const activityStatus = saving ? 'settings.saving' : dirty ? 'settings.unsaved' : saved ? 'settings.saved' : undefined
  const readStatus = catalog.status === 'loading'
    ? <p className={styles.muted} role="status">{t('settings.loading')}</p>
    : catalog.status === 'error'
      ? <p className={styles.error} role="alert">{t('settings.errorLoad')}</p>
      : null

  return (
    <section className={styles.card} data-memory-card="true" data-dock-owner="memory" data-dock-dirty={dirty}>
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>{t('settings.title')}</h3>
          <p className={styles.description}>{t('settings.description')}</p>
        </div>
        {activityStatus && <span className={activityStatus === 'settings.saved' ? styles.badgeSaved : styles.badge} role="status">{t(activityStatus)}</span>}
      </header>
      {saved && !dirty && selectedId && <p className={styles.muted}>{t('settings.savedTo')} {t(`settings.${draft.scope}`)}</p>}
      {feedback && <p className={styles.muted} role="status">{t(feedback)}</p>}
      {settingsSnapshot.status !== 'loading' && !settingsSnapshot.writable && <p className={styles.notice} role="status">{t('settings.readonly')}</p>}
      {ready && settingsSnapshot.status === 'loading' && <p className={styles.muted} role="status">{t('settings.loading')}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.enableRow}><label className={styles.toggle}>
        <input type="checkbox" checked={liveConfig.enabled} disabled={!settingsSnapshot.writable || saving} onChange={event => saveConfig(event.target.checked)} />
        {t('settings.enabled')}
      </label><p className={styles.muted}>{t('settings.ownerNotice')}</p></div>

      {dock && <div className={styles.tabs} role="tablist" aria-label={t('settings.title')} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 'items' : event.key === 'End' ? 'pending' : memoryTab === 'items' ? 'pending' : 'items'
        setMemoryTab(next)
        event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next === 'items' ? 0 : 1]?.focus()
      }}>
        <button type="button" id={panelId + '-items-tab'} role="tab" aria-controls={panelId + '-items'} tabIndex={memoryTab === 'items' ? 0 : -1} aria-selected={memoryTab === 'items'} onClick={() => setMemoryTab('items')}>{t('settings.items')}{ready && ` · ${items.length}`}</button>
        <button type="button" id={panelId + '-pending-tab'} role="tab" aria-controls={panelId + '-pending'} tabIndex={memoryTab === 'pending' ? 0 : -1} aria-selected={memoryTab === 'pending'} onClick={() => setMemoryTab('pending')}>{t('settings.pending')}{ready && ` · ${pending.length}`}</button>
      </div>}
      <section className={styles.section} id={panelId + '-items'} role={dock ? 'tabpanel' : undefined} aria-labelledby={dock ? panelId + '-items-tab' : undefined} hidden={dock && memoryTab !== 'items'}>
        <header className={styles.sectionHeader}>
          {!dock && <strong>{t('settings.items')}</strong>}
          {ready && <span role="status">{filtering ? `${visibleItems.length} / ${items.length}` : items.length} {t('settings.count')}</span>}
          <button type="button" className={styles.button} disabled={saving || catalog.status === 'loading'} onClick={requestReload}>{t('settings.reload')}</button>
          <button type="button" className={styles.primary} disabled={!mayWrite} onClick={create}>{t('settings.new')}</button>
        </header>
        {readStatus}
        {ready && <div className={styles.filterRow}>
          <input type="search" value={filter} onChange={event => { setFilter(event.target.value); setClearEntries(null) }} placeholder={t('settings.searchPlaceholder')} aria-label={t('settings.search')} />
          <select className={styles.scopeFilter} aria-label={t('settings.scopeFilter')} value={scopeFilter} onChange={event => { setScopeFilter(event.target.value as typeof scopeFilter); setClearEntries(null) }}>
            {(['all', 'global', 'workspace', 'session'] as const).map(scope => <option key={scope} value={scope}>{t(`settings.${scope}`)} · {scope === 'all' ? items.length : scopeCounts[scope]}</option>)}
          </select>
          {filtering && <button type="button" className={styles.button} onClick={() => { setFilter(''); setScopeFilter('all'); setClearEntries(null) }}>{t('settings.resetFilter')}</button>}
        </div>}
        {ready && visibleItems.length === 0 && <p className={styles.empty}>{t(items.length === 0 ? 'settings.noItems' : 'settings.noResults')}</p>}
        {visibleItems.length > 0 && <ul className={styles.itemList} aria-label={t('settings.items')}>
          {visibleItems.map(item => (
            <li key={item.id}>
              <button type="button" disabled={saving} aria-pressed={item.id === selectedId} className={item.id === selectedId ? styles.itemSelected : styles.item} onClick={() => select(item)}>
                <span className={styles.itemContent}>{item.content}</span>
                <span className={styles.itemMeta}>{[t(`settings.${item.scope}`), item.workspaceId ?? item.sessionId, item.pinned ? t('settings.pinned') : undefined, item.source === 'confirmed-suggestion' ? t('settings.sourceSuggested') : undefined, item.expiresAt !== undefined && item.expiresAt <= Date.now() ? t('settings.expired') : undefined, ...item.tags].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>}
        {ready && <div className={styles.actions}><button type="button" className={styles.danger} disabled={!mayWrite || visibleItems.length === 0} onClick={() => { setDeleteRequested(false); setClearEntries([...visibleItems]) }}>{t('settings.clearVisible')}</button></div>}
        {clearEntries && <div className={styles.notice} role="alert"><p>{t('settings.clearConfirm')} {clearEntries.length} {t('settings.count')}</p><div className={styles.actions}><button type="button" className={styles.button} onClick={() => setClearEntries(null)}>{t('settings.cancelAction')}</button><button type="button" className={styles.danger} disabled={!mayWrite} onClick={clear}>{t('settings.confirmDelete')}</button></div></div>}
      </section>

      <section className={styles.section} id={panelId + '-pending'} role={dock ? 'tabpanel' : undefined} aria-labelledby={dock ? panelId + '-pending-tab' : undefined} hidden={dock && memoryTab !== 'pending'}>
        <header className={styles.sectionHeader}>{!dock && <strong>{t('settings.pending')}</strong>}{!dock && ready && <span>{pending.length} {t('settings.count')}</span>}{dock && <button type="button" className={styles.button} disabled={saving || catalog.status === 'loading'} onClick={requestReload}>{t('settings.reload')}</button>}</header>
        {dock && readStatus}
        {ready && pending.length === 0 && <p className={styles.empty}>{t('settings.noPending')}</p>}
        {ready && pending.length > 0 && <p className={styles.muted}>{t('settings.pendingHint')}</p>}
        <div className={styles.pendingList}>
          {pending.map(entry => (
            <article className={styles.pendingItem} key={entry.id}>
              <p className={styles.pendingContent}>{entry.item.content}</p>
              <p className={styles.notice}>{t('settings.suggestion')} {t(('settings.' + entry.item.scope) as MemoryLocaleKey)} · {new Date(entry.createdAt).toLocaleString()}</p>
              <label className={styles.field}><span>{t('settings.replacement')}</span><select value={replacements[entry.id] ?? ''} onChange={event => setReplacements(current => ({ ...current, [entry.id]: event.target.value }))}><option value="">{t('settings.newMemory')}</option>{items.filter(item => item.scope === entry.item.scope && item.workspaceId === entry.item.workspaceId && item.sessionId === entry.item.sessionId).map(item => <option key={item.id} value={item.id}>{t('settings.replaceMemory')}: {item.content.slice(0, 80)}</option>)}</select></label>
              {replacements[entry.id] && <blockquote>{items.find(item => item.id === replacements[entry.id])?.content}</blockquote>}
              <div className={styles.actions}>
                <button type="button" className={styles.primary} disabled={!mayWrite} onClick={() => confirm(entry)}>{t('settings.confirm')}</button>
                <button type="button" className={styles.button} disabled={!mayWrite} onClick={() => reject(entry)}>{t('settings.reject')}</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.editor} hidden={!editorVisible}>
        {selectedId && <p className={styles.muted}>{t('settings.updated')} {new Date(draft.expectedUpdatedAt ?? 0).toLocaleString()}</p>}
        <header className={styles.sectionHeader}><strong>{selectedId === undefined ? t('settings.newMemory') : t('settings.edit')}</strong></header>
        <label className={styles.field}><span>{t('settings.scope')}</span><select value={draft.scope} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, scope: event.target.value as MemoryScope }))}><option value="global">{t('settings.global')}</option><option value="workspace">{t('settings.workspace')}</option><option value="session">{t('settings.session')}</option></select></label>
        {draft.scope === 'workspace' && <label className={styles.field}><span>{t('settings.workspaceId')}</span><input value={draft.workspaceId} maxLength={128} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, workspaceId: event.target.value }))} /></label>}
        {draft.scope === 'session' && <label className={styles.field}><span>{t('settings.sessionId')}</span><input value={draft.sessionId} maxLength={128} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, sessionId: event.target.value }))} /></label>}
        <label className={styles.field}><span>{t('settings.content')}</span><textarea ref={content} value={draft.content} maxLength={MAX_MEMORY_CONTENT_LENGTH} placeholder={t('settings.contentPlaceholder')} disabled={!mayWrite} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} /><span className={styles.counter}>{draft.content.length} / {MAX_MEMORY_CONTENT_LENGTH}</span></label>
        <details className={styles.details} data-memory-advanced="true"><summary>{t('settings.advanced')}</summary>
        <p className={styles.muted}>{t('settings.targetHint')}</p>
        <label className={styles.field}><span>{t('settings.tags')}</span><input value={draft.tags} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, tags: event.target.value }))} /></label>
        <label className={styles.toggle}><input type="checkbox" checked={draft.pinned} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, pinned: event.target.checked }))} />{t('settings.pinned')}</label>
        <label className={styles.field}><span>{t('settings.expiresAt')}</span><input value={draft.expiresAt} inputMode="numeric" disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, expiresAt: event.target.value }))} /></label>
        </details>
        {deleteRequested && <div className={styles.notice} role="alert"><p>{t('settings.deleteConfirm')}</p><div className={styles.actions}><button type="button" className={styles.button} disabled={saving} onClick={() => setDeleteRequested(false)}>{t('settings.cancelAction')}</button><button type="button" className={styles.danger} disabled={!mayWrite} onClick={remove}>{t('settings.confirmDelete')}</button></div></div>}
        <footer className={styles.actions} data-dock-save-bar={dock || undefined}>
          {selectedId !== undefined && <button type="button" className={styles.danger} disabled={!mayWrite || deleteRequested} onClick={() => { setClearEntries(null); setDeleteRequested(true) }}>{t('settings.delete')}</button>}
          <button type="button" className={styles.button} disabled={saving} onClick={discardDraft}>{t('settings.cancel')}</button>
          <button type="button" className={styles.primary} data-dock-save="true" disabled={!mayWrite} onClick={save}>{saving ? t('settings.saving') : t('settings.save')}</button>
        </footer>
      </section>
      <MemoryActivityPanel t={t} enabled={liveConfig.enabled} onEdit={select} />
    </section>
  )
}

