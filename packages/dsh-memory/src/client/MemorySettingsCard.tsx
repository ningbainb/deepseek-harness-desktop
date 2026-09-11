import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
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

interface PendingItem {
  id: string
  item: MemoryPublicItem
  createdAt: number
}

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

function emptyDraft(): Draft {
  return {
    scope: 'global',
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

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid memory response')
  return value as Record<string, unknown>
}

function requestError(value: Record<string, unknown>): Error {
  const code = typeof value.code === 'string' ? value.code : 'request-failed'
  const error = new Error(code)
  ;(error as Error & { code?: unknown }).code = code
  return error
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(path, { cache: 'no-store' })
  const value = await responseJson(response)
  if (!response.ok || value.ok !== true) throw requestError(value)
  return value
}

function errorCode(reason: unknown): unknown {
  return reason instanceof Error ? (reason as Error & { code?: unknown }).code : undefined
}

function retryableLoadError(reason: unknown): boolean {
  return errorCode(reason) === 'scope-unavailable' || errorCode(reason) === 'store-unavailable'
}

async function waitBeforeReload(attempt: number): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, Math.min(1_000, 150 * 2 ** attempt)))
}

function responseItems(value: Record<string, unknown>): MemoryPublicItem[] {
  if (!value.ok || !Array.isArray(value.items)) return []
  return value.items.filter(item => typeof item === 'object' && item !== null) as MemoryPublicItem[]
}

