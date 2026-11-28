import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AcpChatView } from './AcpChatView.tsx'
import { AntigravityAcpStore, acpStore, type AcpEngine, type AcpEngineProbe } from './acpStore.ts'
import css from './AcpChat.module.css'

type Localized = PropsLocale<'llm-antigravity'>
export interface AcpWorkbenchActions {
  registerWorkbench: (open: () => void) => () => void
}

type Props = Localized & AcpWorkbenchActions & {
  conversationId: string
  getCwd?: () => string | undefined
  focusComposer: () => void
}

export const ACP_MODEL_PANE_KEY = 'dsh-acp-engines'
const headers = { 'content-type': 'application/json', 'x-dsh-acp': '1' }

const statusLabels = {
  ready: 'engineReady', installed: 'engineInstalled', 'not-installed': 'engineMissing',
  'not-authenticated': 'engineAuthNeeded', error: 'engineError',
} as const

type SidePaneEntry = { engine: AcpEngine; store: AntigravityAcpStore }
type SidePaneSnapshot = { panes: readonly SidePaneEntry[]; activePane?: string; floating: boolean }

class AcpSidePaneManager {
  private snapshot: SidePaneSnapshot = { panes: [], activePane: undefined, floating: false }
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): SidePaneSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private emit(next: Partial<SidePaneSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) listener()
  }
  open(engine: AcpEngine, cwd?: string, nativeOpened = false) {
    const existing = this.snapshot.panes.find(pane => pane.engine.id === engine.id)
    if (!existing) {
      const store = new AntigravityAcpStore(false)
      this.emit({
        panes: [...this.snapshot.panes, { engine, store }],
        activePane: engine.id,
        floating: !nativeOpened,
      })
      void store.openEngine(engine.id, cwd)
    } else {
      this.emit({ activePane: engine.id, floating: !nativeOpened })
    }
  }
  select(engineId: string) {
    if (this.snapshot.panes.some(pane => pane.engine.id === engineId)) {
      this.emit({ activePane: engineId })
    }
  }
  close(engineId: string) {
    const entry = this.snapshot.panes.find(pane => pane.engine.id === engineId)
    if (entry) void entry.store.disconnect()
    const next = this.snapshot.panes.filter(pane => pane.engine.id !== engineId)
    this.emit({
      panes: next,
      activePane: next.at(-1)?.engine.id,
      floating: next.length > 0 ? this.snapshot.floating : false,
    })
  }
}

export const acpSidePanes = new AcpSidePaneManager()

