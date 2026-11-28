import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PRIMARY_PROVIDER_ID } from '../core/config.ts'
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
  & Partial<PropsRenderSlots<'model-preferences.menu.options' | 'model-preferences.menu.pane'>>
  & {
    modelSessionId: string
    sessionCwd?: string
    getSessionCwd?: () => string | undefined
    settingsScope: import('@deepseek-ai/dsh-client-ui-settings/client').ConfigForm<ModelPreferencesConfig>
  }

interface AcpCatalogModel {
  id: string
  name: string
}

interface AcpSelection {
  conversationId: string
  modelId?: string
  thoughtOption?: { currentValue?: string; options?: Array<{ value: string; name?: string }> }
}

function sortAcpModels(models: AcpCatalogModel[]): AcpCatalogModel[] {
  const isGemini = (m: AcpCatalogModel) => /gemini|orchestrator/iu.test(m.id) || /gemini|orchestrator/iu.test(m.name)
  return [...models].sort((a, b) => Number(isGemini(b)) - Number(isGemini(a)))
}

type Pane = 'root' | 'model' | 'effort' | 'detail'

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
  const { locked, available, directory, load, modelSessionId, sessionCwd, getSessionCwd, select, settingsScope, t } = props
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const [detailPane, setDetailPane] = useState<{ key: string; title: string } | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acpModels, setAcpModels] = useState<AcpCatalogModel[]>([])
  const [acpSelection, setAcpSelection] = useState<AcpSelection | null>(null)
  const [relayAccessAvailable, setRelayAccessAvailable] = useState(
    () => typeof document !== 'undefined' && document.querySelector('[data-dsh-relay-access-root]') !== null,
  )
  const lastActionRef = useRef<'load' | 'select'>('load')
  const loadRef = useRef(load)
  loadRef.current = load
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const refreshBridgeRef = useRef<{ announce(): void; dispose(): void } | null>(null)
  const id = useId()
  const activeAcp = acpSelection?.conversationId === modelSessionId ? acpSelection : null
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
  const hasConfiguredRelay = options.some(
    option => option.provider === PRIMARY_PROVIDER_ID && option.model.id !== '__bai_login_required__',
  )
  const currentOption = options.find(option => option.current)
  const reasoning = activeAcp ? undefined : currentOption?.model.reasoning
  const thoughtOptions = activeAcp?.thoughtOption?.options
  const effectiveEffort = activeAcp?.thoughtOption?.currentValue ?? state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = thoughtOptions?.length ? thoughtOptions.find(level => level.value === effectiveEffort)?.name ?? effectiveEffort
    : reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.default')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<EffortChoice[]>(() => {
    if (thoughtOptions?.length) return thoughtOptions.map(option => ({ key: option.value, label: option.name ?? option.value, effort: option.value }))
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
  }, [reasoning, t, thoughtOptions])
  const busy = state.status === 'selecting' || selecting
  const currentName = activeAcp ? acpModels.find(model => model.id === activeAcp.modelId)?.name ?? activeAcp.modelId
    : state.current?.provider === 'project-relay' && state.current.model === '__bai_login_required__'
    ? t('trigger.baiPending') : modelDisplayName(currentOption, state.current)
  const modelLabel = currentName || t('trigger.fallback')
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`

  const reload = useCallback((): void => {
    lastActionRef.current = 'load'
    loadRef.current()
  }, [])

  const openAcpModel = useCallback((modelId: string) => {
    document.dispatchEvent(new CustomEvent('dsh-antigravity-acp-open', {
      detail: { modelId, cwd: getSessionCwd?.() ?? sessionCwd, conversationId: modelSessionId },
    }))
  }, [getSessionCwd, modelSessionId, sessionCwd])

  useEffect(() => {
    if (!available) return
    const sync = (event: Event) => setAcpSelection((event as CustomEvent<AcpSelection | null>).detail)
    const pick = (event: Event) => {
      const content = rootRef.current?.closest('[data-conversation-content]')
      const modelId = (event as CustomEvent<string>).detail
      if (typeof modelId === 'string' && content && content === content.closest('[data-slot="main.conversation"]')?.querySelector('[data-conversation-content]')) {
        openAcpModel(modelId)
      }
    }
    document.addEventListener('dsh-antigravity-acp-selection', sync)
    document.addEventListener('dsh-antigravity-acp-pick', pick)
    document.dispatchEvent(new Event('dsh-antigravity-acp-selection-request'))
    return () => {
      document.removeEventListener('dsh-antigravity-acp-selection', sync)
      document.removeEventListener('dsh-antigravity-acp-pick', pick)
    }
  }, [available, openAcpModel])

  useEffect(() => {
    const update = () => setRelayAccessAvailable(
      typeof document !== 'undefined' && document.querySelector('[data-dsh-relay-access-root]') !== null,
    )
    document.addEventListener('dsh-relay-access-changed', update)
    update()
    return () => document.removeEventListener('dsh-relay-access-changed', update)
  }, [])

  useEffect(() => {
    if (!available || typeof fetch !== 'function') return
    let generation = 0
    const refreshAcp = () => {
      const request = ++generation
      void fetch('/api/dsh-antigravity-cli', { headers: { 'x-dsh-antigravity': '1' } })
        .then(res => (res.ok ? res.json() : null))
        .then((diag: { state?: string; harnessLlmAllowed?: boolean; models?: Array<{ id?: string; name?: string }> } | null) => {
          if (request !== generation) return
          if (diag?.state === 'ready' && !diag.harnessLlmAllowed && Array.isArray(diag.models) && diag.models.length > 0) {
            setAcpModels(sortAcpModels(diag.models.filter((m): m is AcpCatalogModel =>
              typeof m?.id === 'string' && typeof m?.name === 'string')))
          } else {
            setAcpModels([])
          }
        })
        .catch(() => {})
    }
    refreshAcp()
    window.addEventListener('dsh-antigravity-status-updated', refreshAcp)
    return () => {
      generation += 1
      window.removeEventListener('dsh-antigravity-status-updated', refreshAcp)
    }
  }, [available])

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
      if (pane !== 'root') {
        setPane('root')
        setDetailPane(null)
      } else {
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
    setDetailPane(null)
    setError(null)
  }

  const menuControls = {
    locked: locked || busy,
    dismiss: () => {
      close()
      triggerRef.current?.focus()
    },
    reportFailure: (message: string) => setError(message),
  }

  const chooseSelection = async (selection: ModelSelection): Promise<void> => {
    if (busy) return
    setSelecting(true)
    setError(null)
    lastActionRef.current = 'select'
    try {
      const accepted = await select(selection)
      if (accepted === undefined || !accepted.ok) throw new Error(t('error.select'))
      if (activeAcp) document.dispatchEvent(new CustomEvent('dsh-antigravity-acp-deactivate', { detail: modelSessionId }))
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
    if (activeAcp) {
      document.dispatchEvent(new CustomEvent('dsh-antigravity-acp-effort', { detail: { conversationId: modelSessionId, value: effort } }))
      close()
      return
    }
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
      className={`${styles.option} ${option.current && !activeAcp ? styles.optionCurrent : ''}`}
      role="menuitemradio"
      aria-checked={option.current && !activeAcp}
      title={option.model.name || option.model.id}
      data-dsh-relay-model-entry="true"
      data-dsh-relay-provider={option.provider}
      disabled={option.providerDisabled || busy}
      onClick={() => chooseModel(option)}
    >
      <span className={styles.optionCopy}>
        <span className={styles.modelName}>{option.model.name || option.model.id}</span>
        {option.providerDisabled && <span className={styles.description}>{t('status.providerDisabled')}</span>}
      </span>
      <span className={styles.check} aria-hidden="true">{option.current && !activeAcp && <span className={styles.checkmark} />}</span>
    </button>
  )

  const renderGroup = (label: string, groupOptions: readonly SortedModelOption[], key: string) => (
    <section key={key} role="group" aria-label={label} className={`${styles.group} ${key === PRIMARY_PROVIDER_ID ? styles.primaryProviderGroup : ''}`}>
      <div className={styles.groupTitle}>
        <span>{label}</span>
        {key === PRIMARY_PROVIDER_ID && <span className={styles.recommendedBadge}>{t('menu.recommended')}</span>}
      </div>
      {groupOptions.map(renderOption)}
    </section>
  )

  return (
    <div className={styles.root} ref={rootRef} onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      if (pane !== 'root') {
        setPane('root')
        setDetailPane(null)
      } else close()
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
        data-dsh-relay-model-entry="true"
        data-dsh-relay-provider={activeAcp ? 'antigravity-cli' : state.current?.provider}
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
              {effortChoices.length > 0 && (
                <button type="button" role="menuitem" className={styles.cell} onClick={() => setPane('effort')}>
                  <span className={styles.cellLabel}>{t('menu.effort')}</span>
                  <span className={styles.cellValue}>{effortLabel}</span>
                  <span aria-hidden="true" className={styles.cellChevron} />
                </button>
              )}
              {props.renderSlot?.('model-preferences.menu.options', {
                ...menuControls,
                openPane: (next: { key: string; title: string }) => {
                  setError(null)
                  setDetailPane(next)
                  setPane('detail')
                },
              })}
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
                {acpModels.length > 0 && (
                  <section
                    role="group"
                    aria-label={t('antigravity.group')}
                    className={styles.group}
                    data-dsh-antigravity-group="true"
                  >
                      <div className={styles.groupTitle}>{t('antigravity.group')}</div>
                      {acpModels.map(model => (
                      <button
                        key={model.id}
                        type="button"
                          role="menuitemradio"
                          aria-checked={activeAcp?.modelId === model.id}
                        className={styles.option}
                          title={model.name}
                        data-dsh-antigravity-model={model.id}
                        onClick={() => {
                          close()
                            openAcpModel(model.id)
                            triggerRef.current?.focus()
                        }}
                      >
                        <span className={styles.optionCopy}>
                          <span className={styles.modelName}>{model.name}</span>
                        </span>
                          <span className={styles.check} aria-hidden="true">{activeAcp?.modelId === model.id && <span className={styles.checkmark} />}</span>
                      </button>
                    ))}
                  </section>
                )}
                {relayAccessAvailable && !hasConfiguredRelay && (
                  <section
                    role="group"
                    aria-label={t('relayShowcase.group')}
                    className={`${styles.group} ${styles.primaryProviderGroup}`}
                    data-dsh-relay-showcase="true"
                  >
                    <div className={styles.groupTitle}>
                      <span>{t('relayShowcase.group')}</span>
                      <span className={styles.recommendedBadge}>{t('relayShowcase.badge')}</span>
                    </div>
                    {(['claude', 'gpt', 'multi'] as const).map(tier => (
                      <button
                        key={tier}
                        type="button"
                        role="menuitem"
                        className={styles.option}
                        onClick={() => {
                          close()
                          document.dispatchEvent(new CustomEvent('dsh-relay-sign-in-required', { detail: { source: 'model-picker', tier, autoConnect: false } }))
                        }}
                      >
                        <span className={styles.optionCopy}>
                          <span className={styles.modelName}>{t(`relayShowcase.${tier}Name`)}</span>
                          <span className={styles.description}>{t(`relayShowcase.${tier}Desc`)}</span>
                        </span>
                        <span aria-hidden="true" className={styles.cellChevron} />
                      </button>
                    ))}
                  </section>
                )}
              </div>
              {state.status === 'ready' && options.length === 0 && acpModels.length === 0 && !(relayAccessAvailable && !hasConfiguredRelay) && (
                <div className={styles.empty}>{t('status.empty')}</div>
              )}
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
          {pane === 'detail' && detailPane !== null && (
            <>
              <div className={styles.detailHeader}>
                <button
                  type="button"
                  className={styles.detailBack}
                  aria-label={t('action.back')}
                  onClick={() => {
                    setPane('root')
                    setDetailPane(null)
                  }}
                >
                  {t('action.back')}
                </button>
                <span className={styles.detailTitle}>{detailPane.title}</span>
              </div>
              {error !== null && <div className={styles.error} role="alert"><span>{error}</span></div>}
              <div className={`${styles.groups} scrollable`}>
                {props.renderSlot?.('model-preferences.menu.pane', menuControls, { entryKey: detailPane.key })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
