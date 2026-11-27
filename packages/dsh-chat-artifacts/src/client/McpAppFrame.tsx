import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { McpUiHostContext, McpUiStyles } from '@modelcontextprotocol/ext-apps'
import type { PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  asObject, McpAppError, MCP_APP_API, MCP_APP_MIME, MCP_APP_TIMEOUT, MCP_APP_USER_REJECTED, readMcpAppPayload,
  type JsonRecord, type McpAppDescriptor, type McpAppPayload,
} from '../core/mcp-apps.ts'
import { canRunArtifactScripts } from './frame-document.ts'
import { buildMcpAppDocument, readMcpAppFrameMessage, sendMcpAppFrameMessage } from './mcp-app-document.ts'
import { createMcpAppProtocol } from './mcp-app-protocol.ts'
import { useArtifactTheme } from './theme-bridge.ts'
import css from './artifact.module.css'

type Translate = TranslateNS<'chat-artifacts'>
type InputActions = PropsRuntime<'conversation.input.left'>['inputActions']
type Teardown = (reason: string) => Promise<void>

const headers = { 'x-dsh-mcp-apps': '1', 'content-type': 'application/json' }
const rejectByUser = () => new McpAppError(MCP_APP_USER_REJECTED, 'USER_REJECTED')

function themeVariables(theme: ReturnType<typeof useArtifactTheme>): McpUiStyles {
  const variables = {
    '--color-background-primary': theme.tokens['--ui-bg'],
    '--color-background-secondary': theme.tokens['--ui-surface'],
    '--color-text-primary': theme.tokens['--ui-text'],
    '--color-text-secondary': theme.tokens['--ui-text-muted'],
    '--color-border-primary': theme.tokens['--ui-border'],
    '--color-ring-primary': theme.tokens['--ui-accent'],
    '--font-sans': window.getComputedStyle(document.body).fontFamily,
    '--border-radius-md': theme.tokens['--ui-radius'],
  } satisfies Partial<McpUiStyles>
  // SEP-1865 lets hosts omit variables they do not provide.
  return variables as McpUiStyles
}

class NativeAppApprovalNeeded extends McpAppError {
  constructor(readonly challengeId: string) { super(-32002, 'Native approval required') }
}

async function appRequest(path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(MCP_APP_API + path, { ...init, signal, headers, credentials: 'same-origin', cache: 'no-store' })
  const data = asObject(await response.json())
  if (!response.ok) {
    const error = asObject(data?.error)
    if (response.status === 409 && error?.code === -32002 && typeof data?.challengeId === 'string') {
      throw new NativeAppApprovalNeeded(data.challengeId)
    }
    throw new McpAppError(typeof error?.code === 'number' ? error.code : -32000,
      typeof error?.message === 'string' ? error.message : 'App request failed')
  }
  return data?.result
}

const useDesktopSandbox = () => typeof window !== 'undefined' && window.self === window.top
  && window.location.protocol === 'dsh-runtime:'
  && canRunArtifactScripts(window.location, (window as Window & { __dshArtifactSandboxGuarded?: boolean }).__dshArtifactSandboxGuarded === true)

