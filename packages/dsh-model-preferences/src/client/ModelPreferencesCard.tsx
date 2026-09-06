import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  DEFAULT_MODEL_PREFERENCES,
  MAX_PINNED_MODELS,
  moveProvider,
  normalizeModelPreferences,
  providerIdsInOrder,
  sameModelKey,
  type ModelKey,
  type ModelPreferencesConfig,
} from '../core/config.ts'
import styles from './model-preferences.module.css'

export interface ModelPreferenceCatalog {
  groups: readonly ModelProviderGroup[]
  failures: readonly ModelCatalogFailure[]
}

export interface ModelPreferencesCardFace {
  config: ModelPreferencesConfig
  settingsScope: SettingsScope<ModelPreferencesConfig>
  loadCatalog: () => Promise<ModelPreferenceCatalog>
}

export type ModelPreferencesCardProps = PropsRuntime<'settings.models.content'>
  & PropsLocale<'model-preferences'>
  & PropsRenderSlots<'model-preferences.onboarding'>
  & ModelPreferencesCardFace

const EMPTY_CATALOG: ModelPreferenceCatalog = { groups: [], failures: [] }

function modelLabel(key: ModelKey): string {
  return `${key.provider} / ${key.model}`
}

function replacePinned(config: ModelPreferencesConfig, pinnedModels: ModelKey[]): ModelPreferencesConfig {
  return normalizeModelPreferences({ ...config, pinnedModels })
}