function responsePending(value: Record<string, unknown>): PendingItem[] {
  if (!value.ok || !Array.isArray(value.items)) return []
  return value.items.filter(item => typeof item === 'object' && item !== null) as PendingItem[]
}

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  const value = await responseJson(response)
  if (!response.ok || value.ok !== true) throw requestError(value)
  return value
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
  const [enabled, setEnabled] = useState(liveConfig.enabled)
  const [items, setItems] = useState<MemoryPublicItem[]>([])
  const [pending, setPending] = useState<PendingItem[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [filter, setFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | MemoryScope>('all')
  const [clearEntries, setClearEntries] = useState<MemoryPublicItem[] | null>(null)
  const [replacements, setReplacements] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const lastRevision = useRef(settingsSnapshot.revision)

  useEffect(() => {
    if (lastRevision.current !== settingsSnapshot.revision) {
      if (saving) setError(t('settings.errorConflict'))
      lastRevision.current = settingsSnapshot.revision
    }
  }, [saving, settingsSnapshot.revision, t])

  useEffect(() => {
    if (!saving) setEnabled(liveConfig.enabled)
  }, [liveConfig.enabled, saving])

  const load = (): void => {
    setLoading(true)
    setError(null)
    void (async () => {
      let failure: unknown
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const [itemValue, pendingValue] = await Promise.all([
            getJson('/api/dsh-memory/items?view=manage&refresh=1'),
            getJson('/api/dsh-memory/pending'),
          ])
          setItems(responseItems(itemValue))
          setPending(responsePending(pendingValue))
          setLoading(false)
          setFeedback(t('settings.refreshed'))
          return
        } catch (reason) {
          failure = reason
          if (!retryableLoadError(reason) || attempt === 7) break
          await waitBeforeReload(attempt)
        }
      }
      setItems([])
      setPending([])
      setLoading(false)
      setError(t('settings.errorLoad'))
      void failure
    })()
  }

  useEffect(() => { load() }, [])

  const visibleItems = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase()
    const scoped = items.filter(item => scopeFilter === 'all' || item.scope === scopeFilter)
    if (needle === '') return scoped
    return scoped.filter(item => [item.content, ...item.tags].join(' ').toLocaleLowerCase().includes(needle))
  }, [filter, items, scopeFilter])

  const select = (item: MemoryPublicItem): void => {
    setEditorOpen(true)
    setCleanDraft(JSON.stringify(draftOf(item)))
    setSelectedId(item.id)
    setDraft(draftOf(item))
    setSaved(false)
    setError(null)
  }

  const create = (): void => {
    setEditorOpen(true)
    setCleanDraft(JSON.stringify(emptyDraft()))
    setSelectedId(undefined)
    setDraft(emptyDraft())
    setSaved(false)
    setError(null)
  }

  const saveConfig = (next: boolean): void => {
    setEnabled(next)
    setSaved(false)
    void settingsScope.set('enabled', next).then(() => setSaved(true), () => setError(t('settings.errorSave')))
  }

  const save = (): void => {
    const body = itemFromDraft(draft)
    if (body === undefined || !settingsSnapshot.writable || saving) {
      setError(t('settings.errorInvalid'))
      return
    }
    setSaving(true)
    setError(null)
    void postJson('/api/dsh-memory/items', body).then(value => {
      const item = value.item as unknown as MemoryPublicItem
      setSelectedId(item.id)
      setDraft(draftOf(item))
      setCleanDraft(JSON.stringify(draftOf(item)))
      setFeedback(t('settings.savedTo') + ' ' + t(('settings.' + item.scope) as MemoryLocaleKey))
      setSaved(true)
      setSaving(false)
      load()
    }, reason => {
      const code = reason instanceof Error ? (reason as Error & { code?: unknown }).code : undefined
      setError(errorMessage(code, t))
      setSaving(false)
    })
  }

  const remove = (): void => {
    if (selectedId === undefined || saving) return
    setSaving(true)
    void postJson('/api/dsh-memory/items', { operation: 'remove', id: selectedId, expectedUpdatedAt: draft.expectedUpdatedAt }).then(() => {
      setSelectedId(undefined)
      setDraft(emptyDraft())
      setCleanDraft(JSON.stringify(emptyDraft()))
      setEditorOpen(!dock)
      setSaving(false)
      load()
    }, reason => {
      setError(errorMessage(reason instanceof Error ? (reason as Error & { code?: unknown }).code : undefined, t))
      setSaving(false)
    })
  }

  const clear = (): void => {
    if (saving || !clearEntries) return
    setSaving(true)
    void postJson('/api/dsh-memory/items', { operation: 'clear', entries: clearEntries.map(item => ({ id: item.id, updatedAt: item.updatedAt })) }).then(() => {
      setClearEntries(null)
      setSelectedId(undefined)
      setDraft(emptyDraft())
      setCleanDraft(JSON.stringify(emptyDraft()))
      setEditorOpen(!dock)
      setSaving(false)
      load()
    }, reason => {
      setError(errorMessage(reason instanceof Error ? (reason as Error & { code?: unknown }).code : undefined, t))
      setSaving(false)
    })
  }

  const confirm = (entry: PendingItem): void => {
    if (saving) return
    setSaving(true)
    const replacement = items.find(item => item.id === replacements[entry.id])
    void postJson('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'confirm', ...(replacement ? { replaceId: replacement.id, expectedUpdatedAt: replacement.updatedAt } : {}) }).then(() => {
      setSaving(false)
      load()
    }, reason => {
      setError(errorMessage(reason instanceof Error ? (reason as Error & { code?: unknown }).code : undefined, t))
      setSaving(false)
    })
  }

  const reject = (entry: PendingItem): void => {
    if (saving) return
    setSaving(true)
    void postJson('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'cancel' }).then(() => {
      setSaving(false)
      load()
    }, reason => {
      setError(errorMessage(reason instanceof Error ? (reason as Error & { code?: unknown }).code : undefined, t))
      setSaving(false)
    })
  }

  return (
    <section className={styles.card} data-memory-card="true" data-dock-owner="memory" data-dock-dirty={editorOpen && JSON.stringify(draft) !== cleanDraft}>
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>{t('settings.title')}</h3>
          <p className={styles.description}>{t('settings.description')}</p>
        </div>
        <span className={saved ? styles.badgeSaved : styles.badge}>{saving ? t('settings.saving') : saved ? t('settings.saved') : editorOpen && JSON.stringify(draft) !== cleanDraft ? t('settings.unsaved') : t('settings.ready')}</span>
      </header>
      {saved && selectedId && <p className={styles.muted} role="status">{t('settings.savedTo')} {t(('settings.' + draft.scope) as MemoryLocaleKey)}{draft.workspaceId || draft.sessionId ? ' · ' + (draft.workspaceId || draft.sessionId) : ''}</p>}
      {!settingsSnapshot.writable && <p className={styles.notice} role="status">{t('settings.readonly')}</p>}
      {settingsSnapshot.status === 'loading' && <p className={styles.muted} role="status">{t('settings.loading')}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.enableRow}><label className={styles.toggle}>
        <input type="checkbox" checked={enabled} disabled={!settingsSnapshot.writable || saving} onChange={event => saveConfig(event.target.checked)} />
        {t('settings.enabled')}
      </label><p className={styles.muted}>{t('settings.ownerNotice')}</p></div>

      {dock && <div className={styles.tabs} role="tablist" aria-label={t('settings.title')} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 'items' : event.key === 'End' ? 'pending' : memoryTab === 'items' ? 'pending' : 'items'
        setMemoryTab(next)
        event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next === 'items' ? 0 : 1]?.focus()
      }}>
        <button type="button" role="tab" tabIndex={memoryTab === 'items' ? 0 : -1} aria-selected={memoryTab === 'items'} onClick={() => setMemoryTab('items')}>{t('settings.items')} · {items.length}</button>
        <button type="button" role="tab" tabIndex={memoryTab === 'pending' ? 0 : -1} aria-selected={memoryTab === 'pending'} onClick={() => setMemoryTab('pending')}>{t('settings.pending')} · {pending.length}</button>
      </div>}
      <section className={styles.section} hidden={dock && memoryTab !== 'items'}>
        <header className={styles.sectionHeader}>
          <strong>{t('settings.items')}</strong>
          <span>{visibleItems.length} {t('settings.count')}</span>
          {feedback && <small className={styles.muted} role="status">{feedback}</small>}
          <button type="button" className={styles.button} disabled={saving} onClick={load}>{t('settings.reload')}</button>
        </header>
        <label className={styles.scopeFilter}><span>{t('settings.scopeFilter')}</span><select aria-label={t('settings.scopeFilter')} value={scopeFilter} onChange={event => { setScopeFilter(event.target.value as typeof scopeFilter); setClearEntries(null) }}>{(['all', 'global', 'workspace', 'session'] as const).map(scope => <option key={scope} value={scope}>{t(('settings.' + scope) as MemoryLocaleKey)} · {scope === 'all' ? items.length : items.filter(item => item.scope === scope).length}</option>)}</select></label>
        <div className={styles.filterRow}>
          <input value={filter} onChange={event => { setFilter(event.target.value); setClearEntries(null) }} placeholder={t('settings.searchPlaceholder')} aria-label={t('settings.search')} />
          <button type="button" className={styles.button} disabled={saving || !settingsSnapshot.writable} onClick={create}>{t('settings.new')}</button>
          <button type="button" className={styles.danger} disabled={saving || visibleItems.length === 0 || !settingsSnapshot.writable} onClick={() => setClearEntries([...visibleItems])}>{t('settings.clearVisible')}</button>
        </div>
        {clearEntries && <div className={styles.notice} role="alert"><p>{t('settings.clearConfirm')} {clearEntries.length} {t('settings.count')}</p><div className={styles.actions}><button type="button" className={styles.button} onClick={() => setClearEntries(null)}>{t('settings.cancelAction')}</button><button type="button" className={styles.danger} disabled={saving} onClick={clear}>{t('settings.confirmDelete')}</button></div></div>}
        {loading && <p className={styles.muted}>{t('settings.loading')}</p>}
        {!loading && visibleItems.length === 0 && <p className={styles.empty}>{t('settings.noItems')}</p>}
        <div className={styles.itemList} role="list">
          {visibleItems.map(item => (
            <button type="button" role="listitem" key={item.id} className={item.id === selectedId ? styles.itemSelected : styles.item} onClick={() => select(item)}>
              <span className={styles.itemContent}>{item.content}</span>
              <span className={styles.itemMeta}>{item.scope === 'global' ? t('settings.global') : item.scope === 'workspace' ? t('settings.workspace') : t('settings.session')}{item.workspaceId || item.sessionId ? ' · ' + (item.workspaceId ?? item.sessionId) : ''}{item.pinned ? ` · ${t('settings.pinned')}` : ''}{item.expiresAt !== undefined && item.expiresAt <= Date.now() ? ' · ' + t('settings.expired') : ''}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section} hidden={dock && memoryTab !== 'pending'}>
        <header className={styles.sectionHeader}><strong>{t('settings.pending')}</strong><span>{pending.length} {t('settings.count')}</span></header>
        {pending.length === 0 && <p className={styles.muted}>{t('settings.noPending')}</p>}
        <p className={styles.muted}>{t('settings.pendingHint')}</p>
        <div className={styles.pendingList}>
          {pending.map(entry => (
            <article className={styles.pendingItem} key={entry.id}>
              <p className={styles.pendingContent}>{entry.item.content}</p>
              <p className={styles.notice}>{t('settings.suggestion')} {t(('settings.' + entry.item.scope) as MemoryLocaleKey)} · {new Date(entry.createdAt).toLocaleString()}</p>
              <label className={styles.field}><span>{t('settings.replacement')}</span><select value={replacements[entry.id] ?? ''} onChange={event => setReplacements(current => ({ ...current, [entry.id]: event.target.value }))}><option value="">{t('settings.newMemory')}</option>{items.filter(item => item.scope === entry.item.scope && item.workspaceId === entry.item.workspaceId && item.sessionId === entry.item.sessionId).map(item => <option key={item.id} value={item.id}>{t('settings.replaceMemory')}: {item.content.slice(0, 80)}</option>)}</select></label>
              {replacements[entry.id] && <blockquote>{items.find(item => item.id === replacements[entry.id])?.content}</blockquote>}
              <div className={styles.actions}>
                <button type="button" className={styles.primary} disabled={saving || !settingsSnapshot.writable} onClick={() => confirm(entry)}>{t('settings.confirm')}</button>
                <button type="button" className={styles.button} disabled={saving || !settingsSnapshot.writable} onClick={() => reject(entry)}>{t('settings.reject')}</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.editor} hidden={dock && !editorOpen}>
        {selectedId && <p className={styles.muted}>{t('settings.updated')} {new Date(draft.expectedUpdatedAt ?? 0).toLocaleString()}</p>}
        <header className={styles.sectionHeader}><strong>{selectedId === undefined ? t('settings.newMemory') : t('settings.edit')}</strong></header>
        <label className={styles.field}><span>{t('settings.scope')}</span><select value={draft.scope} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, scope: event.target.value as MemoryScope }))}><option value="global">{t('settings.global')}</option><option value="workspace">{t('settings.workspace')}</option><option value="session">{t('settings.session')}</option></select></label>
        {draft.scope === 'workspace' && <label className={styles.field}><span>{t('settings.workspaceId')}</span><input value={draft.workspaceId} maxLength={128} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, workspaceId: event.target.value }))} /></label>}
        {draft.scope === 'session' && <label className={styles.field}><span>{t('settings.sessionId')}</span><input value={draft.sessionId} maxLength={128} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, sessionId: event.target.value }))} /></label>}
        <label className={styles.field}><span>{t('settings.content')}</span><textarea value={draft.content} maxLength={MAX_MEMORY_CONTENT_LENGTH} placeholder={t('settings.contentPlaceholder')} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} /><span className={styles.counter}>{draft.content.length} / {MAX_MEMORY_CONTENT_LENGTH}</span></label>
        <details className={styles.details} data-memory-advanced="true"><summary>{t('settings.advanced')}</summary>
        <p className={styles.muted}>{t('settings.targetHint')}</p>
        <label className={styles.field}><span>{t('settings.tags')}</span><input value={draft.tags} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, tags: event.target.value }))} /></label>
        <label className={styles.toggle}><input type="checkbox" checked={draft.pinned} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, pinned: event.target.checked }))} />{t('settings.pinned')}</label>
        <label className={styles.field}><span>{t('settings.expiresAt')}</span><input value={draft.expiresAt} inputMode="numeric" disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, expiresAt: event.target.value }))} /></label>
        </details>
        <footer className={styles.actions} data-dock-save-bar={dock || undefined}>
          {selectedId !== undefined && <button type="button" className={styles.danger} disabled={saving || !settingsSnapshot.writable} onClick={remove}>{t('settings.delete')}</button>}
          <button type="button" className={styles.button} disabled={saving} onClick={() => { setSelectedId(undefined); setDraft(emptyDraft()); setCleanDraft(JSON.stringify(emptyDraft())); setEditorOpen(!dock) }}>{t('settings.cancel')}</button>
          <button type="button" className={styles.primary} data-dock-save="true" disabled={saving || !settingsSnapshot.writable} onClick={save}>{saving ? t('settings.saving') : t('settings.save')}</button>
        </footer>
      </section>
      <MemoryActivityPanel t={t} enabled={enabled} onEdit={select} />
    </section>
  )
}

