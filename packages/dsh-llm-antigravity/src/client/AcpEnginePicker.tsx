import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AcpChatView } from './AcpChatView.tsx'
import { AntigravityAcpStore, acpStore, type AcpEngine, type AcpEngineProbe } from './acpStore.ts'
import css from './AcpChat.module.css'

type Localized = PropsLocale<'llm-antigravity'>
type Props = Localized & { conversationId: string; getCwd?: () => string | undefined }
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

export function AcpEnginePicker({ conversationId, getCwd, t }: Props) {
  const active = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const menuId = useId()
  const [agents, setAgents] = useState<AcpEngine[]>([])
  const [probes, setProbes] = useState<Record<string, AcpEngineProbe>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [checking, setChecking] = useState<string>()
  const [copied, setCopied] = useState<string>()
  const [panes, setPanes] = useState<Array<{ engine: AcpEngine; store: AntigravityAcpStore }>>([])
  const [activePane, setActivePane] = useState<string>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<CSSProperties>()
  const detail = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const current = active.active && active.conversationId === conversationId
  const selected = current ? agents.find(agent => agent.id === active.agentId) : undefined

  useLayoutEffect(() => {
    if (!menuOpen) return
    const positionMenu = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      if (!anchor) return
      const width = Math.min(336, window.innerWidth - 32)
      const showAbove = anchor.top > window.innerHeight - anchor.bottom
      const left = Math.min(Math.max(16, anchor.right - width), window.innerWidth - width - 16)
      setMenuPosition({
        left, width,
        ...(showAbove ? { bottom: window.innerHeight - anchor.top + 8 } : { top: anchor.bottom + 8 }),
        maxHeight: Math.max(80, Math.min(460, (showAbove ? anchor.top : window.innerHeight - anchor.bottom) - 20)),
      })
    }
    const onOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && (detail.current?.contains(event.target) || menu.current?.contains(event.target))) return
      if (detail.current) detail.current.open = false
      setMenuOpen(false)
    }
    positionMenu()
    menu.current?.focus({ preventScroll: true })
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    window.addEventListener('pointerdown', onOutsideClick, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
      window.removeEventListener('pointerdown', onOutsideClick, true)
    }
  }, [menuOpen])

  async function refresh() {
    if (loading) return
    setLoading(true)
    setLoadError(false)
    try {
      const response = await fetch('/api/dsh-acp/agents', { headers })
      if (!response.ok) throw new Error(String(response.status))
      const data = await response.json() as { agents: AcpEngine[]; probes: AcpEngineProbe[] }
      setAgents(data.agents)
      setProbes(Object.fromEntries(data.probes.map(probe => [probe.agentId, probe])))
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

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
    if (detail.current) detail.current.open = false
    setMenuOpen(false)
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
    if (!current.length) trigger.current?.focus()
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
    <details ref={detail} className={css.enginePicker} onToggle={event => {
      if (event.target !== event.currentTarget) return
      setMenuOpen(event.currentTarget.open)
      if (event.currentTarget.open) void refresh()
    }}
      onKeyDown={event => { if (event.key === 'Escape') { closePicker(); trigger.current?.focus() } }}>
      <summary ref={trigger} data-dsh-acp-engines="" aria-label={t('engines')} aria-controls={menuId}>
        {selected?.name ?? t('engines')}
      </summary>
      {menuOpen && createPortal(<div ref={menu} id={menuId} className={css.engineMenu}
        style={menuPosition} role="group" tabIndex={-1} aria-label={t('engines')}>
        {loading && <p role="status">{t('enginesLoading')}</p>}
        {loadError && <p role="alert">{t('enginesUnavailable')}</p>}
        {current && <button type="button" onClick={() => { acpStore.closeToNormalChat(); closePicker() }}>{t('returnToDeepSeek')}</button>}
        {current && selected?.id !== 'antigravity' && <SessionOptions store={acpStore} t={t} />}
        <ul>{agents.filter(ready).map(engineRow)}</ul>
        {agents.some(agent => !ready(agent)) && <details>
          <summary>{t('discoverEngines')}</summary>
          <ul>{agents.filter(agent => !ready(agent)).map(engineRow)}</ul>
        </details>}
      </div>, document.body)}
    </details>
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
