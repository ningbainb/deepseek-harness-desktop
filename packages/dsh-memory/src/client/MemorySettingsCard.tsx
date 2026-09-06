import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
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
  const [enabled, setEnabled] = useState(liveConfig.enabled)
  const [items, setItems] = useState<MemoryPublicItem[]>([])
  const [pending, setPending] = useState<PendingItem[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [filter, setFilter] = useState('')
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
            getJson('/api/dsh-memory/items'),
            getJson('/api/dsh-memory/pending'),
          ])
          setItems(responseItems(itemValue))
          setPending(responsePending(pendingValue))
          setLoading(false)
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
    if (needle === '') return items
    return items.filter(item => [item.content, ...item.tags].join(' ').toLocaleLowerCase().includes(needle))
  }, [filter, items])

  const select = (item: MemoryPublicItem): void => {
    setSelectedId(item.id)
    setDraft(draftOf(item))
    setSaved(false)
    setError(null)
  }

  const create = (): void => {
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
    void postJson('/api/dsh-memory/items', body).then(() => {
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
    void postJson('/api/dsh-memory/items', { operation: 'remove', id: selectedId }).then(() => {
      setSelectedId(undefined)
      setDraft(emptyDraft())
      setSaving(false)
      load()
    }, reason => {
      setError(errorMessage(reason instanceof Error ? (reason as Error & { code?: unknown }).code : undefined, t))
      setSaving(false)
    })
  }

  const clear = (): void => {
    if (saving) return
    setSaving(true)
    void postJson('/api/dsh-memory/items', { operation: 'clear' }).then(() => {
      setSelectedId(undefined)
      setDraft(emptyDraft())
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
    void postJson('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'confirm' }).then(() => {
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
    <section className={styles.card} data-memory-card="true">
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>{t('settings.title')}</h3>
          <p className={styles.description}>{t('settings.description')}</p>
        </div>
        <span className={saved ? styles.badgeSaved : styles.badge}>{saved ? t('settings.saved') : t('settings.unsaved')}</span>
      </header>
      <p className={styles.notice}>{t('settings.ownerNotice')}</p>
      {!settingsSnapshot.writable && <p className={styles.notice} role="status">{t('settings.readonly')}</p>}
      {settingsSnapshot.status === 'loading' && <p className={styles.muted} role="status">{t('settings.loading')}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <label className={styles.toggle}>
        <input type="checkbox" checked={enabled} disabled={!settingsSnapshot.writable || saving} onChange={event => saveConfig(event.target.checked)} />
        {t('settings.enabled')}
      </label>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <strong>{t('settings.items')}</strong>
          <span>{visibleItems.length} {t('settings.count')}</span>
          <button type="button" className={styles.button} disabled={saving} onClick={load}>{t('settings.reload')}</button>
        </header>
        <div className={styles.filterRow}>
          <input value={filter} onChange={event => setFilter(event.target.value)} placeholder={t('settings.searchPlaceholder')} aria-label={t('settings.search')} />
          <button type="button" className={styles.button} disabled={saving || !settingsSnapshot.writable} onClick={create}>{t('settings.new')}</button>
          <button type="button" className={styles.danger} disabled={saving || items.length === 0 || !settingsSnapshot.writable} onClick={clear}>{t('settings.clear')}</button>
        </div>
        {loading && <p className={styles.muted}>{t('settings.loading')}</p>}
        {!loading && visibleItems.length === 0 && <p className={styles.muted}>{t('settings.noItems')}</p>}
        <div className={styles.itemList} role="list">
          {visibleItems.map(item => (
            <button type="button" role="listitem" key={item.id} className={item.id === selectedId ? styles.itemSelected : styles.item} onClick={() => select(item)}>
              <span className={styles.itemContent}>{item.content}</span>
              <span className={styles.itemMeta}>{item.scope === 'global' ? t('settings.global') : item.scope === 'workspace' ? t('settings.workspace') : t('settings.session')}{item.pinned ? ` · ${t('settings.pinned')}` : ''}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><strong>{t('settings.pending')}</strong><span>{pending.length} {t('settings.count')}</span></header>
        {pending.length === 0 && <p className={styles.muted}>{t('settings.noPending')}</p>}
        <div className={styles.pendingList}>
          {pending.map(entry => (
            <article className={styles.pendingItem} key={entry.id}>
              <p className={styles.pendingContent}>{entry.item.content}</p>
              <p className={styles.notice}>{t('settings.suggestion')}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} disabled={saving || !settingsSnapshot.writable} onClick={() => confirm(entry)}>{t('settings.confirm')}</button>
                <button type="button" className={styles.button} disabled={saving || !settingsSnapshot.writable} onClick={() => reject(entry)}>{t('settings.reject')}</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.editor}>
        <header className={styles.sectionHeader}><strong>{selectedId === undefined ? t('settings.new') : selectedId}</strong></header>
        <label className={styles.field}><span>{t('settings.scope')}</span><select value={draft.scope} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, scope: event.target.value as MemoryScope }))}><option value="global">{t('settings.global')}</option><option value="workspace">{t('settings.workspace')}</option><option value="session">{t('settings.session')}</option></select></label>
        {draft.scope === 'workspace' && <label className={styles.field}><span>{t('settings.workspaceId')}</span><input value={draft.workspaceId} maxLength={128} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, workspaceId: event.target.value }))} /></label>}
        {draft.scope === 'session' && <label className={styles.field}><span>{t('settings.sessionId')}</span><input value={draft.sessionId} maxLength={128} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, sessionId: event.target.value }))} /></label>}
        <label className={styles.field}><span>{t('settings.content')}</span><textarea value={draft.content} maxLength={MAX_MEMORY_CONTENT_LENGTH} placeholder={t('settings.contentPlaceholder')} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} /><span className={styles.counter}>{draft.content.length} / {MAX_MEMORY_CONTENT_LENGTH}</span></label>
        <label className={styles.field}><span>{t('settings.tags')}</span><input value={draft.tags} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, tags: event.target.value }))} /></label>
        <label className={styles.toggle}><input type="checkbox" checked={draft.pinned} disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, pinned: event.target.checked }))} />{t('settings.pinned')}</label>
        <label className={styles.field}><span>{t('settings.expiresAt')}</span><input value={draft.expiresAt} inputMode="numeric" disabled={saving || !settingsSnapshot.writable} onChange={event => setDraft(current => ({ ...current, expiresAt: event.target.value }))} /></label>
        <footer className={styles.actions}>
          {selectedId !== undefined && <button type="button" className={styles.danger} disabled={saving || !settingsSnapshot.writable} onClick={remove}>{t('settings.delete')}</button>}
          <button type="button" className={styles.button} disabled={saving} onClick={() => { setSelectedId(undefined); setDraft(emptyDraft()) }}>{t('settings.cancel')}</button>
          <button type="button" className={styles.primary} disabled={saving || !settingsSnapshot.writable} onClick={save}>{saving ? t('settings.loading') : t('settings.save')}</button>
        </footer>
      </section>
    </section>
  )
}

