import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
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
const headers = { 'content-type': 'application/json', 'x-dsh-acp': '1' }

const statusLabels = {
  ready: 'engineReady', installed: 'engineInstalled', 'not-installed': 'engineMissing',
  'not-authenticated': 'engineAuthNeeded', error: 'engineError',
} as const

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

function AcpSidePane({ engine, store, close, active, tabs, t }: Localized & {
  engine: AcpEngine; store: AntigravityAcpStore; close: () => void; active: boolean; tabs: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active) closeButton.current?.focus()
  }, [active])
  useEffect(() => {
    return () => { void store.disconnect() }
  }, [store])
  return <aside className={css.sidePane} hidden={!active} aria-label={engine.name} data-dsh-acp-side-pane=""
    onKeyDown={event => { if (event.key === 'Escape') close() }}>
    <header className={css.sideHeader}>
      <strong>{engine.name}</strong>
      <button ref={closeButton} type="button" aria-label={t('closeSidePane')} onClick={close}>×</button>
    </header>
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
  </aside>
}

export function AcpEnginePicker({ conversationId, getCwd, registerWorkbench, focusComposer, t }: Props) {
  const active = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const [agents, setAgents] = useState<AcpEngine[]>([])
  const [probes, setProbes] = useState<Record<string, AcpEngineProbe>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [checking, setChecking] = useState<string>()
  const [copied, setCopied] = useState<string>()
  const [panes, setPanes] = useState<Array<{ engine: AcpEngine; store: AntigravityAcpStore }>>([])
  const [activePane, setActivePane] = useState<string>()
  const [menuOpen, setMenuOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const current = active.active && active.conversationId === conversationId
  const selected = current ? agents.find(agent => agent.id === active.agentId) : undefined

  useLayoutEffect(() => registerWorkbench(() => setMenuOpen(true)), [registerWorkbench])
  useLayoutEffect(() => {
    const node = dialog.current
    if (!menuOpen || !node) return
    node.showModal()
    return () => node.close()
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
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
  }, [menuOpen])

  async function diagnose(agent: AcpEngine) {
    setChecking(agent.id)
    try {
      const response = await fetch('/api/dsh-acp/probe', {
        method: 'POST', headers,
        body: JSON.stringify({ agentId: agent.id, cwd: getCwd?.(), force: true }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const probe = await response.json() as AcpEngineProbe
      setProbes(previous => ({ ...previous, [agent.id]: probe }))
    } catch {
      setProbes(previous => ({ ...previous, [agent.id]: { agentId: agent.id, state: 'error' } }))
    } finally {
      setChecking(undefined)
    }
  }

  const ready = (agent: AcpEngine) => probes[agent.id]?.state === 'ready'
    || probes[agent.id]?.state === 'installed'
    || agent.id === 'antigravity' && active.diagnostic?.state === 'ready'

  const closePicker = () => {
    dialog.current?.close()
    setMenuOpen(false)
    focusComposer()
  }
  const openPane = (engine: AcpEngine) => {
    if (!panes.some(pane => pane.engine.id === engine.id)) {
      const store = new AntigravityAcpStore(false)
      setPanes(current => [...current, { engine, store }])
      void store.openEngine(engine.id, getCwd?.())
    }
    setActivePane(engine.id)
  }
  const closePane = (engineId: string) => {
    const current = panes.filter(pane => pane.engine.id !== engineId)
    setPanes(current)
    setActivePane(current.at(-1)?.engine.id)
    if (!current.length) focusComposer()
  }
  const engineRow = (agent: AcpEngine) => {
    const probe = probes[agent.id]
    const isReady = ready(agent)
    return <li key={agent.id} className={css.engineRow}>
      <div className={css.engineHeading}>
        <button type="button" data-dsh-acp-agent={agent.id} disabled={!isReady || active.busy || active.starting}
          onClick={event => {
            if (!event.nativeEvent.isTrusted) return
            closePicker()
            void acpStore.openEngine(agent.id, getCwd?.(), conversationId)
          }}>{agent.name}</button>
        <span className={css.engineStatus} data-ready={isReady || undefined} title={probe?.authHint ? t('engineAuthFound') : undefined}>
          {probe?.error === 'REQUEST_TIMEOUT' ? t('engineTimedOut') : t(statusLabels[probe?.state ?? 'not-installed'])}
        </span>
      </div>
      <div className={css.engineActions}>
        {isReady && <button type="button" onClick={event => {
          if (!event.nativeEvent.isTrusted) return
          closePicker()
          openPane(agent)
        }}>{t('openSidePane')}</button>}
        <button type="button" disabled={Boolean(checking)} onClick={event => {
          if (event.nativeEvent.isTrusted) void diagnose(agent)
        }}>{t('diagnoseEngine')}</button>
        {!isReady && agent.installCommand && <button type="button" onClick={event => {
          if (!event.nativeEvent.isTrusted || !agent.installCommand) return
          void navigator.clipboard?.writeText(agent.installCommand).then(() => setCopied(agent.id), () => setCopied(undefined))
        }}>{t(copied === agent.id ? 'copied' : 'copy')}</button>}
      </div>
    </li>
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
        {loading && <p role="status">{t('enginesLoading')}</p>}
        {loadError && <p role="alert">{t('enginesUnavailable')}</p>}
        {current && <button type="button" onClick={() => { acpStore.closeToNormalChat(); closePicker() }}>{t('returnToDeepSeek')}</button>}
        {current && selected?.id !== 'antigravity' && <SessionOptions store={acpStore} t={t} />}
        <ul>{agents.filter(ready).map(engineRow)}</ul>
        {agents.some(agent => !ready(agent)) && <details>
          <summary>{t('discoverEngines')}</summary>
          <ul>{agents.filter(agent => !ready(agent)).map(engineRow)}</ul>
        </details>}
      </dialog>, document.body)}
    {panes.length > 0 && createPortal(panes.map(pane => <AcpSidePane key={pane.engine.id}
      engine={pane.engine} store={pane.store} active={pane.engine.id === activePane}
      close={() => closePane(pane.engine.id)} t={t}
      tabs={panes.length > 1 && <nav className={css.sideTabs} aria-label={t('engines')}>
        {panes.map(item => <button key={item.engine.id} type="button" aria-pressed={item.engine.id === activePane}
          onClick={() => setActivePane(item.engine.id)}>{item.engine.name}</button>)}
      </nav>}
    />), document.body)}
  </>
}
