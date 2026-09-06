import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  DEFAULT_PERSONAL_PROMPT,
  MAX_PROMPT_CONTENT_LENGTH,
  normalizePersonalPrompt,
  removePromptProfile,
  renderPromptProfile,
  setActivePromptProfile,
  upsertPromptProfile,
  type PersonalPromptConfig,
  type PromptProfile,
  type PromptProfileScope,
} from '../core/config.ts'
import styles from './personal-prompt.module.css'

interface WorkspaceItem {
  id?: string
  workspaceId?: string
  title?: string
  path?: string
}

interface WorkspaceState {
  items: readonly WorkspaceItem[]
}

interface PromptProfileDraft {
  id: string
  name: string
  content: string
  enabled: boolean
  scope: PromptProfileScope
  workspaceId: string
  sessionId: string
  updatedAt: number
}

export type PersonalPromptCardProps = PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'personal-prompt'>
  & {
    config: PersonalPromptConfig
    settingsScope: SettingsScope<PersonalPromptConfig>
  }

function workspaceIdOf(item: WorkspaceItem): string | undefined {
  return item.workspaceId ?? item.id
}

function toDraft(profile: PromptProfile): PromptProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    content: profile.content,
    enabled: profile.enabled,
    scope: profile.scope,
    workspaceId: profile.workspaceId ?? '',
    sessionId: profile.sessionId ?? '',
    updatedAt: profile.updatedAt,
  }
}