function useAcpEngineCatalog(enabled: boolean) {
  const [agents, setAgents] = useState<AcpEngine[]>([])
  const [probes, setProbes] = useState<Record<string, AcpEngineProbe>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [checking, setChecking] = useState<string>()

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    async function refresh() {
      setLoading(true)
      setLoadError(false)
      try {
        const response = await fetch('/api/dsh-acp/agents', { headers, signal: controller.signal })
        if (!response.ok) throw new Error(String(response.status))
        const data = await response.json() as { agents: AcpEngine[]; probes: AcpEngineProbe[] }
        if (controller.signal.aborted) return
        setAgents(data.agents)
        setProbes(Object.fromEntries(data.probes.map(probe => [probe.agentId, probe])))
      } catch {
        if (!controller.signal.aborted) setLoadError(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void refresh()
    return () => controller.abort()
  }, [enabled])

  const diagnose = useCallback(async (agent: AcpEngine) => {
    setChecking(agent.id)
    try {
      const response = await fetch('/api/dsh-acp/probe', {
        method: 'POST', headers,
        body: JSON.stringify({ agentId: agent.id, force: true }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const probe = await response.json() as AcpEngineProbe
      setProbes(previous => ({ ...previous, [agent.id]: probe }))
    } catch {
      setProbes(previous => ({ ...previous, [agent.id]: { agentId: agent.id, state: 'error' } }))
    } finally {
      setChecking(undefined)
    }
  }, [])

  return { agents, probes, loading, loadError, checking, diagnose }
}

function SessionOptions({ store, t }: Localized & { store: AntigravityAcpStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const model = state.configOptions.find(option => option.category === 'model')
  return <div className={css.sessionOptions}>
    {state.availableModels.length > 0 && <label>
      <span>{model?.name || t('acpModel')}</span>
      <select disabled={state.busy || state.starting} value={state.selectedModelId ?? ''}
        onChange={event => { if (event.nativeEvent.isTrusted) void store.switchModel(event.target.value) }}>
        {state.availableModels.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>}
    {state.configOptions.filter(option => option !== model && option.options?.length).map(option => <label key={option.id}>
      <span>{option.name || option.id}</span>
      <select disabled={state.busy || state.starting} value={option.currentValue ?? ''}
        onChange={event => { if (event.nativeEvent.isTrusted) void store.setConfigOption(option.id, event.target.value) }}>
        {option.options?.map(choice => <option key={choice.value} value={choice.value}>{choice.name || choice.value}</option>)}
      </select>
    </label>)}
  </div>
}

function AcpSidePaneContent({ engine, store, close, tabs, t, compact = false }: Localized & {
  engine: AcpEngine; store: AntigravityAcpStore; close: () => void; tabs: ReactNode; compact?: boolean
}) {
  const [draft, setDraft] = useState('')
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!compact) closeButton.current?.focus()
  }, [compact])
  return <>
    {!compact && <header className={css.sideHeader}>
      <strong>{engine.name}</strong>
      <button ref={closeButton} type="button" aria-label={t('closeSidePane')} onClick={close}>×</button>
    </header>}
    {tabs}
    <p className={css.sideHint}>{t('descriptionSidePane')}</p>
    <SessionOptions store={store} t={t} />
    <div className={css.sideTranscript} data-conversation-scroll="">
      <AcpChatView store={store} t={t} />
    </div>
    <form className={css.sideInput} onSubmit={event => {
      event.preventDefault()
      if (!event.nativeEvent.isTrusted || !draft.trim() || state.busy || state.starting) return
      const text = draft
      setDraft('')
      void store.sendPrompt(text)
    }}>
      <textarea value={draft} rows={2} onChange={event => setDraft(event.target.value)}
        aria-label={t('acpPrompt')} placeholder={t('acpPrompt')} />
      {state.busy
        ? <button type="button" onClick={() => store.cancelTurn()}>{t('stop')}</button>
        : <button type="submit" disabled={!draft.trim() || state.starting}>{t('send')}</button>}
    </form>
  </>
}

export function AcpNativeSidebarPane({ t, onEmptyClose }: Localized & { onEmptyClose?: () => void }) {
  const side = useSyncExternalStore(acpSidePanes.subscribe, acpSidePanes.getSnapshot, acpSidePanes.getSnapshot)
  const active = side.panes.find(pane => pane.engine.id === side.activePane) ?? side.panes[0]
  if (!active) {
    return <div className={css.nativeSideRoot} data-dsh-acp-native-pane="empty">
      <p className={css.sideHint}>{t('noSidePaneOpen')}</p>
    </div>
  }
  const tabs = side.panes.length > 1 ? <nav className={css.sideTabs} aria-label={t('engines')}>
    {side.panes.map(item => <button key={item.engine.id} type="button" aria-pressed={item.engine.id === active.engine.id}
      onClick={() => acpSidePanes.select(item.engine.id)}>{item.engine.name}</button>)}
  </nav> : null
  return <div className={css.nativeSideRoot} data-dsh-acp-native-pane={active.engine.id}>
    <div className={css.nativeSideTopBar}>
      <strong>{active.engine.name}</strong>
      <button type="button" className={css.nativeSideCloseBtn} aria-label={t('closeSidePane')} onClick={() => {
        const remaining = side.panes.length - 1
        acpSidePanes.close(active.engine.id)
        if (remaining <= 0) onEmptyClose?.()
      }}>×</button>
    </div>
    <AcpSidePaneContent
      engine={active.engine}
      store={active.store}
      close={() => acpSidePanes.close(active.engine.id)}
      tabs={tabs}
      t={t}
      compact
    />
  </div>
}

function AcpEngineList({
  agents, probes, loading, loadError, checking, diagnose,
  current, activeAgentId, activeDiagnosticState, busy, starting,
  onSelectMain, onSelectSide, onReturnDeepSeek, t, compact = false,
}: Localized & {
  agents: AcpEngine[]
  probes: Record<string, AcpEngineProbe>
  loading: boolean
  loadError: boolean
  checking?: string
  diagnose: (agent: AcpEngine) => Promise<void>
  current: boolean
  activeAgentId: string
  activeDiagnosticState?: string
  busy: boolean
  starting: boolean
  onSelectMain: (agent: AcpEngine) => void
  onSelectSide: (agent: AcpEngine) => void
  onReturnDeepSeek: () => void
  compact?: boolean
}) {
  const [copied, setCopied] = useState<string>()
  const isReady = (agent: AcpEngine) => probes[agent.id]?.state === 'ready'
    || probes[agent.id]?.state === 'installed'
    || agent.id === 'antigravity' && activeDiagnosticState === 'ready'

  const engineRow = (agent: AcpEngine) => {
    const probe = probes[agent.id]
    const ready = isReady(agent)
    const isSelected = current && activeAgentId === agent.id
    return <li key={agent.id} className={css.engineRow} data-selected={isSelected || undefined}>
      <div className={css.engineHeading}>
        <button type="button" data-dsh-acp-agent={agent.id} disabled={!ready || busy || starting}
          onClick={event => {
            if (event.nativeEvent.isTrusted) onSelectMain(agent)
          }}>{agent.name}</button>
        <span className={css.engineStatus} data-ready={ready || undefined} title={probe?.authHint ? t('engineAuthFound') : undefined}>
          {probe?.error === 'REQUEST_TIMEOUT' ? t('engineTimedOut') : t(statusLabels[probe?.state ?? 'not-installed'])}
        </span>
      </div>
      <div className={css.engineActions}>
        {ready && <button type="button" onClick={event => {
          if (event.nativeEvent.isTrusted) onSelectSide(agent)
        }}>{t(compact ? 'openSideShort' : 'openSidePane')}</button>}
        <button type="button" disabled={Boolean(checking)} onClick={event => {
          if (event.nativeEvent.isTrusted) void diagnose(agent)
        }}>{t('diagnoseEngine')}</button>
        {!ready && agent.installCommand && <button type="button" onClick={event => {
          if (!event.nativeEvent.isTrusted || !agent.installCommand) return
          void navigator.clipboard?.writeText(agent.installCommand).then(() => setCopied(agent.id), () => setCopied(undefined))
        }}>{t(copied === agent.id ? 'copied' : 'copy')}</button>}
      </div>
    </li>
  }

  return <>
    {loading && <p role="status">{t('enginesLoading')}</p>}
    {loadError && <p role="alert">{t('enginesUnavailable')}</p>}
    {current && <button type="button" className={css.returnPrimary} onClick={onReturnDeepSeek}>{t('returnToDeepSeek')}</button>}
    {current && activeAgentId !== 'antigravity' && <SessionOptions store={acpStore} t={t} />}
    <ul className={css.engineList}>{agents.filter(isReady).map(engineRow)}</ul>
    {agents.some(agent => !isReady(agent)) && <details className={css.discoverDetails}>
      <summary>{t('discoverEngines')}</summary>
      <ul className={css.engineList}>{agents.filter(agent => !isReady(agent)).map(engineRow)}</ul>
    </details>}
  </>
}

export function AcpModelMenuOption({
  sessionId, locked, openPane, dismiss, openFallbackWorkbench, t,
}: Localized & {
  sessionId?: string
  locked: boolean
  openPane?: (pane: { key: string; title: string }) => void
  dismiss: () => void
  openFallbackWorkbench?: (sessionId: string) => void
}) {
  const active = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const current = active.active && Boolean(sessionId) && active.conversationId === String(sessionId)
  return (
    <button
      type="button"
      role="menuitem"
      className={css.modelMenuOption}
      data-model-menu-pane={ACP_MODEL_PANE_KEY}
      data-dsh-acp-menu-entry="true"
      disabled={locked}
      onClick={() => {
        if (typeof openPane === 'function') {
          openPane({ key: ACP_MODEL_PANE_KEY, title: t('localAgents') })
        } else {
          dismiss()
          if (sessionId) openFallbackWorkbench?.(String(sessionId))
        }
      }}
    >
      <span>{t('localAgents')}</span>
      <span className={css.modelMenuOptionMeta}>
        {current ? active.agentId : t('engines')}
      </span>
    </button>
  )
}

export function AcpModelMenuPane({
  sessionId, dismiss, getCwd, openNativeSidePane, t,
}: Localized & {
  sessionId?: string
  dismiss: () => void
  getCwd?: () => string | undefined
  openNativeSidePane?: () => boolean
}) {
  const active = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const { agents, probes, loading, loadError, checking, diagnose } = useAcpEngineCatalog(true)
  const conversationId = sessionId ? String(sessionId) : ''
  const current = active.active && Boolean(conversationId) && active.conversationId === conversationId

  return (
    <div className={css.modelMenuPane} data-dsh-acp-model-pane="true">
      <AcpEngineList
        agents={agents}
        probes={probes}
        loading={loading}
        loadError={loadError}
        checking={checking}
        diagnose={diagnose}
        current={current}
        activeAgentId={active.agentId}
        activeDiagnosticState={active.diagnostic?.state}
        busy={active.busy}
        starting={active.starting}
        compact
        t={t}
        onReturnDeepSeek={() => { acpStore.closeToNormalChat(); dismiss() }}
        onSelectMain={agent => {
          dismiss()
          if (conversationId) void acpStore.openEngine(agent.id, getCwd?.(), conversationId)
        }}
        onSelectSide={agent => {
          dismiss()
          const nativeOpened = openNativeSidePane?.() ?? false
          acpSidePanes.open(agent, getCwd?.(), nativeOpened)
        }}
      />
    </div>
  )
}

export function AcpEnginePicker({ conversationId, getCwd, registerWorkbench, focusComposer, openNativeSidePane, t }: Props & { openNativeSidePane?: () => boolean }) {
  const active = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const side = useSyncExternalStore(acpSidePanes.subscribe, acpSidePanes.getSnapshot, acpSidePanes.getSnapshot)
  const [menuOpen, setMenuOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const { agents, probes, loading, loadError, checking, diagnose } = useAcpEngineCatalog(menuOpen)
  const current = active.active && active.conversationId === conversationId

  useLayoutEffect(() => registerWorkbench(() => setMenuOpen(true)), [registerWorkbench])
  useLayoutEffect(() => {
    const node = dialog.current
    if (!menuOpen || !node) return
    node.showModal()
    return () => node.close()
  }, [menuOpen])

  const closePicker = () => {
    dialog.current?.close()
    setMenuOpen(false)
    focusComposer()
  }

  return <>
    {menuOpen && createPortal(
      <dialog ref={dialog} className={css.engineMenu} data-dsh-acp-workbench="" aria-label={t('engines')}
        onCancel={event => { event.preventDefault(); closePicker() }}
        onClick={event => {
          if (event.target !== event.currentTarget) return
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePicker()
        }}>
        <header className={css.sideHeader}>
          <strong>{t('engines')}</strong>
          <button type="button" aria-label={t('closeWorkbench')} onClick={closePicker}>×</button>
        </header>
        <AcpEngineList
          agents={agents}
          probes={probes}
          loading={loading}
          loadError={loadError}
          checking={checking}
          diagnose={diagnose}
          current={current}
          activeAgentId={active.agentId}
          activeDiagnosticState={active.diagnostic?.state}
          busy={active.busy}
          starting={active.starting}
          t={t}
          onReturnDeepSeek={() => { acpStore.closeToNormalChat(); closePicker() }}
          onSelectMain={agent => {
            closePicker()
            void acpStore.openEngine(agent.id, getCwd?.(), conversationId)
          }}
          onSelectSide={agent => {
            closePicker()
            const nativeOpened = openNativeSidePane?.() ?? false
            acpSidePanes.open(agent, getCwd?.(), nativeOpened)
          }}
        />
      </dialog>, document.body)}
    {side.floating && side.panes.length > 0 && createPortal(side.panes.map(pane => (
      <aside key={pane.engine.id} className={css.sidePane} hidden={pane.engine.id !== side.activePane}
        aria-label={pane.engine.name} data-dsh-acp-side-pane=""
        onKeyDown={event => {
          if (event.key === 'Escape') {
            acpSidePanes.close(pane.engine.id)
            if (side.panes.length <= 1) focusComposer()
          }
        }}>
        <AcpSidePaneContent
          engine={pane.engine}
          store={pane.store}
          close={() => {
            acpSidePanes.close(pane.engine.id)
            if (side.panes.length <= 1) focusComposer()
          }}
          tabs={side.panes.length > 1 && <nav className={css.sideTabs} aria-label={t('engines')}>
            {side.panes.map(item => <button key={item.engine.id} type="button" aria-pressed={item.engine.id === side.activePane}
              onClick={() => acpSidePanes.select(item.engine.id)}>{item.engine.name}</button>)}
          </nav>}
          t={t}
        />
      </aside>
    )), document.body)}
  </>
}