export function McpAppCard({ app, t, inputActions }: { app: McpAppDescriptor; t: Translate; inputActions?: InputActions }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const teardown = useRef<Teardown>()
  const [fullscreen, setFullscreen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [visible, setVisible] = useState(true)
  const [network, setNetwork] = useState(false)
  const [revision, setRevision] = useState(0)
  const [resource, setResource] = useState<McpAppPayload>()
  const [loadError, setLoadError] = useState(false)
  const canMount = useDesktopSandbox()
  const afterTeardown = useCallback((reason: string, change: () => void) => {
    const current = teardown.current
    if (current) void current(reason).then(change)
    else change()
  }, [])
  const reload = useCallback(() => {
    setResource(undefined)
    setRevision(value => value + 1)
  }, [])

  useEffect(() => {
    if (!canMount || !visible || collapsed) return
    const abort = new AbortController()
    setLoadError(false)
    setResource(undefined)
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(MCP_APP_TIMEOUT)])
    const path = '/resource/' + app.handle + '?sessionId=' + encodeURIComponent(app.sessionId)
    void appRequest(path, {}, signal).then(value => {
      if (abort.signal.aborted) return
      const payload = readMcpAppPayload(value)
      if (!payload) throw new Error('Invalid MCP App resource')
      setResource(payload)
    }).catch(() => { if (!abort.signal.aborted) setLoadError(true) })
    return () => abort.abort()
  }, [app.handle, app.sessionId, canMount, collapsed, revision, visible])

  useEffect(() => {
    if (!dialog.current || typeof IntersectionObserver !== 'function') return
    let disposed = false
    let inRange = true
    let draining = false
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]) return
      inRange = entries[0].isIntersecting
      if (draining) return
      if (inRange) setVisible(true)
      else {
        draining = true
        afterTeardown('offscreen', () => {
          draining = false
          if (disposed) return
          setVisible(inRange)
          if (inRange) reload()
          else setResource(undefined)
        })
      }
    }, { rootMargin: '800px 0px' })
    observer.observe(dialog.current)
    return () => { disposed = true; observer.disconnect() }
  }, [afterTeardown, reload])

  useLayoutEffect(() => {
    const node = dialog.current
    if (!node) return
    if (fullscreen && !node.open) node.showModal()
    else if (!fullscreen && node.open) node.close()
  }, [fullscreen])

  const domains = resource ? [...new Set([...resource.connectDomains, ...resource.resourceDomains])] : []
  const unavailable = !canMount || loadError
  return <dialog ref={dialog} className={css.mcpAppCard} data-mcp-app-card="" data-mcp-app-server={app.server}
    aria-label={app.title} onClose={() => setFullscreen(false)} onCancel={() => setFullscreen(false)}>
    <header className={css.mcpAppHeader}>
      <div>
        <span className={css.mcpAppBadge}>MCP App</span>
        <strong>{app.title}</strong>
        <span className={css.mcpAppServer}>{app.server}</span>
      </div>
      <div>
        <button type="button" className={css.actionButton} onClick={() => afterTeardown('reload', reload)}>{t('mcp.reload')}</button>
        <button type="button" className={css.actionButton} onClick={() => setFullscreen(value => !value)}>{t(fullscreen ? 'card.close' : 'card.fullscreen')}</button>
        <button type="button" className={css.actionButton} aria-expanded={!collapsed}
          onClick={() => afterTeardown('collapse', () => {
            if (!collapsed) setResource(undefined)
            setCollapsed(!collapsed)
          })}>{t(collapsed ? 'card.expand' : 'card.collapse')}</button>
      </div>
    </header>
    {!collapsed && <>
      {domains.length > 0 && <div className={css.mcpAppStatus}>
        <span>{t(network ? 'mcp.networkAllowed' : 'mcp.networkBlocked')}</span>
        <span className={css.mcpAppDomains}>{domains.join(', ')}</span>
        <button type="button" className={css.actionButton} onClick={() => afterTeardown('network-policy', () => setNetwork(!network))}>
          {t(network ? 'mcp.revokeNetwork' : 'mcp.allowNetwork')}
        </button>
      </div>}
      {visible && resource && !unavailable
        ? <McpAppView key={app.handle + ':' + revision + ':' + network} app={app} resource={resource} inputActions={inputActions}
          network={network} fullscreen={fullscreen} setFullscreen={setFullscreen} setCollapsed={setCollapsed} teardown={teardown} t={t} />
        : <p className={css.mcpAppStatus} role="status">
          {unavailable ? t('mcp.unavailable') : !visible ? t('card.frameUnloaded') : t('mcp.loading')}
        </p>}
      <details className={css.mcpAppRaw}><summary>{t('mcp.rawResult')}</summary><pre><code>{app.resultPreview}</code></pre></details>
    </>}
  </dialog>
}