/** Settings card for the durable model preference projection. */
export function ModelPreferencesCard(props: ModelPreferencesCardProps) {
  const { config, settingsScope, loadCatalog, renderSlot, t } = props
  const settingsSnapshot = useSyncExternalStore(
    listener => settingsScope.subscribe(listener),
    () => settingsScope.getSnapshot(),
    () => settingsScope.getSnapshot(),
  )
  const liveConfig = useMemo(
    () => normalizeModelPreferences(settingsSnapshot.value ?? config),
    [config, settingsSnapshot.value],
  )
  const [draft, setDraft] = useState<ModelPreferencesConfig>(liveConfig)
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [catalog, setCatalog] = useState<ModelPreferenceCatalog>(EMPTY_CATALOG)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [manualProvider, setManualProvider] = useState('')
  const [manualModel, setManualModel] = useState('')
  const lastRevision = useRef(settingsSnapshot.revision)

  useEffect(() => {
    if (!dirty) setDraft(liveConfig)
    if (lastRevision.current !== settingsSnapshot.revision) {
      if (dirty) setConflict(true)
      lastRevision.current = settingsSnapshot.revision
    }
  }, [dirty, liveConfig, settingsSnapshot.revision])

  const readCatalog = (): void => {
    setCatalogLoading(true)
    setCatalogError(false)
    void loadCatalog().then((value) => {
      setCatalog(value)
      setCatalogLoading(false)
    }, () => {
      setCatalog(EMPTY_CATALOG)
      setCatalogError(true)
      setCatalogLoading(false)
    })
  }

  useEffect(() => {
    readCatalog()
    // The settings card owns one initial catalog read. The reload button is
    // the explicit second read, so a changed callback identity does not reset
    // the user's in-progress form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const knownProviders = useMemo(
    () => catalog.groups.map(group => group.id),
    [catalog.groups],
  )
  const orderedProviders = useMemo(
    () => providerIdsInOrder(catalog.groups, draft),
    [catalog.groups, draft],
  )
  const providerById = useMemo(
    () => new Map(catalog.groups.map(group => [group.id, group])),
    [catalog.groups],
  )

  const edit = (next: ModelPreferencesConfig): void => {
    setDraft(normalizeModelPreferences(next))
    setDirty(true)
    setSaved(false)
    setSaveError(null)
  }

  const persist = async (next: ModelPreferencesConfig): Promise<void> => {
    if (!settingsSnapshot.writable || saving) return
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      // SettingsScope exposes field-level writes and serializes them with the
      // Host revision fence. Keep the order deterministic and do not write
      // provider credentials or any official model setting here.
      await settingsScope.set('pinnedModels', next.pinnedModels)
      await settingsScope.set('providerOrder', next.providerOrder)
      await settingsScope.set('disabledProviders', next.disabledProviders)
      await settingsScope.set('recentModels', next.recentModels)
      setDraft(normalizeModelPreferences(next))
      setDirty(false)
      setConflict(false)
      setSaved(true)
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : t('settings.conflict'))
    } finally {
      setSaving(false)
    }
  }

  const pin = (key: ModelKey): void => {
    if (draft.pinnedModels.some(candidate => sameModelKey(candidate, key))) return
    if (draft.pinnedModels.length >= MAX_PINNED_MODELS) return
    edit(replacePinned(draft, [...draft.pinnedModels, key]))
  }

  const unpin = (key: ModelKey): void => {
    edit(replacePinned(draft, draft.pinnedModels.filter(candidate => !sameModelKey(candidate, key))))
  }

  const swapPinned = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= draft.pinnedModels.length) return
    const pinned = [...draft.pinnedModels]
    const [item] = pinned.splice(index, 1)
    pinned.splice(target, 0, item)
    edit(replacePinned(draft, pinned))
  }

  const addManualPin = (): void => {
    const provider = manualProvider.trim()
    const model = manualModel.trim()
    if (!provider || !model || draft.pinnedModels.length >= MAX_PINNED_MODELS) return
    pin({ provider, model })
    setManualProvider('')
    setManualModel('')
  }

  const disabled = new Set(draft.disabledProviders)

  return (
    <section className={styles.card} data-model-preferences-card="true">
      {renderSlot('model-preferences.onboarding', {})}
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.title}>{t('settings.title')}</h3>
          <p className={styles.description}>{t('settings.description')}</p>
        </div>
        <span className={dirty ? styles.badgeDirty : styles.badge}>{dirty ? t('settings.unsaved') : saved ? t('settings.saved') : 'OK'}</span>
      </header>

      {!settingsSnapshot.writable && <p className={styles.notice} role="status">{t('settings.readonly')}</p>}
      {conflict && <p className={styles.error} role="alert">{t('settings.conflict')}</p>}
      {saveError && <p className={styles.error} role="alert">{saveError}</p>}

      <section className={styles.section} aria-labelledby="model-preferences-pinned-title">
        <div className={styles.sectionHeader}>
          <h4 id="model-preferences-pinned-title">{t('settings.pinned')}</h4>
          <span>{draft.pinnedModels.length} / {MAX_PINNED_MODELS}</span>
        </div>
        {draft.pinnedModels.length === 0 && <p className={styles.muted}>{t('settings.pinnedEmpty')}</p>}
        <div className={styles.pinnedList}>
          {draft.pinnedModels.map((key, index) => (
            <div className={styles.pinnedRow} key={`${key.provider}\u0000${key.model}`}>
              <span className={styles.pinnedIndex}>{index + 1}</span>
              <span className={styles.modelText}>{modelLabel(key)}</span>
              <button type="button" className={styles.smallButton} disabled={index === 0} onClick={() => swapPinned(index, -1)} aria-label={t('settings.swapUp')}>{t('settings.swapUp')}</button>
              <button type="button" className={styles.smallButton} disabled={index === draft.pinnedModels.length - 1} onClick={() => swapPinned(index, 1)} aria-label={t('settings.swapDown')}>{t('settings.swapDown')}</button>
              <button type="button" className={styles.smallButton} onClick={() => unpin(key)}>{t('settings.unpin')}</button>
            </div>
          ))}
        </div>
        <div className={styles.manualPin}>
          <span className={styles.manualLabel}>{t('settings.manualPin')}</span>
          <input value={manualProvider} onChange={event => setManualProvider(event.target.value)} placeholder={t('settings.modelInputProvider')} aria-label={t('settings.modelInputProvider')} maxLength={128} />
          <input value={manualModel} onChange={event => setManualModel(event.target.value)} placeholder={t('settings.modelInputName')} aria-label={t('settings.modelInputName')} maxLength={128} />
          <button type="button" className={styles.smallButton} disabled={draft.pinnedModels.length >= MAX_PINNED_MODELS} onClick={addManualPin}>{t('settings.add')}</button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="model-preferences-providers-title">
        <div className={styles.sectionHeader}>
          <h4 id="model-preferences-providers-title">{t('settings.providers')}</h4>
          <button type="button" className={styles.smallButton} onClick={readCatalog} disabled={catalogLoading}>{t('settings.reload')}</button>
        </div>
        {catalogLoading && <p className={styles.muted} role="status">{t('settings.loading')}</p>}
        {catalogError && <p className={styles.error} role="alert">{t('settings.catalogError')}</p>}
        {!catalogLoading && orderedProviders.length === 0 && <p className={styles.muted}>{t('settings.noProviders')}</p>}
        <div className={styles.providerList}>
          {orderedProviders.map((provider, index) => {
            const group = providerById.get(provider)
            return (
              <div className={styles.providerRow} key={provider}>
                <div className={styles.providerMain}>
                  <span className={styles.providerName}>{group?.name || provider}</span>
                  <code>{provider}</code>
                </div>
                <div className={styles.providerActions}>
                  <button type="button" className={styles.smallButton} disabled={index === 0} onClick={() => edit(moveProvider(draft, provider, -1, knownProviders))} aria-label={t('settings.swapUp')}>{t('settings.swapUp')}</button>
                  <button type="button" className={styles.smallButton} disabled={index === orderedProviders.length - 1} onClick={() => edit(moveProvider(draft, provider, 1, knownProviders))} aria-label={t('settings.swapDown')}>{t('settings.swapDown')}</button>
                  <button type="button" className={styles.toggleButton} aria-pressed={!disabled.has(provider)} onClick={() => edit({ ...draft, disabledProviders: disabled.has(provider) ? draft.disabledProviders.filter(id => id !== provider) : [...draft.disabledProviders, provider] })}>
                    {disabled.has(provider) ? t('settings.enable') : t('settings.disable')}
                  </button>
                </div>
                {group && <div className={styles.providerModels}>
                  {group.models.map(model => {
                    const key = { provider, model: model.id }
                    const isPinned = draft.pinnedModels.some(candidate => sameModelKey(candidate, key))
                    return (
                      <div className={styles.modelRow} key={model.id}>
                        <span title={model.description}>{model.name || model.id}</span>
                        <code>{model.id}</code>
                        <button type="button" className={styles.smallButton} disabled={!isPinned && draft.pinnedModels.length >= MAX_PINNED_MODELS} onClick={() => isPinned ? unpin(key) : pin(key)}>{isPinned ? t('settings.unpin') : t('settings.pin')}</button>
                      </div>
                    )
                  })}
                </div>}
              </div>
            )
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        <button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => { const next = { ...DEFAULT_MODEL_PREFERENCES }; edit(next); void persist(next) }}>{t('settings.reset')}</button>
        <button type="button" className={styles.primaryButton} disabled={!dirty || saving || !settingsSnapshot.writable} onClick={() => void persist(draft)}>{saving ? t('status.selecting') : t('settings.save')}</button>
      </footer>
    </section>
  )
}
