import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  catalogFromDirectory,
  modelDisplayName,
  selectionForModel,
  sortModelCatalog,
  type ModelPreferencesConfig,
  type SortedModelOption,
} from './model-projection.ts'
import styles from './model-preferences.module.css'
import { installModelRefreshBridge } from './model-refresh.ts'

export type ModelSelectProps = PropsRuntime<'conversation.input.model'>
  & PropsLocale<'model-preferences'>
  & ModelSelectInjected
  & {
    modelSessionId: string
    settingsScope: import('@deepseek-ai/dsh-client-ui-settings/client').SettingsScope<ModelPreferencesConfig>
  }

type Pane = 'root' | 'model' | 'effort'

interface EffortChoice {
  key: string
  effort?: string
  label: string
  description?: string
}

function errorText(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message.trim() ? reason.message.trim() : fallback
}

/**
 * Preference-aware composer model seat. Its data projection is local to this
 * plugin, while its geometry and interaction model follow the official
 * model-selection seat so the desktop composer keeps its native appearance.
 */
export function ModelSelect(props: ModelSelectProps) {
  const { locked, available, directory, load, modelSessionId, select, settingsScope, t } = props
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastActionRef = useRef<'load' | 'select'>('load')
  const loadRef = useRef(load)
  loadRef.current = load
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const refreshBridgeRef = useRef<{ announce(): void; dispose(): void } | null>(null)
  const id = useId()
  const state = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
    () => directory.getSnapshot(),
  )
  const settingsSnapshot = useSyncExternalStore(
    listener => settingsScope.subscribe(listener),
    () => settingsScope.getSnapshot(),
    () => settingsScope.getSnapshot(),
  )
  const config = settingsSnapshot.value ?? {
    version: 1 as const,
    pinnedModels: [],
    providerOrder: [],
    disabledProviders: [],
    recentModels: [],
  }
  const catalog = useMemo(
    () => sortModelCatalog(catalogFromDirectory(state), config),
    [config, state],
  )
  const options = useMemo(
    () => [...catalog.pinned, ...catalog.groups.flatMap(group => group.models)],
    [catalog],
  )
  const currentOption = options.find(option => option.current)
  const reasoning = currentOption?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.default')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<EffortChoice[]>(() => {
    if (reasoning === undefined) return []
    return [
      ...(reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.default') }]
        : []),
      ...reasoning.efforts.map(effort => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
        ...(effort.description === undefined ? {} : { description: effort.description }),
      })),
    ]
  }, [reasoning, t])
  const busy = state.status === 'selecting' || selecting
  const currentName = modelDisplayName(currentOption, state.current)
  const modelLabel = currentName || t('trigger.fallback')
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`

  const reload = useCallback((): void => {
    lastActionRef.current = 'load'
    loadRef.current()
  }, [])

  useEffect(() => {
    if (!available) return
    reload()
  }, [available, directory, modelSessionId, reload])

  useEffect(() => {
    refreshBridgeRef.current?.dispose()
    refreshBridgeRef.current = null
    if (!available) return
    const bridge = installModelRefreshBridge({ sessionId: modelSessionId, refresh: reload })
    refreshBridgeRef.current = bridge
    return () => {
      bridge.dispose()
      if (refreshBridgeRef.current === bridge) refreshBridgeRef.current = null
    }
  }, [available, modelSessionId, reload])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (pane !== 'root') setPane('root')
      else {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, pane])

  if (!available) return null

  const close = (): void => {
    setOpen(false)
    setPane('root')
    setError(null)
  }

  const chooseSelection = async (selection: ModelSelection): Promise<void> => {
    if (busy) return
    setSelecting(true)
    setError(null)
    lastActionRef.current = 'select'
    try {
      const accepted = await select(selection)
      if (!accepted) throw new Error(t('error.select'))
      refreshBridgeRef.current?.announce()
      close()
      triggerRef.current?.focus()
    } catch (reason) {
      setError(errorText(reason, t('error.select')))
    } finally {
      setSelecting(false)
    }
  }

  const chooseModel = (option: SortedModelOption): void => {
    if (option.providerDisabled || busy) return
    void chooseSelection(selectionForModel(option, state.current))
  }

  const chooseEffort = (effort?: string): void => {
    if (state.current === null || busy) return
    void chooseSelection({
      provider: state.current.provider,
      model: state.current.model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    })
  }

  const renderOption = (option: SortedModelOption) => (
    <button
      type="button"
      key={`${option.provider}\u0000${option.model.id}`}
      className={`${styles.option} ${option.current ? styles.optionCurrent : ''}`}
      role="menuitemradio"
      aria-checked={option.current}
      title={option.model.name || option.model.id}
      disabled={option.providerDisabled || busy}
      onClick={() => chooseModel(option)}
    >
      <span className={styles.optionCopy}>
        <span className={styles.modelName}>{option.model.name || option.model.id}</span>
        {option.providerDisabled && <span className={styles.description}>{t('status.providerDisabled')}</span>}
      </span>
      <span className={styles.check} aria-hidden="true">{option.current && <span className={styles.checkmark} />}</span>
    </button>
  )

  const renderGroup = (label: string, groupOptions: readonly SortedModelOption[], key: string) => (
    <section key={key} role="group" aria-label={label} className={styles.group}>
      <div className={styles.groupTitle}>{label}</div>
      {groupOptions.map(renderOption)}
    </section>
  )

  return (
    <div className={styles.root} ref={rootRef} onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      if (pane !== 'root') setPane('root')
      else close()
    }}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={currentName ? t('trigger.aria', { model: triggerLabel }) : t('trigger.fallback')}
        title={triggerLabel}
        disabled={locked}
        onClick={() => {
          if (open) close()
          else {
            setOpen(true)
            setPane('root')
            setError(null)
            // The mounted directory and the refresh bridge already keep this
            // projection current. Opening the menu must not restart the same
            // model request on every click.
            if (state.status === 'idle' || state.status === 'error') reload()
          }
        }}
      >
        <span className={styles.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={styles.triggerEffort}>{effortLabel}</span>}
        <span aria-hidden="true" className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
      </button>

      {open && (
        <div
          id={`${id}-menu`}
          className={styles.menu}
          role="menu"
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {pane === 'root' && (
            <>
              <button type="button" role="menuitem" className={styles.cell} onClick={() => setPane('model')}>
                <span className={styles.cellLabel}>{t('menu.models')}</span>
                <span className={styles.cellValue}>{modelLabel}</span>
                <span aria-hidden="true" className={styles.cellChevron} />
              </button>
              {reasoning !== undefined && (
                <button type="button" role="menuitem" className={styles.cell} onClick={() => setPane('effort')}>
                  <span className={styles.cellLabel}>{t('menu.effort')}</span>
                  <span className={styles.cellValue}>{effortLabel}</span>
                  <span aria-hidden="true" className={styles.cellChevron} />
                </button>
              )}
            </>
          )}

          {pane === 'model' && (
            <>
              {state.status === 'loading' && <div className={styles.status} role="status">{t('status.loading')}</div>}
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={styles.error} role="alert">
                  <span>{t('error.load')} {state.error}</span>
                  <button type="button" className={styles.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              )}
              {error !== null && <div className={styles.error} role="alert"><span>{error}</span></div>}
              {catalog.failures.map(failure => (
                <div key={failure.id} className={styles.warning} role="status">
                  <span>{failure.name || failure.id}: {failure.message}</span>
                  <button type="button" className={styles.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              ))}
              <div className={`${styles.groups} scrollable`}>
                {catalog.pinned.length > 0 && renderGroup(t('menu.pinned'), catalog.pinned, 'pinned')}
                {catalog.groups.map(group => renderGroup(group.name, group.models, group.id))}
              </div>
              {state.status === 'ready' && options.length === 0 && <div className={styles.empty}>{t('status.empty')}</div>}
            </>
          )}

          {pane === 'effort' && (
            <>
              {error !== null && <div className={styles.error} role="alert"><span>{error}</span></div>}
              {effortChoices.length === 0 && <div className={styles.empty}>{t('status.empty')}</div>}
              {effortChoices.map(choice => (
                <button
                  key={choice.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={effectiveEffort === choice.effort}
                  className={`${styles.option} ${effectiveEffort === choice.effort ? styles.optionCurrent : ''}`}
                  disabled={busy}
                  onClick={() => chooseEffort(choice.effort)}
                >
                  <span className={styles.optionCopy}>
                    <span className={styles.modelName}>{choice.label}</span>
                    {choice.description !== undefined && <span className={styles.description}>{choice.description}</span>}
                  </span>
                  <span className={styles.check} aria-hidden="true">{effectiveEffort === choice.effort && <span className={styles.checkmark} />}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