function McpAppView({ app, resource, network, fullscreen, setFullscreen, setCollapsed, teardown, t, inputActions }: {
  app: McpAppDescriptor
  resource: McpAppPayload
  network: boolean
  fullscreen: boolean
  setFullscreen(value: boolean): void
  setCollapsed(value: boolean): void
  teardown: MutableRefObject<Teardown | undefined>
  t: Translate
  inputActions?: InputActions
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const bridge = useRef<ReturnType<typeof createMcpAppProtocol>>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'rejected' | 'script-error'>('loading')
  const [diagnostic, setDiagnostic] = useState('')
  const [height, setHeight] = useState(420)
  const [pending, setPending] = useState<{ name: string; finish(allow: boolean): void }>()
  const currentApproval = useRef<{ name: string; finish(allow: boolean): void }>()
  const theme = useArtifactTheme(true)
  const token = useMemo(() => window.crypto.randomUUID(), [])
  const source = useMemo(() => buildMcpAppDocument(resource, token, network), [network, resource, token])
  const context: McpUiHostContext = {
    theme: theme.scheme, platform: 'desktop', locale: document.documentElement.lang || navigator.language, displayMode: fullscreen ? 'fullscreen' : 'inline',
    availableDisplayModes: ['inline', 'fullscreen'],
    styles: { variables: themeVariables(theme) },
    containerDimensions: { maxHeight: 3200 },
  }
  const hostContext = useRef(context)
  hostContext.current = context
  const input = useRef(inputActions)
  input.current = inputActions
  const translate = useRef(t)
  translate.current = t
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen

  useLayoutEffect(() => {
    let heightTimer: ReturnType<typeof setTimeout> | undefined
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    const appScope = { handle: app.handle, sessionId: app.sessionId }
    const post = (route: string, data: JsonRecord, signal: AbortSignal) =>
      appRequest(route, { method: 'POST', body: JSON.stringify({ ...appScope, ...data }) }, signal)
    const callTool = async (name: string, args: JsonRecord, signal: AbortSignal) => {
      const request = { name, arguments: args }
      try {
        return await post('/call-tool', request, signal)
      } catch (error) {
        if (!(error instanceof NativeAppApprovalNeeded)) throw error
        const native = window as Window & { dshDesktop?: { confirmMcpAppTool?(id: string): Promise<string | undefined> } }
        const approvalProof = await native.dshDesktop?.confirmMcpAppTool?.(error.challengeId)
        signal.throwIfAborted()
        if (!approvalProof) throw rejectByUser()
        return post('/call-tool', { ...request, challengeId: error.challengeId, approvalProof }, signal)
      }
    }
    const ask = (name: string, signal: AbortSignal): Promise<boolean> => {
      if (currentApproval.current || signal.aborted) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const abort = () => finish(false)
        const finish = (allowed: boolean) => {
          signal.removeEventListener('abort', abort)
          if (currentApproval.current?.finish === finish) {
            currentApproval.current = undefined
            setPending(undefined)
          }
          resolve(allowed)
        }
        signal.addEventListener('abort', abort, { once: true })
        currentApproval.current = { name, finish }
        setPending(currentApproval.current)
      })
    }
    const session = createMcpAppProtocol({
      send: message => sendMcpAppFrameMessage(frame.current?.contentWindow, token, message),
      input: resource.input, result: resource.result, hostContext: hostContext.current,
      network: network ? { connectDomains: resource.connectDomains, resourceDomains: resource.resourceDomains } : undefined,
      initialized: () => { clearTimeout(readyTimer); setStatus('ready') },
      scriptFailed(message) {
        clearTimeout(readyTimer)
        setDiagnostic(message)
        setStatus('script-error')
        void session.teardown('script-error').then(() => session.dispose())
      },
      teardownRequested() { void session.teardown('app-request').then(() => setCollapsed(true)) },
      resize(next) {
        clearTimeout(heightTimer)
        heightTimer = setTimeout(() => setHeight(next), 80)
      },
      display(mode) {
        if (mode === 'pip') return fullscreenRef.current ? 'fullscreen' : 'inline'
        setFullscreen(mode === 'fullscreen')
        return mode
      },
      async call(name, args, signal) {
        try {
          if (!resource.readOnlyTools.includes(name) && !await ask(name, signal)) throw rejectByUser()
          const result = await callTool(name, args, signal)
          setStatus('ready')
          return result
        } catch (error) {
          if (error instanceof McpAppError && error.code === MCP_APP_USER_REJECTED) setStatus('rejected')
          throw error
        }
      },
      context: (params, signal) => post('/context', { context: params }, signal),
      async openLink(raw, signal) {
        let url: URL
        try { url = new URL(raw) } catch { throw new McpAppError(-32602, 'Invalid URL') }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new McpAppError(-32602, 'Invalid URL')
        if (!await ask(url.origin, signal)) throw rejectByUser()
        const state = window as Window & { dshDesktop?: { openExternalUrl(url: string): Promise<unknown> } }
        if (!state.dshDesktop) throw new McpAppError(-32000, 'Link opening is unavailable')
        await state.dshDesktop.openExternalUrl(url.href)
        return {}
      },
      async message(params, signal) {
        const content = Array.isArray(params.content) ? params.content : [params.content]
        const text = content.slice(0, 32).flatMap(item => {
          const block = asObject(item)
          return block?.type === 'text' && typeof block.text === 'string' ? [block.text] : []
        }).join('\n').slice(0, 8000)
        const actions = input.current
        if (!actions || params.role !== 'user' || !text.trim()) throw new McpAppError(-32602, 'Invalid message')
        if (!await ask(translate.current('mcp.insertMessage'), signal)) throw rejectByUser()
        if (!actions.insertText('\n' + text + '\n', actions.captureInsertion())) throw new McpAppError(-32000, 'Composer unavailable')
        return {}
      },
      async read(uri, signal) {
        if (uri === app.resourceUri) return { contents: [{ uri, mimeType: MCP_APP_MIME, text: resource.html }] }
        return post('/read-resource', { uri }, signal)
      },
    })
    bridge.current = session
    teardown.current = reason => session.teardown(reason)
    readyTimer = setTimeout(() => setStatus('error'), MCP_APP_TIMEOUT)
    const receive = (event: MessageEvent<unknown>) => {
      const sourceWindow = frame.current?.contentWindow
      if (!sourceWindow) return
      const message = readMcpAppFrameMessage(event, sourceWindow, token)
      if (message !== undefined) void session.receive(message)
    }
    window.addEventListener('message', receive)
    return () => {
      void session.teardown('unmount')
      window.removeEventListener('message', receive)
      clearTimeout(heightTimer)
      clearTimeout(readyTimer)
      session.dispose()
      currentApproval.current?.finish(false)
      bridge.current = undefined
      teardown.current = undefined
    }
  }, [app.handle, app.resourceUri, app.sessionId, network, resource, setCollapsed, setFullscreen, teardown, token])

  useEffect(() => { bridge.current?.setHostContext(hostContext.current) }, [context.locale, fullscreen, theme])

  return <>
    {pending && <div role="alert" className={css.mcpAppStatus} data-mcp-app-approval="">
      <span>{t('mcp.approval', { action: pending.name })}</span>
      <button type="button" className={css.actionButton} data-mcp-app-continue="" onClick={() => pending.finish(true)}>{t('mcp.continue')}</button>
      <button type="button" className={css.actionButton} data-mcp-app-deny="" onClick={() => pending.finish(false)}>{t('mcp.deny')}</button>
    </div>}
    {status !== 'ready' && status !== 'script-error' && <p role="status" className={css.mcpAppStatus}>{t({
      loading: 'mcp.loading', error: 'mcp.timeout', rejected: 'mcp.rejected',
    }[status] as 'mcp.loading' | 'mcp.timeout' | 'mcp.rejected')}</p>}
    {status === 'script-error' && <details className={css.mcpAppRaw}><summary>{t('mcp.scriptFailed')}</summary><pre>{diagnostic}</pre></details>}
    <iframe ref={frame} className={css.mcpAppFrame} data-mcp-app-sandbox="" title={app.title}
      sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={source} style={{ height }} hidden={status === 'error' || status === 'script-error'} />
  </>
}