function newProfile(): PromptProfileDraft {
  const random = globalThis.crypto?.randomUUID?.()
  return {
    id: `prompt-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    name: '',
    content: '',
    enabled: true,
    scope: 'global',
    workspaceId: '',
    sessionId: '',
    updatedAt: Date.now(),
  }
}

function profileFromDraft(draft: PromptProfileDraft): PromptProfile {
  return {
    id: draft.id.trim(),
    name: draft.name,
    content: draft.content,
    enabled: draft.enabled,
    scope: draft.scope,
    ...(draft.scope === 'workspace' ? { workspaceId: draft.workspaceId.trim() } : {}),
    ...(draft.scope === 'session' ? { sessionId: draft.sessionId.trim() } : {}),
    updatedAt: Date.now(),
  }
}

function errorText(_reason: unknown, fallback: string): string {
  // Backend messages may contain profile names, IDs or user-provided prompt
  // text. Keep the renderer on a bounded, localized error surface instead of
  // echoing an arbitrary exception into the settings UI.
  return fallback
}

function editableProfiles(config: PersonalPromptConfig): PromptProfile[] {
  return config.profiles.filter(profile => profile.scope !== 'session')
}

export function PersonalPromptCard(props: PersonalPromptCardProps) {
  const { config, settingsScope, t } = props
  const settingsSnapshot = useSyncExternalStore(
    listener => settingsScope.subscribe(listener),
    () => settingsScope.getSnapshot(),
    () => settingsScope.getSnapshot(),
  )
  const liveConfig = useMemo(() => {
    try { return normalizePersonalPrompt(settingsSnapshot.value ?? config) } catch { return { ...DEFAULT_PERSONAL_PROMPT, profiles: [] } }
  }, [config, settingsSnapshot.value])
  const [draftConfig, setDraftConfig] = useState<PersonalPromptConfig>(liveConfig)
  const initialProfile = liveConfig.profiles.find(profile => profile.scope !== 'session')
  const [selectedId, setSelectedId] = useState<string | undefined>(initialProfile?.id)
  const [editor, setEditor] = useState<PromptProfileDraft | undefined>(() => initialProfile === undefined ? undefined : toDraft(initialProfile))
  const [editorDirty, setEditorDirty] = useState(false)
  const [configDirty, setConfigDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastRevision = useRef(settingsSnapshot.revision)
  const useWorkspaces = (props as unknown as {
    useWorkspaces?: (selector: (state: WorkspaceState) => WorkspaceState) => WorkspaceState
  }).useWorkspaces
  // The official standard kit exposes a selector hook, not a zero-argument
  // snapshot reader. Passing the identity selector is also important at
  // runtime: the renderer's hook rejects an undefined selector.
  const workspaceState = useWorkspaces === undefined
    ? { items: [] as readonly WorkspaceItem[] }
    : useWorkspaces(state => state)
  const workspaceItems = workspaceState.items
  const visibleProfiles = useMemo(() => editableProfiles(draftConfig), [draftConfig])

  useEffect(() => {
    if (lastRevision.current !== settingsSnapshot.revision) {
      if (editorDirty || configDirty) setConflict(true)
      lastRevision.current = settingsSnapshot.revision
    }
  }, [configDirty, editorDirty, settingsSnapshot.revision])

  useEffect(() => {
    if (editorDirty || configDirty) return
    setDraftConfig(liveConfig)
    const next = selectedId === undefined ? visibleProfiles[0] : visibleProfiles.find(profile => profile.id === selectedId)
    if (next === undefined) {
      setSelectedId(visibleProfiles[0]?.id)
      setEditor(visibleProfiles[0] === undefined ? undefined : toDraft(visibleProfiles[0]))
    } else {
      setEditor(toDraft(next))
    }
  }, [configDirty, editorDirty, liveConfig, selectedId, visibleProfiles])

  const listedProfiles = useMemo(() => {
    if (editor === undefined || editor.scope === 'session' || visibleProfiles.some(profile => profile.id === editor.id)) return visibleProfiles
    return [...visibleProfiles, profileFromDraft(editor) as PromptProfile]
  }, [editor, visibleProfiles])

  const selectProfile = (id: string): void => {
    const profile = visibleProfiles.find(item => item.id === id)
    if (profile === undefined) return
    setSelectedId(id)
    setEditor(toDraft(profile))
    setEditorDirty(false)
    setError(null)
  }

  const editEditor = (patch: Partial<PromptProfileDraft>): void => {
    setEditor(current => current === undefined ? current : { ...current, ...patch })
    setEditorDirty(true)
    setSaved(false)
    setError(null)
  }

  const persist = async (next: PersonalPromptConfig): Promise<boolean> => {
    if (!settingsSnapshot.writable || saving) return false
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await settingsScope.set('profiles', next.profiles)
      await settingsScope.set('enabled', next.enabled)
      if (next.activeProfileId === undefined) await settingsScope.unset('activeProfileId')
      else await settingsScope.set('activeProfileId', next.activeProfileId)
      setDraftConfig(next)
      setConfigDirty(false)
      setEditorDirty(false)
      setConflict(false)
      setSaved(true)
      return true
    } catch (reason) {
      setError(errorText(reason, t('error.save')))
      return false
    } finally {
      setSaving(false)
    }
  }

  const save = (): void => {
    if (editor === undefined && !configDirty) return
    try {
      const next = editorDirty && editor !== undefined
        ? upsertPromptProfile(draftConfig, profileFromDraft(editor))
        : draftConfig
      void persist(next)
    } catch (reason) {
      setError(errorText(reason, t('error.invalid')))
    }
  }

  const create = (): void => {
    const next = newProfile()
    setSelectedId(next.id)
    setEditor(next)
    setEditorDirty(true)
    setError(null)
    setSaved(false)
  }

  const remove = (): void => {
    if (selectedId === undefined) return
    const exists = draftConfig.profiles.some(profile => profile.id === selectedId)
    if (!exists) {
      setSelectedId(visibleProfiles[0]?.id)
      setEditor(visibleProfiles[0] === undefined ? undefined : toDraft(visibleProfiles[0]))
      setEditorDirty(false)
      return
    }
    const next = removePromptProfile(draftConfig, selectedId)
    const nextVisible = editableProfiles(next)
    setSelectedId(nextVisible[0]?.id)
    setEditor(nextVisible[0] === undefined ? undefined : toDraft(nextVisible[0]))
    setDraftConfig(next)
    setConfigDirty(true)
    setEditorDirty(false)
    setSaved(false)
  }

  const reload = (): void => {
    setDraftConfig(liveConfig)
    const next = liveConfig.profiles.find(profile => profile.scope !== 'session')
    setSelectedId(next?.id)
    setEditor(next === undefined ? undefined : toDraft(next))
    setEditorDirty(false)
    setConfigDirty(false)
    setConflict(false)
    setError(null)
  }

  const activeProfile = editor === undefined ? undefined : (() => {
    try { return profileFromDraft(editor) } catch { return undefined }
  })()
  const preview = draftConfig.enabled && activeProfile?.enabled === true ? renderPromptProfile(activeProfile) : ''
  const dirty = editorDirty || configDirty
  const readOnlySession = editor?.scope === 'session'

  return (
    <section className={styles.card} data-personal-prompt-card="true">
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>{t('settings.title')}</h3>
          <p className={styles.description}>{t('settings.description')}</p>
        </div>
        <span className={dirty ? styles.dirty : styles.badge}>{dirty ? t('settings.unsaved') : saved ? t('settings.saved') : 'OK'}</span>
      </header>
      <p className={styles.notice}>{t('settings.ownerNotice')}</p>
      {!settingsSnapshot.writable && <p className={styles.notice} role="status">{t('settings.readonly')}</p>}
      {settingsSnapshot.status === 'loading' && <p className={styles.muted} role="status">{t('settings.loading')}</p>}
      {conflict && <p className={styles.error} role="alert">{t('settings.conflict')}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.toolbar}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={draftConfig.enabled} disabled={!settingsSnapshot.writable} onChange={event => { setDraftConfig(current => ({ ...current, enabled: event.target.checked })); setConfigDirty(true); setSaved(false) }} />
          {t('settings.enabled')}
        </label>
        <label className={styles.toggle}>
          <span>{t('settings.active')}</span>
          <select className={styles.activeSelect} value={draftConfig.activeProfileId ?? ''} disabled={!settingsSnapshot.writable} onChange={event => { const next = setActivePromptProfile(draftConfig, event.target.value || undefined); setDraftConfig(next); setConfigDirty(true); setSaved(false) }}>
            <option value="">{t('settings.none')}</option>
            {visibleProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
      </div>

      <section>
        <div className={styles.profileHeader}>
          <strong>{t('settings.profiles')}</strong>
          <button type="button" className={styles.button} disabled={!settingsSnapshot.writable || saving} onClick={create}>{t('settings.new')}</button>
        </div>
        {listedProfiles.length === 0 && <p className={styles.muted}>{t('settings.noProfiles')}</p>}
        <div className={styles.profileList} role="list">
          {listedProfiles.map(profile => (
            <button type="button" role="listitem" key={profile.id} className={`${styles.profileButton} ${profile.id === selectedId ? styles.profileSelected : ''}`} onClick={() => selectProfile(profile.id)}>
              <span className={styles.profileMain}><span className={styles.profileName}>{profile.name || profile.id}</span><span className={styles.profileMeta}>{profile.scope === 'global' ? t('settings.global') : profile.scope === 'workspace' ? `${t('settings.workspace')} · ${profile.workspaceId}` : t('settings.session')}</span></span>
              <span className={styles.profileState}>{profile.enabled ? t('settings.enable') : t('settings.disable')}</span>
            </button>
          ))}
        </div>
      </section>

      {editor !== undefined && editor.scope !== 'session' && (
        <section className={styles.editor} aria-label={t('settings.title')}>
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings.profileName')}</span><input value={editor.name} maxLength={128} disabled={readOnlySession} placeholder={t('settings.profileNamePlaceholder')} onChange={event => editEditor({ name: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings.scope')}</span><select value={editor.scope} disabled={readOnlySession} onChange={event => { const scope = event.target.value as PromptProfileScope; editEditor({ scope, workspaceId: scope === 'workspace' ? editor.workspaceId : '', sessionId: scope === 'session' ? editor.sessionId : '' }) }}><option value="global">{t('settings.global')}</option><option value="workspace">{t('settings.workspace')}</option><option value="session" disabled>{t('settings.session')}</option></select></label>
          {editor.scope === 'workspace' && <label className={styles.field}><span className={styles.fieldLabel}>{t('settings.workspaceId')}</span><input list="personal-prompt-workspaces" value={editor.workspaceId} maxLength={128} disabled={readOnlySession} placeholder={t('settings.workspaceIdPlaceholder')} onChange={event => editEditor({ workspaceId: event.target.value })} /><datalist id="personal-prompt-workspaces">{workspaceItems.map(item => { const id = workspaceIdOf(item); return id === undefined ? null : <option key={id} value={id}>{item.title ?? item.path ?? id}</option> })}</datalist></label>}
          {readOnlySession && <p className={styles.notice}>{t('settings.sessionReadonly')}</p>}
          <label className={styles.toggle}><input type="checkbox" checked={editor.enabled} disabled={readOnlySession} onChange={event => editEditor({ enabled: event.target.checked })} />{editor.enabled ? t('settings.enable') : t('settings.disable')}</label>
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings.content')}</span><textarea value={editor.content} maxLength={MAX_PROMPT_CONTENT_LENGTH} disabled={readOnlySession} placeholder={t('settings.contentPlaceholder')} onChange={event => editEditor({ content: event.target.value })} /><span className={styles.counter}>{editor.content.length} / {MAX_PROMPT_CONTENT_LENGTH}</span></label>
          <div><span className={styles.fieldLabel}>{t('settings.preview')}</span>{preview ? <pre className={styles.preview}>{preview}</pre> : <p className={styles.muted}>{t('settings.previewEmpty')}</p>}</div>
          <footer className={styles.footer}>
            <button type="button" className={styles.danger} disabled={!settingsSnapshot.writable || saving} onClick={remove}>{t('settings.delete')}</button>
            <button type="button" className={styles.button} disabled={!dirty || saving} onClick={reload}>{t('settings.discard')}</button>
            <button type="button" className={styles.primary} disabled={!dirty || saving || readOnlySession || !settingsSnapshot.writable} onClick={save}>{saving ? t('settings.loading') : t('settings.save')}</button>
          </footer>
        </section>
      )}
      <footer className={styles.actions}><button type="button" className={styles.button} disabled={saving} onClick={reload}>{t('settings.reload')}</button><button type="button" className={styles.primary} disabled={!dirty || saving || !settingsSnapshot.writable} onClick={save}>{t('settings.save')}</button></footer>
    </section>
  )
}
